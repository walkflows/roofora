import { NextResponse } from "next/server";
import { PHOTO_RULES } from "@/lib/enquiry/contract";
import { callN8n } from "@/lib/server/n8n";
import { readPhotoToken } from "@/lib/server/photoToken";
import { allow, clientIp } from "@/lib/server/throttle";

// One photo per request, already shrunk in the browser, so every request
// stays well under Vercel's 4.5 MB body limit. The enquiry is saved before
// any photo is sent; a failed photo never affects the saved enquiry.

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    ext: "png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

function fail(status: number, error: string, retryable = false) {
  return NextResponse.json({ ok: false, error, retryable }, { status });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > PHOTO_RULES.maxUploadBytes + 64_000) {
    return fail(413, "This photo is too large to upload.");
  }
  if (!allow(`photo:${clientIp(request)}`, 15, 10 * 60_000)) {
    return fail(429, "Too many uploads. Please wait a few minutes and try again.", true);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Invalid upload.");
  }

  const grant = readPhotoToken(form.get("token"));
  if (!grant) {
    return fail(403, "This upload link has expired. Your enquiry is saved — you can email photos to us instead.");
  }

  const slot = Number(form.get("slot"));
  if (!Number.isInteger(slot) || slot < 1 || slot > Math.min(grant.n, PHOTO_RULES.maxFiles)) {
    return fail(400, "Invalid photo number.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No photo received.");
  if (file.size > PHOTO_RULES.maxUploadBytes) return fail(413, "This photo is too large to upload.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.test(bytes));
  if (!kind) return fail(415, "Only JPG, PNG or WebP photos can be uploaded.");

  const result = await callN8n(
    "photo",
    {
      submissionId: grant.sid,
      leadRecordId: grant.rid,
      enquiryRef: grant.ref,
      slot,
      filename: `${grant.ref}-photo-${slot}.${kind.ext}`,
      contentType: kind.type,
      size: bytes.length,
      dataBase64: Buffer.from(bytes).toString("base64"),
      retry: form.get("retry") === "1",
    },
    45_000
  );

  switch (result.kind) {
    case "ok":
      return NextResponse.json({ ok: true, status: result.data.status ?? "uploaded" });
    case "rejected":
      return fail(400, String(result.data.error ?? "This photo could not be accepted."));
    case "unconfigured":
      return fail(503, "Photo upload is not available right now. Your enquiry is saved.");
    default:
      return fail(502, "This photo didn't upload. Your enquiry is saved — please try this photo again.", true);
  }
}

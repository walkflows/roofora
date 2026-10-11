// Browser-only. Re-draws a photo onto a canvas and saves it as JPEG so that:
//  - every upload fits the server limit (PHOTO_RULES.maxUploadBytes), and
//  - hidden metadata such as GPS location (EXIF) is removed before upload.

import { PHOTO_RULES } from "./contract";

const MAX_EDGE = 2400;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" could not be read as an image.`);
  }

  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot prepare photos for upload.");
      ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.75, 0.65]) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= PHOTO_RULES.maxUploadBytes) return blob;
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error(`"${file.name}" could not be made small enough to upload.`);
}

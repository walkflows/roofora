"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CONTACT_DETAILS, TEL_HREF } from "@/lib/config";
import { SERVICE_OPTIONS } from "@/lib/content";
import {
  CONSENT_WORDING,
  CONTACT_METHODS,
  LIMITS,
  PHOTO_RULES,
  PHOTO_SAFETY_NOTICE,
  PROPERTY_TYPES,
  URGENCY_OPTIONS,
  URGENT_NOTICE,
  URGENT_VALUE,
  checkPickedPhoto,
  validateEnquiry,
  type EnquiryInput,
  type FieldErrors,
} from "@/lib/enquiry/contract";
import { shrinkPhoto } from "@/lib/enquiry/shrinkPhoto";

type Phase = "editing" | "submitting" | "saved";
type UploadState = "waiting" | "uploading" | "done" | "failed";

interface PickedPhoto {
  key: string;
  file: File;
  previewUrl: string;
  upload: UploadState;
  uploadError?: string;
  canRetry?: boolean;
}

interface SavedInfo {
  enquiryRef: string | null;
  preferredContact: "Phone" | "Email";
  photoToken: string | null;
  photosUnavailable: boolean;
}

const GENERIC_ERROR = `Something went wrong and we couldn't confirm your enquiry was received. Please try again, or call us on ${CONTACT_DETAILS.phoneDisplay}.`;

// Order in which the first invalid field receives focus.
const FIELD_ORDER: (keyof FieldErrors)[] = [
  "accessCode",
  "fullName",
  "phone",
  "preferredContact",
  "email",
  "propertyType",
  "service",
  "town",
  "postcode",
  "urgency",
  "photos",
  "consent",
];

export function EnquiryForm() {
  const [phase, setPhase] = useState<Phase>("editing");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [preferredContact, setPreferredContact] = useState("");
  const [urgency, setUrgency] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photoMessages, setPhotoMessages] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedInfo | null>(null);

  // Stable for every retry of the same enquiry; replaced only after success.
  const submissionId = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PickedPhoto[]>([]);
  const baseId = useId();

  useEffect(() => {
    photosRef.current = photos; // used only to release previews on unmount
  }, [photos]);

  // Controlled demo: ask the server (at run time) whether an access code is required.
  const [requiresCode, setRequiresCode] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/enquiry/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => alive && setRequiresCode(Boolean(c.requiresAccessCode)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    return () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, []);

  async function addPhotos(fileList: FileList | null) {
    if (!fileList) return;
    const picked = Array.from(fileList);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const messages: string[] = [];
    const accepted: PickedPhoto[] = [];
    let room = PHOTO_RULES.maxFiles - photos.length;
    for (const file of picked) {
      if (room <= 0) {
        messages.push(`You can add up to ${PHOTO_RULES.maxFiles} photos; "${file.name}" was not added.`);
        continue;
      }
      const problem = checkPickedPhoto(file);
      if (problem) {
        messages.push(problem);
        continue;
      }
      // The file name can lie: make sure the browser can really read it as a picture.
      try {
        (await createImageBitmap(file)).close();
      } catch {
        messages.push(`"${file.name}" could not be read as an image. Please choose a different photo.`);
        continue;
      }
      room--;
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        upload: "waiting",
      });
    }
    setPhotos((list) => [...list, ...accepted].slice(0, PHOTO_RULES.maxFiles));
    setPhotoMessages(messages);
    setErrors((e) => ({ ...e, photos: undefined }));
  }

  function removePhoto(key: string) {
    setPhotos((list) => {
      const target = list.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return list.filter((p) => p.key !== key);
    });
    setPhotoMessages([]);
  }

  function readForm(form: HTMLFormElement): EnquiryInput {
    const fd = new FormData(form);
    const text = (name: string) => String(fd.get(name) ?? "");
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    return {
      submissionId: submissionId.current,
      fullName: text("fullName"),
      phone: text("phone"),
      email: text("email"),
      propertyType: text("propertyType"),
      service: text("service"),
      town: text("town"),
      postcode: text("postcode"),
      details: text("details"),
      urgency: text("urgency"),
      preferredContact: text("preferredContact"),
      consent: fd.get("consent") === "yes",
      photoCount: photos.length,
      website: text("website"),
      startedAt: startedAt.current,
      accessCode: text("accessCode"),
    };
  }

  function focusFirstError(found: FieldErrors) {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first || !formRef.current) return;
    const target =
      first === "photos"
        ? fileInputRef.current
        : formRef.current.querySelector<HTMLElement>(`[name="${first}"]`);
    target?.focus();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase !== "editing") return; // blocks double clicks while sending

    const payload = readForm(e.currentTarget);
    const check = validateEnquiry(payload);
    const missingCode = requiresCode && !(payload.accessCode ?? "").trim();
    if (!check.ok || missingCode) {
      const found: FieldErrors = { ...(check.ok ? {} : check.errors), ...(missingCode ? { accessCode: "Please enter the demo access code." } : {}) };
      setErrors(found);
      setFormError("Please check the highlighted fields.");
      focusFirstError(found);
      return;
    }

    setPhase("submitting");
    setErrors({});
    setFormError("");

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok !== true) {
        setPhase("editing");
        if (data.fields) {
          setErrors(data.fields);
          focusFirstError(data.fields);
        }
        setFormError(typeof data.error === "string" ? data.error : GENERIC_ERROR);
        return;
      }

      const info: SavedInfo = {
        enquiryRef: data.enquiryRef ?? null,
        preferredContact: data.preferredContact === "Email" ? "Email" : "Phone",
        photoToken: data.photoToken ?? null,
        photosUnavailable: Boolean(data.photosUnavailable),
      };
      setSaved(info);
      setPhase("saved");
      if (info.photoToken && photos.length > 0) void uploadAll(info.photoToken, photos);
    } catch {
      // Network drop: the enquiry may or may not have arrived. The same
      // submission ID is reused on retry, so resending cannot duplicate it.
      setPhase("editing");
      setFormError(GENERIC_ERROR);
    }
  }

  function patchPhoto(key: string, patch: Partial<PickedPhoto>) {
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function uploadOne(photo: PickedPhoto, slot: number, token: string, retry: boolean) {
    patchPhoto(photo.key, { upload: "uploading", uploadError: undefined });
    try {
      const blob = await shrinkPhoto(photo.file);
      const fd = new FormData();
      fd.set("token", token);
      fd.set("slot", String(slot));
      fd.set("retry", retry ? "1" : "0");
      fd.set("file", blob, `photo-${slot}.jpg`);
      const res = await fetch("/api/enquiry/photo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok === true) {
        patchPhoto(photo.key, { upload: "done" });
      } else {
        patchPhoto(photo.key, {
          upload: "failed",
          uploadError: typeof data.error === "string" ? data.error : "This photo didn't upload.",
          canRetry: data.retryable !== false,
        });
      }
    } catch (err) {
      patchPhoto(photo.key, {
        upload: "failed",
        uploadError: err instanceof Error && err.message ? err.message : "This photo didn't upload.",
        canRetry: true,
      });
    }
  }

  async function uploadAll(token: string, list: PickedPhoto[]) {
    // Sequential: gentler on mobile connections and on Airtable's rate limit.
    for (let i = 0; i < list.length; i++) {
      await uploadOne(list[i], i + 1, token, false);
    }
  }

  function retryPhoto(key: string) {
    if (!saved?.photoToken) return;
    const index = photos.findIndex((p) => p.key === key);
    if (index >= 0) void uploadOne(photos[index], index + 1, saved.photoToken, true);
  }

  function startAgain() {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    submissionId.current = null;
    startedAt.current = Date.now();
    setPhotos([]);
    setPhotoMessages([]);
    setPreferredContact("");
    setUrgency("");
    setSaved(null);
    setErrors({});
    setFormError("");
    setPhase("editing");
  }

  if (phase === "saved" && saved) {
    return <SavedPanel saved={saved} photos={photos} onRetry={retryPhoto} onStartAgain={startAgain} />;
  }

  const emailRequired = preferredContact === "Email";
  const submitting = phase === "submitting";
  const id = (name: string) => `${baseId}-${name}`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={submitting}>
      {/* Honeypot — hidden from people; only bots fill it in. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor={id("website")}>Leave this field empty</label>
        <input type="text" id={id("website")} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset disabled={submitting} className="grid gap-5 sm:grid-cols-2">
        <legend className="visually-hidden">Your enquiry</legend>

        <p className="sm:col-span-2 rounded-lg border border-divider bg-cream-soft/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          <strong className="text-ink">Portfolio demo.</strong> ROOFORA is a fictional business. Anything you send here is a
          test enquiry and goes to a controlled test inbox — please use fictional details.
        </p>

        {requiresCode ? (
          <div className="sm:col-span-2">
            <Field label="Demo access code" htmlFor={id("accessCode")} required error={errors.accessCode} hint="This demo is invitation-only. Use the code you were given.">
              <input
                id={id("accessCode")}
                name="accessCode"
                type="text"
                autoComplete="off"
                maxLength={200}
                className="input-field"
                {...ariaFor(id("accessCode"), errors.accessCode, true)}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Full name" htmlFor={id("fullName")} required error={errors.fullName}>
          <input
            id={id("fullName")}
            name="fullName"
            type="text"
            maxLength={LIMITS.fullName}
            placeholder="Your name"
            autoComplete="name"
            className="input-field"
            {...ariaFor(id("fullName"), errors.fullName)}
          />
        </Field>

        <Field
          label="Phone number"
          htmlFor={id("phone")}
          required
          error={errors.phone}
          hint="Include the country code if you are calling from abroad."
        >
          <input
            id={id("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={LIMITS.phone}
            placeholder="e.g. +44 7700 900123"
            autoComplete="tel"
            className="input-field"
            {...ariaFor(id("phone"), errors.phone, true)}
          />
        </Field>

        <div className="sm:col-span-2">
          <fieldset aria-describedby={errors.preferredContact ? `${id("preferredContact")}-error` : undefined}>
            <legend className="mb-1.5 block text-sm font-semibold text-ink">
              Preferred contact method<span className="text-accent"> *</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTACT_METHODS.map((method) => (
                <label
                  key={method}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] border border-divider bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
                >
                  <input
                    type="radio"
                    name="preferredContact"
                    value={method}
                    checked={preferredContact === method}
                    onChange={() => setPreferredContact(method)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {method}
                </label>
              ))}
            </div>
            <ErrorText id={`${id("preferredContact")}-error`} error={errors.preferredContact} />
          </fieldset>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Email address"
            htmlFor={id("email")}
            required={emailRequired}
            error={errors.email}
            hint={emailRequired ? undefined : "Optional when you prefer a phone call."}
          >
            <input
              id={id("email")}
              name="email"
              type="email"
              maxLength={LIMITS.email}
              placeholder={emailRequired ? "you@example.com" : "you@example.com (optional)"}
              autoComplete="email"
              className="input-field"
              {...ariaFor(id("email"), errors.email, !emailRequired)}
            />
          </Field>
        </div>

        <Field label="Property type" htmlFor={id("propertyType")} required error={errors.propertyType}>
          <select
            id={id("propertyType")}
            name="propertyType"
            defaultValue=""
            className="input-field"
            {...ariaFor(id("propertyType"), errors.propertyType)}
          >
            <option value="" disabled>
              Choose one
            </option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service needed" htmlFor={id("service")} required error={errors.service}>
          <select
            id={id("service")}
            name="service"
            defaultValue=""
            className="input-field"
            {...ariaFor(id("service"), errors.service)}
          >
            <option value="" disabled>
              Choose one
            </option>
            {SERVICE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <fieldset>
            <legend className="mb-1.5 block text-sm font-semibold text-ink">
              Property location<span className="text-accent"> *</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
              <div>
                <label htmlFor={id("town")} className="mb-1 block text-xs font-semibold text-ink-soft">
                  Town or city <span className="text-accent">*</span>
                </label>
                <input
                  id={id("town")}
                  name="town"
                  type="text"
                  maxLength={LIMITS.town}
                  autoComplete="address-level2"
                  className="input-field"
                  {...ariaFor(id("town"), errors.town)}
                />
                <ErrorText id={`${id("town")}-error`} error={errors.town} />
              </div>
              <div>
                <label htmlFor={id("postcode")} className="mb-1 block text-xs font-semibold text-ink-soft">
                  Postcode (recommended)
                </label>
                <input
                  id={id("postcode")}
                  name="postcode"
                  type="text"
                  maxLength={LIMITS.postcode}
                  autoComplete="postal-code"
                  autoCapitalize="characters"
                  className="input-field"
                  {...ariaFor(id("postcode"), errors.postcode)}
                />
                <ErrorText id={`${id("postcode")}-error`} error={errors.postcode} />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="sm:col-span-2">
          <Field label="How soon do you need help?" htmlFor={id("urgency")} required error={errors.urgency}>
            <select
              id={id("urgency")}
              name="urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="input-field"
              {...ariaFor(id("urgency"), errors.urgency, urgency === URGENT_VALUE)}
            >
              <option value="" disabled>
                Choose one
              </option>
              {URGENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          {urgency === URGENT_VALUE ? (
            <p
              id={`${id("urgency")}-hint`}
              className="mt-2 flex gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-ink"
            >
              <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-dark" />
              {URGENT_NOTICE}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <Field label="Tell us about your roof" htmlFor={id("details")}>
            <textarea
              id={id("details")}
              name="details"
              rows={4}
              maxLength={LIMITS.details}
              placeholder="What have you noticed, or what would you like done?"
              className="input-field resize-none"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <PhotoPicker
            inputId={id("photos")}
            inputRef={fileInputRef}
            photos={photos}
            messages={photoMessages}
            error={errors.photos}
            onAdd={addPhotos}
            onRemove={removePhoto}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={id("consent")}
            className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-divider bg-cream-soft/40 px-4 py-3 text-sm text-ink"
          >
            <input
              id={id("consent")}
              name="consent"
              type="checkbox"
              value="yes"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
              {...ariaFor(id("consent"), errors.consent)}
            />
            <span>
              {CONSENT_WORDING}
              <span className="text-accent"> *</span>
              <span className="mt-1 block text-xs text-ink-soft">
                We use your details only to respond to this enquiry. This does not sign you up to marketing.
                {" "}
                <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">
                  Read the privacy notice
                </Link>
                .
              </span>
            </span>
          </label>
          <ErrorText id={`${id("consent")}-error`} error={errors.consent} />
        </div>
      </fieldset>

      <div aria-live="assertive">
        {formError ? (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </p>
        ) : null}
      </div>

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" disabled={submitting} className="sm:w-auto">
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            "Send My Enquiry"
          )}
        </Button>
        <p className="text-xs leading-relaxed text-ink-soft">
          <a href={TEL_HREF} className="font-semibold text-ink underline underline-offset-2">
            Prefer to call? {CONTACT_DETAILS.phoneDisplay}
          </a>
        </p>
      </div>
    </form>
  );
}

function ariaFor(fieldId: string, error?: string, hasHint = false) {
  const describedBy = [error ? `${fieldId}-error` : null, hasHint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-600">
      {error}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      <ErrorText id={`${htmlFor}-error`} error={error} />
    </div>
  );
}

function PhotoPicker({
  inputId,
  inputRef,
  photos,
  messages,
  error,
  onAdd,
  onRemove,
}: {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  photos: PickedPhoto[];
  messages: string[];
  error?: string;
  onAdd: (files: FileList | null) => void | Promise<void>;
  onRemove: (key: string) => void;
}) {
  const full = photos.length >= PHOTO_RULES.maxFiles;
  return (
    <div>
      <p id={`${inputId}-label`} className="mb-1.5 block text-sm font-semibold text-ink">
        Roof photos <span className="font-normal text-ink-soft">(optional, up to 3)</span>
      </p>
      <p id={`${inputId}-hint`} className="mb-3 text-xs leading-relaxed text-ink-soft">
        {PHOTO_SAFETY_NOTICE} JPG, PNG or WebP, up to 5 MB each.
      </p>

      {photos.length > 0 ? (
        <ul className="mb-3 grid grid-cols-3 gap-3" aria-label="Selected photos">
          {photos.map((photo, i) => (
            <li key={photo.key} className="relative aspect-square overflow-hidden rounded-[10px] border border-divider">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.previewUrl} alt={`Selected photo ${i + 1}: ${photo.file.name}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(photo.key)}
                className="absolute right-1.5 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-white transition-colors hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Remove photo ${i + 1} (${photo.file.name})`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label
        htmlFor={inputId}
        className={
          "inline-flex min-h-[48px] items-center gap-2 rounded-[10px] border-2 border-dashed px-4 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 " +
          (full
            ? "cursor-not-allowed border-divider text-ink-soft"
            : "cursor-pointer border-accent/40 text-ink hover:border-accent hover:bg-accent/5")
        }
      >
        <Camera size={18} aria-hidden="true" className="text-accent" />
        {full ? "3 photos added" : photos.length ? "Add another photo" : "Add photos"}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={PHOTO_RULES.acceptAttr}
          multiple
          disabled={full}
          onChange={(e) => onAdd(e.target.files)}
          className="visually-hidden"
          aria-describedby={`${inputId}-hint${error || messages.length ? ` ${inputId}-error` : ""}`}
        />
      </label>

      {error || messages.length ? (
        <div id={`${inputId}-error`} role="alert" className="mt-2 space-y-1 text-xs font-medium text-red-600">
          {error ? <p>{error}</p> : null}
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SavedPanel({
  saved,
  photos,
  onRetry,
  onStartAgain,
}: {
  saved: SavedInfo;
  photos: PickedPhoto[];
  onRetry: (key: string) => void;
  onStartAgain: () => void;
}) {
  const how = saved.preferredContact === "Email" ? "by email" : "by phone";
  const uploading = photos.some((p) => p.upload === "uploading" || p.upload === "waiting");
  const failed = photos.filter((p) => p.upload === "failed");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle2 size={40} aria-hidden="true" className="text-accent" />
      <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
        Your enquiry has been received
      </h3>
      <p className="max-w-sm text-ink">
        Thanks for getting in touch. We&apos;ll contact you {how} to discuss the next step.
        {saved.enquiryRef ? (
          <>
            {" "}
            Your reference is <strong>{saved.enquiryRef}</strong>.
          </>
        ) : null}
      </p>

      {photos.length > 0 ? (
        <div className="mt-3 w-full max-w-sm text-left" aria-live="polite">
          <p className="mb-2 text-sm font-semibold text-ink">
            {saved.photosUnavailable
              ? "Photo upload isn't available right now, but your enquiry is saved. You can send photos when we contact you."
              : uploading
                ? "Uploading your photos…"
                : failed.length
                  ? "Your enquiry is saved, but some photos didn't upload:"
                  : "Photos uploaded."}
          </p>
          {!saved.photosUnavailable ? (
            <ul className="space-y-2">
              {photos.map((p, i) => (
                <li key={p.key} className="flex items-center gap-3 rounded-lg border border-divider bg-surface px-3 py-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={p.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">Photo {i + 1}</span>
                    <span className={p.upload === "failed" ? "block text-xs text-red-600" : "block text-xs text-ink-soft"}>
                      {p.upload === "done"
                        ? "Uploaded"
                        : p.upload === "failed"
                          ? p.uploadError
                          : p.upload === "uploading"
                            ? "Uploading…"
                            : "Waiting…"}
                    </span>
                  </span>
                  {p.upload === "uploading" ? <Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" /> : null}
                  {p.upload === "done" ? <CheckCircle2 size={18} className="text-accent" aria-hidden="true" /> : null}
                  {p.upload === "failed" && p.canRetry ? (
                    <button
                      type="button"
                      onClick={() => onRetry(p.key)}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-divider px-3 text-xs font-semibold text-ink hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Retry<span className="visually-hidden"> photo {i + 1}</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button variant="secondary" onClick={onStartAgain} className="mt-3" disabled={uploading}>
        Send another enquiry
      </Button>
    </div>
  );
}

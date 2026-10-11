# ROOFORA data contract

The single source of truth for field names and dropdown values is `automation/airtable/schema.json`. Do **not** rename fields or dropdown options in Airtable without updating that file, the Code libraries in `automation/code/lib/`, and rebuilding (`node automation/build/build.mjs`). The simulated test suite fails if a workflow writes a field or option that is not in the schema.

## 1. Website → website server (`POST /api/enquiry`)

Sent by `components/enquiry/EnquiryForm.tsx`. Validation rules are shared (`lib/enquiry/contract.ts`) and applied again on the server.

| Field | Rule |
|---|---|
| `submissionId` | UUID v4, created in the browser, **kept the same on every retry** of the same enquiry |
| `fullName` | required, 2–100 chars |
| `phone` | required; international: optional `+`, 7–15 digits, spaces/dashes/brackets allowed |
| `email` | **required only when** `preferredContact = Email`; otherwise optional |
| `propertyType` | `Residential` · `Commercial` · `Other` |
| `service` | one of the existing services (`SERVICE_OPTIONS` in `lib/content.ts`) |
| `town` | required; `postcode` recommended |
| `details` | optional, ≤ 2000 chars |
| `urgency` | `Urgent active leak/storm damage` · `This week` · `This month` · `Just researching` |
| `preferredContact` | `Phone call` · `Email` (SMS is not offered) |
| `consent` | must be `true` (the checkbox is **unchecked by default**) |
| `photoCount` | 0–3 (photos are uploaded separately, after the enquiry is saved) |
| `website` | honeypot, must be empty |
| `startedAt` | when the form was shown; submissions faster than 3 s are refused |

Responses: `200 {ok:true, enquiryRef, duplicate, preferredContact, photoToken, photosUnavailable}` only after n8n confirms the lead is in Airtable. `400` field errors, `429` throttled, `503` not configured, `502/504` "could not confirm — safe to resend". A timeout is **never** shown as success.

## 2. Website server → n8n (header `X-Roofora-Secret`)

`POST <base>/enquiry` — body = the validated enquiry plus:

```json
{ "contractVersion": 1, "source": "roofora-website", "environment": "development|preview|production",
  "enquiryRef": "RF-3F2B8C1E", "receivedAt": "ISO",
  "consent": { "given": true, "wording": "…", "version": "contact-permission-v1", "recordedAt": "ISO (server clock)" } }
```

`enquiryRef` = `RF-` + first 8 hex characters of `submissionId`, uppercase (checked by n8n). `photoCount` is announced; photos follow.

Reply: `{ ok:true, status:"created"|"duplicate", enquiryRef, leadRecordId, acceptsPhotos:true }` · `400 {ok:false, error:"invalid", fields}` · `503 {ok:false}` (nothing saved).

`POST <base>/photo` — one photo per call: `submissionId, leadRecordId, enquiryRef, slot(1–3), contentType, dataBase64, retry`. Reply `{ok:true, status:"uploaded"|"already-uploaded"}` or `{ok:false}` with `502` (retryable).
The website only accepts photos after the enquiry is saved, using a **signed, 2-hour permission** (`photoToken`) that carries the Airtable record ID.

`POST <base>/quote` — `{action:"view"|"accept"|"decline", token}` (token = 64 hex characters from the quote email).

## 3. Airtable tables

| Table | One row per | Key fields |
|---|---|---|
| **Leads** | enquiry | `Enquiry Ref`, `Submission ID`, contact fields, `Preferred Contact`, `Urgency` (what the customer said), `Priority` (Urgent/Normal, set by automation), **`Stage`** (sales stage), `Service Area`, `Owner`, `Next Action`, `Next Action Due`, `Last Contact At`, `Follow-up Status/Kind/Step/Base At`, `Next Follow-up At`, permission fields, `Roof Photos` (attachments), `Gmail Thread IDs`, `Sent Message Keys` |
| **Inspections** | inspection | `Lead` (link), `Status`, `Proposed Start` (staff enter), `Confirmed Start/End`, `Calendar Event ID`, `Booking Version`, `Reminder 24h/2h Sent Version`, `Outcome Notes` |
| **Quotes** | quote version | `Lead`, `Version`, `Scope`, `Amount`, `Approved` + `Approved By`, `Status`, `Sent At`, `Link Token Hash`, `Link Expires At`, `Customer Response` |
| **Activity** | task / email / alert / problem | `Lead`, `Type`, `Status` (`Open`/`Done`/`Needs My Help`/`Info`), `Due At`, `Owner`, `Details`, `Provider ID` (Gmail/Calendar ID), `Message Key`, `Workflow Step`, `n8n Execution` |
| **Settings** | one row | everything in `SETUP.md` Step 7 |

### Stage vs urgency vs priority

* **Stage** = where the sale is: `New → Contacting → Inspection Scheduled → Inspection Completed → Quote Sent → Won / Lost` (plus `Duplicate` for a copy of the same submission).
* **Urgency** = what the customer ticked. **Priority** = `Urgent` when they ticked the urgent option. They never replace each other.
* **Follow-up Status** handles the special cases without inventing stages: `Active`, `Paused - Customer Replied`, `Paused - Staff Handling` (set by hand to take over), `Paused - Email Bounced`, `Stopped`, `Completed`, `Not Needed`.
* **Service Area**: `In Area`, `Needs Review`, `Possibly Out of Area`, `Out of Area` (only staff set this), `Not Checked`. An uncertain location is **flagged, never rejected**.
* **Permission Withdrawn** (tick) or a customer replying `STOP` stops every automated contact.

### Contact permission
Each lead stores the exact wording, its version (`contact-permission-v1`) and the server timestamp. It covers contact about **this enquiry only** and does not enrol anyone in marketing. If the wording changes, change `CONSENT_VERSION` in `lib/enquiry/contract.ts`.

### Photos
Stored only as Airtable attachments on the lead. Airtable keeps its own copy and hands out **expiring** download links when you open the record — ROOFORA never stores or publishes photo URLs. The browser shrinks and re-encodes each photo to JPEG (this also removes GPS/EXIF data) before upload.

## 4. Idempotency keys (what stops repeats)

| Action | Key | Where |
|---|---|---|
| Enquiry saved once | `Submission ID` | Leads |
| Email sent once | `Message Key` (e.g. `RF-3F2B8C1E-ACK`, `-FU-ENQUIRY-1`, `-Q2`, `-INSP-xxxxx-V2-R24h`) printed in the email body, stored in `Sent Message Keys`, recorded in Activity | Leads/Activity/Gmail |
| Calendar event once | event ID derived from the inspection record ID | Google Calendar |
| Reminder once per booking version | `Reminder 24h/2h Sent Version` | Inspections |
| Quote answered once | quote `Status` | Quotes |
| Photo once | file name `<ref>-photo-<slot>.<ext>` checked before a retry | Leads |

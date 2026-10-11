# Demo recording sequence (≈ 6 minutes)

**Before recording:** all data synthetic. Settings: `Customer Emails Enabled` ✔, `Test Mode` ✔ with *your own* inbox as Test Recipient, `Calendar ID` = the ROOFORA test calendar. Have Airtable (Leads, Inspections, Quotes, Activity), the ROOFORA Gmail test inbox, Google Calendar and Telegram open side by side. Run the Setup Check first so the base is clean.

Say out loud at the start: *"Everything you see uses fake customer data, and emails go to a test inbox."*

1. **The enquiry (website).** Open the ROOFORA site → Contact form. Show: phone-first fields, email becomes required when you pick *Email*, the urgent notice, the photo safety note, the unchecked permission box. Attach 2 photos (previews, remove one). Pick *This week*, preferred contact **Email**. Send.
   *Point out:* the success message appears only after the lead is saved; a reference like `RF-…` is shown; photos upload after.
2. **Lead appears in Airtable.** New row in Leads: Stage `New`, Priority `Normal`, owner, service-area flag, next action, permission wording + time, photos in `Roof Photos`. *Telegram:* the new-lead alert. *Gmail test inbox:* the acknowledgement (subject starts `[TEST for …]`).
3. **Urgent + phone variant (30 s).** Submit again with *Urgent active leak/storm damage* and **Phone call**. Show: priority callback task in Activity, Telegram urgent alert, **no email**, and the wording that never promises an emergency visit.
4. **Book the inspection.** In Inspections add a row linked to the lead, set `Proposed Start` (inside opening hours), press **Book / move** → the confirmation page → confirm. Show: Google Calendar event appears, Inspection becomes `Scheduled`, lead stage `Inspection Scheduled`, confirmation email in the test inbox. Press the button again: *"Already booked — nothing changed."*
5. **Reschedule.** Change `Proposed Start`, press Book again → same calendar event moves, version 2, "moved" email. *(Mention: the reminders planned for the old time are dropped automatically.)*
6. **Complete the inspection.** Press **Completed** → lead `Inspection Completed`, "Prepare quote" task.
7. **Quote.** Add a Quotes row: Version 1, scope, amount; tick **Approved** and fill **Approved By**. Show that an unapproved one is refused (untick → press Send quote → "Tick Approved…"). Approve → **Send quote** → the email with the secure link; lead `Quote Sent`.
8. **Customer accepts.** Open the quote link from the test inbox → *Accept this quote* → confirm. Show: lead **Won**, a "Schedule job" task (*"no date promised"*), Telegram 🎉 alert, confirmation email.
9. **Reliability moment (60 s).** Press **Send quote** again on the same row → "already sent". Re-open the old tab and press Accept again → "already accepted". Briefly show Activity: every message and task is recorded.
10. **Follow-up & reply (optional).** On a spare lead, set the clock/Next Follow-up At to now, run the *Every Business Morning* trigger in n8n → follow-up email. Reply from the test inbox → lead flips to `Paused - Customer Replied` and Telegram alerts.

**Close with:** "Scope and price are always entered and approved by a person; the automation does the chasing and the paperwork."

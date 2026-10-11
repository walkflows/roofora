# ROOFORA — when something goes wrong

Every problem becomes a row in **Airtable › Activity** with `Status = Needs My Help` and one Telegram message ("What happened / What to do"). Filter Activity by that status to see everything unresolved. When you have dealt with one, set its Status to `Done`.

| Symptom | What it means | What to do |
|---|---|---|
| Visitor saw "We couldn't confirm that your enquiry was received" | The save could not be confirmed (Airtable down, n8n down, or a timeout). **Nothing was shown as success.** | Check n8n is running and the Airtable credential works. The visitor can resend; the same Submission ID prevents a duplicate. If they phoned instead, add the lead by hand. |
| Enquiry saved but a photo failed | Photo upload is separate from the save. The visitor sees which photo failed and a **Retry** button for 2 hours. | If it keeps failing, ask the customer to email the photo. Photos are in the lead's `Roof Photos` field. |
| "Email unclear — check Gmail Sent" | Gmail did not answer clearly and Sent could not be searched. **Not resent.** | Open the ROOFORA Gmail › Sent and search the message reference shown in the Activity row (e.g. `RF-3F2B8C1E-ACK`). If it is there, mark the Activity `Done`. If not, send it by hand or press the staff button again. |
| Booking says "Not booked: clashes with …" | Another calendar event overlaps (including the travel buffer). | Choose another `Proposed Start` and press Book again. |
| Booking says "Calendar saved, Airtable not fully updated" | The calendar event exists but an Airtable write failed. | Press the Book button again — it reuses the same event and finishes the update. It cannot double-book. |
| Customer says they were not sent a reminder | Reminders are skipped when the booking changed, was cancelled, or the time had passed. | Check the Inspection's `Booking Version` and Activity. Phone-preference customers get a *task*, not an email. |
| Follow-ups stopped | A reply, booking, Won/Lost, withdrawn permission, bounce or a staff pause stops them on purpose. | Look at the lead's `Follow-up Status`. To restart, set it back to `Active` and set `Next Follow-up At`. |
| A customer replied but the lead was not paused | Reply detection is a 5-minute poll and matches by thread, then `RF-` reference, then the *single* open lead with that address. | Set the lead's `Follow-up Status` to `Paused - Customer Replied` by hand. |
| Quote link says expired / no longer open | The link is valid for `Quote Link Valid Days`; a newer quote version replaces older ones. | Send the current version again (press **Send quote** on a *new* quote row with the next `Version`). |
| Telegram silent | Alerts are muted for 30 min if identical, or the Telegram credential/chat ID is wrong. | Check `Activity` for `Needs My Help` rows regardless of Telegram. |
| n8n itself is down | Website enquiries fail (nothing is shown as saved); nothing else runs. | Restart n8n. No data is lost. Visitors can resend. |
| Airtable allowance used up | See `AIRTABLE-BUDGET.md`. | Upgrade the plan or wait for the reset. |

## Emergency stops
* **Stop all customer email instantly:** untick `Customer Emails Enabled` in Settings (effective on the next email, no redeploy).
* **Stop automation for one customer:** tick `Permission Withdrawn` on their lead.
* **Pause follow-ups for one lead:** set `Follow-up Status` to `Paused - Staff Handling`.
* **Take the whole system offline:** deactivate the *ROOFORA — Lead Manager* workflow in n8n. The website then shows its "temporarily unavailable — call us" message instead of success.

## Re-running a failed step
Open n8n › Executions › the failed run to see the red node. Pressing the Airtable staff button again is safe for Book, Cancel, Complete and Send quote (each is idempotent). Never re-run an execution that already sent an email without checking Gmail Sent first.

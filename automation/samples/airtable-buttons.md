# Airtable button formulas (create these by hand — Airtable's API cannot create button fields)

Replace `https://YOUR-N8N-HOST` with your n8n address (the same host you put in `roofora.config.local.json › n8nBaseUrl`).
Add each as a **Button** field (action "Open URL") with the formula shown. Staff then sign in once with the "ROOFORA Staff Access" username/password; the page that opens shows a confirmation screen, and nothing changes until they press its confirm button.

| Table | Button field name | Formula |
|---|---|---|
| Inspections | Book / move | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=book-inspection&record=" & RECORD_ID()` |
| Inspections | Cancel | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=cancel-inspection&record=" & RECORD_ID()` |
| Inspections | Completed | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=complete-inspection&record=" & RECORD_ID()` |
| Quotes | Send quote | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=send-quote&record=" & RECORD_ID()` |
| Quotes | Customer accepted (phone) | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=record-accepted&record=" & RECORD_ID()` |
| Quotes | Customer declined (phone) | `"https://YOUR-N8N-HOST/webhook/roofora/staff?action=record-declined&record=" & RECORD_ID()` |

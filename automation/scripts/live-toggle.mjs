// node automation/scripts/live-toggle.mjs on|off   — activates/deactivates the three ROOFORA runtime workflows (callees first when turning on).
import { findWorkflow, activate, deactivate, n8n } from './live-lib.mjs';
const mode = process.argv[2];
const order = ['ROOFORA — Error Handler', 'ROOFORA — Send Customer Email', 'ROOFORA — Lead Manager'];
for (const n of mode === 'on' ? order : [...order].reverse()) {
  const w = await findWorkflow(n);
  if (mode === 'on') await activate(w.id); else await deactivate(w.id);
  console.log(n, '→ active =', (await n8n('GET', '/workflows/' + w.id)).active);
}

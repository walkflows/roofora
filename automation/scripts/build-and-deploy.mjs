// Rebuilds the local (config-specific) workflow JSON and imports it, with backups. Workflows must be inactive.
//   node automation/scripts/build-and-deploy.mjs
import { execFileSync } from 'node:child_process';
const run = (script, ...a) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...a], { stdio: 'pipe' }).toString();
run('../build/build.mjs');
console.log(run('./deploy-n8n.mjs', '--apply').split('\n').filter((l) => /backed up|updated|created|Refusing|skipped/.test(l)).join('\n'));

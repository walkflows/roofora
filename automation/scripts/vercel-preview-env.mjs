// Prepares PREVIEW-ONLY environment variables on the existing Vercel project "roofora" (team walkflows-3906).
//   node automation/scripts/vercel-preview-env.mjs                 DRY RUN: lists what would be added (names only)
//   node automation/scripts/vercel-preview-env.mjs --apply         adds them for the preview branch below (NOT production)
// Values come from the git-ignored .env.local and are piped to the Vercel CLI through stdin: never printed, never put on a command line.
// It does not deploy, push or touch production. Run it only when a preview deployment has been authorised.
import { execFileSync } from 'node:child_process';
import { loadEnv } from './live-lib.mjs';

const BRANCH = process.env.ROOFORA_PREVIEW_BRANCH || 'demo/controlled-preview';
const SCOPE = 'walkflows-3906', PROJECT = 'roofora';
const NAMES = ['N8N_ROOFORA_WEBHOOK_BASE', 'N8N_ROOFORA_WEBHOOK_SECRET', 'ROOFORA_PHOTO_TOKEN_SECRET', 'ROOFORA_DEMO_ACCESS_CODE'];
const env = loadEnv();
const missing = NAMES.filter((n) => !env[n]);
if (missing.length) { console.error('Missing in .env.local: ' + missing.join(', ')); process.exit(2); }
const apply = process.argv.includes('--apply');
console.log((apply ? 'ADDING' : 'DRY RUN — would add') + ` ${NAMES.length} variables to project ${PROJECT}, environment=preview, branch=${BRANCH} (production untouched):`);
for (const n of NAMES) {
  console.log('  ' + n);
  if (apply) {
    const npx = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
    execFileSync(npx, ['env', 'add', n, 'preview', BRANCH, '--scope', SCOPE, '--project', PROJECT, '--yes'], { input: env[n], stdio: ['pipe', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  }
}
if (!apply) console.log('\nNothing was changed. After the first preview exists, also set ROOFORA_SITE_URL and the Airtable Settings › Website URL to the preview address.');

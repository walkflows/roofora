// ROOFORA automation — plain-English problem reports for the error workflow.
// Depends on core.js. Never includes customer names, emails, phones or messages.

function scrub(text) {
  return str(text)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/(pat|key)[A-Za-z0-9._-]{10,}/g, '[secret]')
    .slice(0, 300);
}

const STEP_ADVICE = [
  [/airtable|save lead|load settings|load lead|find lead|update lead|record activity/i, 'Check the Airtable credential still works in n8n and that the ROOFORA base, table and field names match automation/airtable/schema.json. Then re-run the step from n8n Executions.'],
  [/gmail|email/i, 'Do not resend blindly: search Gmail › Sent for the message reference first. If it is not there, press the staff button again or send it by hand.'],
  [/calendar|book/i, 'Open the ROOFORA calendar and check whether the event exists before pressing Book again; pressing Book again is safe (it reuses the same event).'],
  [/photo|attachment/i, 'The enquiry is saved. Ask the customer to email the photos, or retry from the website within 2 hours.'],
  [/telegram/i, 'Check the Telegram bot credential and the ROOFORA chat ID.'],
];

function adviceFor(step, message) {
  for (const [re, advice] of STEP_ADVICE) if (re.test(step) || re.test(message)) return advice;
  return 'Open n8n › Executions, find the failed run and check the red step. Nothing will be retried automatically.';
}

/**
 * input: either an Error Trigger item ({ execution, workflow }) or a handled
 * problem ({ source: 'handled', step, ref, problem, action, severity }).
 */
function describeProblem(input, now) {
  const handled = input && input.source === 'handled';
  const exec = (input && input.execution) || {};
  const step = handled ? str(input.step) : str((exec.error && exec.error.node && exec.error.node.name) || exec.lastNodeExecuted || 'unknown step');
  const message = handled ? scrub(input.problem) : scrub(exec.error && exec.error.message);
  const ref = handled ? str(input.ref) : '';
  const workflow = handled ? 'ROOFORA Lead Manager' : str(input && input.workflow && input.workflow.name);
  const action = handled && str(input.action) ? str(input.action) : adviceFor(step, message);
  const runId = handled ? str(input.executionId) : str(exec.id);
  const title = (handled ? 'Needs your help: ' : 'Automation failed: ') + step + (ref ? ' (' + ref + ')' : '');
  const telegram = [
    '⚠️ ROOFORA — ' + title,
    'What happened: ' + (message || 'no error text'),
    'What to do: ' + action,
    runId ? 'n8n run: ' + runId : null,
  ].filter(Boolean).join('\n');
  return {
    throttleKey: step + '|' + ref + '|' + message.slice(0, 60),
    telegram,
    activity: {
      Activity: title.slice(0, 120),
      Type: 'Automation Problem',
      Status: 'Needs My Help',
      Details: 'Workflow: ' + workflow + '\nStep: ' + step + '\nProblem: ' + message + '\nRecommended action: ' + action,
      'Workflow Step': step,
      'n8n Execution': runId,
      'Created At': now.toISOString(),
    },
    leadRef: ref,
  };
}

/** Suppress identical alerts within 30 minutes (stops alert storms). */
function shouldAlert(store, key, now) {
  const last = store[key];
  store[key] = now.getTime();
  for (const k of Object.keys(store)) if (now.getTime() - store[k] > 24 * 3600e3) delete store[k];
  return !last || now.getTime() - last > 30 * 60e3;
}

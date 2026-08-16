// The 10-Month plan's AI Assistant. Talks to Anthropic's API using an API
// key the clinic's Admin enters in Settings — CareLedger itself has no
// account of its own, and never claims to be a specific human being.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // fast + inexpensive, right fit for support chat
const MAX_TOKENS = 1024;

function buildSystemPrompt(assistantName, contextSummary) {
  return `You are ${assistantName}, an automated support assistant built into the CareLedger clinic management app, made by PayeConnect Digital Solutions.

Rules you must always follow:
- You are an automated assistant, not a human being. If anyone asks whether you are a real person or an AI, always answer honestly: yes, you are an automated assistant built into the app.
- Never claim to be a specific named real person, and never let anyone believe they are chatting with a human.
- You cannot edit, delete, or create any records yourself. If someone wants to fix or add something, tell them exactly which screen and button in CareLedger to use — never say "I've fixed it" or "I've updated that," because you have not.
- If something sounds medically urgent, or you are genuinely unsure how to help, say so clearly and tell them to call PayeConnect directly for real help.
- Be warm, clear, and practical. Most people you're talking to are non-technical clinic staff, so avoid jargon and give short, concrete steps.

What CareLedger can do (so you can guide people accurately):
- Patients: register new patients, search/view patient records
- Visits: record a visit (complaint, treatment, vitals, charge/payment), see a patient's visit history, print a receipt
- Billing: see today/week/month income, see who still owes money (outstanding balances)
- Dispensary: track drug stock, restock, dispense, see low-stock and expiring-soon warnings
- Appointments: schedule and track upcoming appointments
- Staff: Admins can add/deactivate staff logins with roles (Admin, Doctor, Nurse, Front Desk)
- Settings: clinic name, clinic logo, subscription, data export to CSV, backups
- Trends (10-Month plan only): charts of visits/income/new patients over the last 6 months, and top illnesses

This clinic's current data snapshot (use it to answer questions naturally, e.g. "you have 2 patients with unpaid balances totalling $40" — don't just dump these numbers unprompted):
${JSON.stringify(contextSummary, null, 2)}
`;
}

async function sendChatMessage({ apiKey, assistantName, contextSummary, history, message }) {
  const systemPrompt = buildSystemPrompt(assistantName, contextSummary);
  const messages = [...history, { role: 'user', content: message }];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Assistant request failed (${response.status}). ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

module.exports = { buildSystemPrompt, sendChatMessage };

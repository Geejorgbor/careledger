// Pushes this clinic's Subscription clients + history to the always-on
// careledger-cloud service, so its daily job can text clients about
// refills even when this computer/app isn't open. See that service's own
// README for the full design — in short, PayeConnect hosts it, not any
// one clinic, and every clinic's data stays private and separate there
// too.
//
// Auth: no secret is hardcoded here (this source file is public on
// GitHub, so anything hardcoded wouldn't actually be secret). The first
// sync for a given clinicId gets issued a random token by the server;
// every sync after that must present it. Failure is always silent here —
// same rule as licenseSync.js — a sync hiccup must never interrupt using
// the app.

const SYNC_URL = 'https://careledger-cloud.vercel.app/api/sync';
const FETCH_TIMEOUT_MS = 15000;

async function pushSubscriptionData({ clinicId, syncToken, clients, smsSettings }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(SYNC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinicId, syncToken, clients, smsSettings }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      return { ok: false, error: (data && data.error) || `Sync failed (${response.status})` };
    }
    return { ok: true, syncToken: data.syncToken };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { pushSubscriptionData };

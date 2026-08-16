// Lets PayeConnect update a clinic's subscription date remotely, without
// visiting that clinic's computer. A single JSON file in the public
// careledger GitHub repo maps each installed copy's random clinic id to its
// Licensed Until date; each running app quietly checks that file now and
// then and adopts whatever date it finds for its own id.
//
// This is explicitly NOT a security/anti-piracy mechanism — the repo is
// public and the app already works fully offline with no remote check at
// all. Like the rest of the subscription banner, it's a convenience for
// PayeConnect to follow up with clinics, never something that blocks or
// gates the app. Any failure (offline, file missing, bad JSON, id not
// listed) is treated the same as "nothing to update" — silent, no error
// shown to the clinic.

const LICENSES_URL = 'https://raw.githubusercontent.com/Geejorgbor/careledger/master/licenses.json';
const FETCH_TIMEOUT_MS = 8000;

function parseLicenseEntry(jsonText, clinicId) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const entry = data && typeof data === 'object' ? data[clinicId] : null;
  if (!entry || typeof entry.expiresAt !== 'string') return null;
  return { expiresAt: entry.expiresAt };
}

async function checkRemoteLicense(clinicId) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(LICENSES_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const text = await response.text();
    return parseLicenseEntry(text, clinicId);
  } catch {
    return null;
  }
}

module.exports = { checkRemoteLicense, parseLicenseEntry };

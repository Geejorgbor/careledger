# CareLedger

Offline-first clinic management system. Built by PayeConnect Digital Solutions.

> "It works even when there is no internet, even when there is no data."

This document explains what's built so far, how to run it, and how it's put
together — so the program doesn't live only in one person's head.

## What's built

**Phase 1 — Patients & Visits**
- Register a patient (name, date of birth, gender, phone, address)
- Search/list patients by name or phone
- Open a patient and see their full visit history
- Clinic name setting (the foundation for white-labeling — Section 7 of the
  product plan). Each clinic's copy can show its own name; a logo can be
  added the same way later.

**Phase 2 — Billing & Payments**
- Every visit now records what was **charged** and what was **paid** —
  separately, so a partial payment leaves a visible balance owed instead of
  quietly disappearing. Typing an amount charged auto-fills the amount paid
  (most visits are paid in full on the spot), but it can always be edited
  for a partial payment.
- A **Billing** tab showing today's / this week's / this month's income
  (money actually collected, not just charged), and a list of every
  outstanding balance across all patients — click one to jump straight to
  that patient.
- Older databases from before this phase are upgraded automatically the
  first time they're opened (existing visits are treated as paid in full —
  see `runMigrations` in `db.js`). No data is ever lost or rewritten.

Everything is stored in a single SQLite file on the clinic's own computer.
No internet connection is needed for any of this to work — that's the whole
point of CareLedger, and it will stay true as more phases are added.

Not built yet (see the product plan for the full order): Drug Dispensary,
Staff Logins & Security, Reports & Dashboard, cloud backup, phone access.

## How to run it

You need [Node.js](https://nodejs.org) installed (this was built and tested
with Node 20).

```bash
cd careledger
npm install       # installs everything, including Electron
npm start         # opens the CareLedger window
```

`npm install` automatically rebuilds the database engine to match Electron
(see "A gotcha to know about" below) — you don't need to do anything extra.

## How it's put together (plain words)

- **`src/main/`** — the "backend" that runs on the clinic's computer.
  - `db.js` — everything about the database: the tables (patients, visits,
    settings) and every read/write function. This is the only file that
    talks to SQLite directly.
  - `ipc.js` — connects the on-screen buttons/forms to `db.js`. Every action
    (like "add a patient") passes through here.
  - `main.js` — opens the app window and starts everything up.
- **`src/preload/preload.js`** — a safety bridge. It only lets the screen
  call the specific actions listed here (add patient, list patients, etc.),
  nothing else. This keeps the app secure.
- **`src/renderer/`** — everything the user actually sees and clicks.
  - `index.html` — the screens (patient list, patient detail, settings) and
    the pop-up forms (new patient, new visit).
  - `app.js` — what happens when you click things (open a patient, save a
    visit, search).
  - `styles.css` — colors, spacing, how things look.

## Where the data lives

While developing (`npm start` from this folder), the database file is at
`data/careledger.db` inside this project (ignored by git — never commit
real patient data). Once the app is packaged and installed on a clinic's
computer, the database automatically moves to that computer's private user
data folder, so it survives app updates.

**Backup is not automated yet** — that's an explicit safeguard from the
product plan (Section 6) that still needs to be built. Until then, treat
`careledger.db` as the one and only copy of a clinic's data and back it up
by hand if you're testing with anything real.

## Testing

```bash
npm run test:db
```

This checks the database logic directly (add a patient, add a visit, search,
settings, and the error cases — like a visit for a patient that doesn't
exist) without needing to open the app window. Run this after any change to
`db.js` to make sure nothing broke.

## A gotcha to know about (native modules + Electron)

The database engine (`better-sqlite3`) is compiled C++ code, and it has to
be compiled specifically for Electron's version of Node — not your regular
system Node. If you ever see an error like:

```
NODE_MODULE_VERSION mismatch
```

run this and it will fix itself:

```bash
npx electron-rebuild -f -w better-sqlite3
```

(`npm install` already does this automatically via the `postinstall` script,
so this should rarely come up by hand.)

## Next step

Phase 3 — Drug Dispensary: stock and expiry tracking for medicine the
clinic hands out. This also doubles as the engine the future pharmacy
product will need.

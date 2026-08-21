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

**Phase 3 — Drug Dispensary**
- A **Dispensary** tab tracking every medicine the clinic stocks: name,
  unit (tablet/bottle/vial/etc.), quantity on hand, reorder level, and
  expiry date.
- Add a new drug, then **Restock** it (a delivery arrives) or **Dispense**
  it (handed to a patient) — every change is logged with a timestamp and
  note in that drug's movement history, so stock counts are never just a
  number someone edited by hand.
- Dispensing is blocked if it would take stock below zero — the count
  always reflects what's really on the shelf.
- The drug list flags **low stock** (at or under the reorder level) and
  **expiring soon** (within 30 days) right in the table, in red/orange.

**Phase 4 — Staff Logins & Security**
- The very first time CareLedger is opened, it asks you to set up your own
  account (name, role, username, password) instead of coming with any
  built-in login — there's nothing to guess or hack. Every time after that,
  it asks you to log in.
- Passwords are salted and hashed (Node's built-in `crypto.scrypt`) — never
  stored or shown as plain text, not even to other staff.
- Once logged in, a staff member can add more accounts from **Settings →
  Staff Accounts**, and deactivate one without deleting it (their name stays
  attached to their past records, but they can no longer log in).
- Every patient, visit, drug, and stock movement now remembers **who**
  recorded it — shown as "Recorded By" / "By" in the visit history and
  stock movement tables.
- This isn't just hidden in the screen — the login check happens in the
  program's core (`ipc.js`), so there's no way to see or change clinic data
  without being logged in, even if someone tried to bypass the screen.

**Phase 5 — Reports & Dashboard**
- Logging in now opens straight to a **Dashboard** — the "automatic magic"
  the product plan asked for. Nothing here is new data; it's all totals
  pulled together from patients, visits, and drugs so nobody has to add
  anything up by hand.
- Four numbers at a glance: patients seen today, patients seen this week
  (each patient counted once, even with multiple visits), today's money
  collected, and how many things need attention.
- **Top Illnesses This Week** — the most common complaints from this
  week's visits, most-seen first.
- **Needs Attention** — every low-stock or soon-to-expire medicine in one
  list, click one to jump straight to that drug.

**Automatic Backup** (Section 6's safeguard, "a promise, not a feature")
- CareLedger quietly saves a full copy of the database shortly after
  opening, and then every hour, to a `backups` folder next to the real
  data — no one has to remember to do it. The last 10 automatic backups
  are kept; older ones are deleted automatically.
- Backups use SQLite's own online backup mechanism (not a plain file copy),
  so the copy is always consistent even while the app is being used.
- **Settings → Backups** shows when the last backup happened, and has a
  **Back Up to Flash Drive / Folder…** button for saving a copy anywhere
  you choose — a USB stick, an external drive, a synced folder, etc.
- Cloud backup (the plan's third copy, "when internet is available") isn't
  built — it needs a cloud storage account/service to send backups to,
  which nobody has set up yet. The flash-drive export covers the same need
  by hand in the meantime.

Everything is stored in a single SQLite file on the clinic's own computer.
No internet connection is needed for any of this to work — that's the whole
point of CareLedger, and it will stay true as more phases are added.

**Packaging** — CareLedger can now be built into a real installable program
(`npm run dist`), so a clinic never needs to install Node.js or type a
command. Built and tested on Linux (a `.AppImage` — download and run, no
install step). Windows (`.exe` installer) and Mac (`.dmg`) targets are
configured the same way, but each has to actually be *built* on that
platform (or via a Mac/Windows CI machine) — a Linux computer can't produce
a working `.exe`/`.dmg` on its own.

**Printable Receipts** — every visit in a patient's history has a **Print
Receipt** button. It brings up a clean, print-only page — clinic name,
patient, visit date, complaint/treatment, amount charged/paid, and who
served them — with everything else on screen hidden, so what prints is
just the receipt. Works with a real printer or "Print to PDF" (built into
every computer's print dialog) to save/share one digitally.

**Role-Based Permissions** — not every staff member should be able to do
everything.
- **Admin**: everything, including staff accounts and clinic settings.
- **Doctor / Nurse**: full clinical work — patients, visits, dispensing
  medicine, viewing billing — but not staff accounts or settings.
- **Front Desk**: patients, visits, and billing (registration and payment
  is their job) — but cannot touch the dispensary, staff accounts, or
  settings. Handing out medicine is kept to clinical roles on purpose.
- This is enforced in the program's core (`permissions.js` + `session.js`),
  not just hidden on screen — the buttons a role can't use are hidden in
  the UI too, but even a tampered screen couldn't bypass the real check.

**Vital Signs** — recording a visit can now include temperature, blood
pressure, pulse, and weight, all optional. They show up compactly in the
visit history ("T: 38.5°C · BP: 120/80 · P: 72bpm · W: 65kg") and on the
printed receipt when present.

**Appointment Scheduling** — schedule a follow-up right from a patient's
page (**+ Schedule Appointment**), and see everyone's upcoming visits in
one place on the new **Appointments** tab — date, time, patient, phone,
reason, with a status you can change to Completed/Cancelled/No-Show as
things happen. The Dashboard's "Appointments Today" count ties this back
to the original plan's Section 4 (which always meant for the Dashboard to
show "appointments coming").

**Automatic App Updates** — CareLedger checks its own GitHub page
(https://github.com/Geejorgbor/careledger) for a newer version shortly
after opening (only when there's internet — otherwise it just carries on
completely normally, silently, exactly like it always has). If one is
found, it downloads quietly in the background and installs itself the
next time the app restarts — nobody has to go find and reinstall anything
by hand. **Settings → Updates** shows the version currently running and
has a **Check for Updates** button to check right now instead of waiting.
This only works in the real installed app, not while developing with
`npm start`.

To actually ship an update to clinics: bump the `version` in
`package.json`, commit, then run `npm run release` (needs a GitHub token
in the `GH_TOKEN` environment variable — `gh auth token` prints it if
you're logged in with the GitHub CLI). That builds the installer *and*
publishes it as a GitHub Release in one step, which is exactly what
already-installed copies of CareLedger check against.

**Clinic Logo** — completes white-labeling (Section 7): **Settings →
Clinic Logo → Upload Logo…** picks a PNG/JPG/GIF from the computer, and it
immediately shows up at the top of the app next to the clinic name, and on
every printed receipt. The logo is stored right inside the database
itself (not a separate file), so it's automatically included in every
backup and travels with the app if it's ever reinstalled.

**App Icon & Visual Polish** — so it feels like a finished, real program
instead of something still being built:
- A proper CareLedger icon (`build/icon.png`, a white medical cross on the
  brand green) instead of Electron's generic default icon, in the taskbar
  and title bar.
- Subtle shadows on cards, tables, and dialogs for depth; smooth hover and
  press transitions on every button; a branded green focus ring on inputs
  instead of the plain default one.
- Status/balance/stock indicators (Active, Balance Owed, Low Stock, etc.)
  are now rounded colored badges instead of plain colored text — the kind
  of small touch real apps have and unfinished ones usually don't.
- A brief loading spinner in tables while data is being fetched, instead
  of a blank flash before content appears.

**Export Data (CSV)** — **Settings → Export Data** saves Patients, Visits
(with charged/paid/balance and who recorded each one), or Drug inventory
as a `.csv` file that opens directly in Excel or Google Sheets — useful
for handing records to an accountant or reporting to a health authority.
Unlike the on-screen lists (capped at 200 rows for a snappy screen), these
exports always include everything, with no limit.

**Subscription expiry banner** — **Settings → Subscription** lets an Admin
set a "Licensed Until" date for the clinic. If that date is within 7 days
(or has already passed), a banner appears across the top of every screen
("Your subscription expires in 3 days — please contact PayeConnect to
renew" / "...expired on 2026-08-01 (5 days ago)..."). This is a **warning
only** — nothing is locked or blocked, the clinic can keep using the app
freely either way. It relies on PayeConnect following up directly with
each clinic; it is not a real anti-piracy measure (the app's source and
releases are on a public GitHub repo, so a technical user could always
bypass or ignore the banner). If no date is set, the banner never shows. PayeConnect's actual pricing
has two separate button groups on the Subscription screen:
- **New Clinic (First Purchase)** — 3 Months for $70, or 10 Months for
  $150. Fills the date field with today + 3/10 months.
- **Renewing Clinic** — 3 Months for $20, or 10 Months for $40 (cheaper,
  since it's not new setup). Extends from whichever is later — the
  clinic's current Licensed Until date, or today — so renewing a few days
  early never throws away time they already paid for.

Both button groups just fill in the date (and remember which plan was
picked); nothing is saved until "Save" is clicked, same as before.

**Remote subscription renewal** (fetched from `licenses.json` on the
`master` branch of this repo). Every installed copy of CareLedger gets
its own random **Clinic ID** the first time it runs (shown, read-only, on
**Settings → Subscription**). When a clinic renews, PayeConnect adds or
updates that Clinic ID's entry in `licenses.json` (a small file kept in
this same GitHub repo) — `{"expiresAt": "YYYY-MM-DD", "plan": "10month"}`
(the `plan` field is optional; omit it to update just the date) — and
pushes it. Every running copy of the app quietly checks that file shortly
after it starts, and again every 6 hours — if it finds its own Clinic ID
with a new date or plan, it adopts it automatically and the banner (and
Trends tab, see below) update immediately, with no action needed on the
clinic's computer at all (as long as that computer has internet at some
point). If a clinic is offline, has no internet, or isn't listed in the
file yet, nothing happens — the app just keeps using whatever was last
set locally, same as before this feature existed.

**Advanced Reports & Trends (10-Month plan bonus)** — clinics on the
10-Month plan (either the $150 first purchase or a $40 renewal) get an
extra **Trends** tab: simple bar charts of patient visits and income over
the last 6 months, new patients registered per month, and a table of the
most common complaints over that window. Everything is computed from data
already in the app — no new dependency, works fully offline, costs
nothing to run. It's deliberately a nice-to-have, not something a clinic
needs to run day-to-day — nothing on the cheaper 3-Month plan was removed
or weakened to make room for it. Which plan a clinic is on is tracked as
a `licensePlan` setting (`"3month"` or `"10month"`), set by whichever
button was clicked (or by the `plan` field in a remote renewal); the Main
process checks this before returning any Trends data, so hiding the tab
in the UI isn't the only thing stopping a non-10-Month clinic from seeing
it.
This is a convenience, not a security feature: `licenses.json` lives in
the same **public** repo as the rest of the code, so it's not a place to
put anything sensitive, and a technical user could still edit their own
copy's local database directly to bypass it (same limitation the warning
banner itself already has — see above).

**AI Assistant (10-Month plan bonus)** — an in-app chat tab (`Assistant`)
where clinic staff can ask questions and get help using CareLedger, backed
by a real AI (Anthropic's API). An Admin sets it up in **Settings → AI
Assistant**: pick a name for it, and paste in an API key. A few rules are
built into it and can't be turned off:
- It always identifies itself as an automated assistant if asked — it is
  never allowed to claim to be a specific real person, however it's named.
- It cannot edit, delete, or create any records itself. If it can help
  someone fix something, it tells them exactly which screen/button to
  use — it never claims to have made a change on its own.
- If something sounds urgent or it's genuinely unsure, it says so and
  points the clinic to call PayeConnect directly.

It's given a live read-only snapshot of the clinic's own data (today's
patient count, income, low-stock/expiring drugs, outstanding balances) so
it can answer naturally instead of generically. A simple daily cap (100
messages, `checkAndConsumeAiMessageQuota()` in db.js) protects against a
runaway bill from misuse. This needs internet at the moment someone asks
it something (unlike the rest of the app) and a real, paid API key —
CareLedger has no AI account of its own, so this only works once one has
been added in Settings.

**Subscriptions (retail refill-plan clients).** A new **Subscriptions**
tab, separate from clinical Patients, for tracking retail/subscription
customers (e.g. a pharmacy's refill plan): add a client (name, phone,
who's sponsoring them), and log dated history entries under them — an
**Order** (medication, quantity, day supply), a **Note** (a call/clinical
note), or a plain **Contact** attempt. This is deliberately a separate
concept from Patients/Visits — a retail refill customer isn't a clinical
visit, so it doesn't carry vitals, billing, or appointments.

The refill math lives in `db.js`'s `getRefillsDue(windowDays)`: for every
client's medication, only the **most recent** Order entry counts (an
older order for the same medication is superseded automatically); its
due date is that order's date + its day supply, and a client already
reminded for a given order is never returned again until they log a new
order.

**Automatic SMS reminders (opt-in, Settings → Subscription Refill
Reminders).** Turning this on and adding an Africa's Talking
username/API key does two things: `cloudSync.js` starts periodically
pushing this clinic's Subscriptions data (via `main.js`, same
shortly-after-startup-then-every-few-hours pattern as backups and license
sync) to **`careledger-cloud`** — a small always-on service, hosted
separately by PayeConnect (not tied to any one clinic's own website), at
[github.com/Geejorgbor/careledger-cloud](https://github.com/Geejorgbor/careledger-cloud)
(private — real client names/phone numbers can never live in this public
`careledger` repo). A daily job there (Vercel Cron) checks every synced
clinic and texts whoever's due, through **that clinic's own** SMS
account — never a shared PayeConnect-owned one — then marks the reminder
sent. This is the one part of the feature that's genuinely always-on,
independent of any clinic's computer being turned on.

Auth to that service is a per-clinic token issued on first sync, not a
secret baked into the app (this repo is public, so anything hardcoded
here wouldn't actually be secret) — see that service's own README for the
full design. **Known limitation:** the sync is one-directional
(CareLedger → cloud only) — if the cloud service marks a reminder sent,
that doesn't currently flow back to update this app's own local copy, so
CareLedger's own Subscriptions screen can't be fully trusted as "has this
person been texted yet" once cloud reminders are turned on; worth
building a pull-back sync if that ever becomes a real problem.

All five build-order phases from the original product plan are now built,
plus the automatic backup safeguard from Section 6, packaging, printable
receipts, role-based permissions, vital signs, appointment scheduling,
automatic app updates, the clinic logo (white-labeling / Section 7 is now
fully done), the visual polish pass, CSV export, and the subscription
expiry banner.
What's left is what the plan calls the "optional extra layer": cloud
backup and phone access — plus two flagged-but-not-built security/UX
items: auto-logout after inactivity, and encrypting the database file at
rest (right now, `careledger.db` is plain SQLite — anyone with direct file
access to a stolen computer could read it outside the app entirely,
bypassing the login screen).

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

## Building an installable program

This is for making a real copy to hand to a clinic — not needed for normal
development (`npm start` above is all you need day-to-day).

```bash
npm run dist
```

This produces a real installer in `dist/` — the exact file type depends on
which computer you run this command on:

- **On Linux**: `CareLedger-<version>.AppImage` — a clinic downloads this
  one file, makes it executable, and double-clicks it. No install step.
- **On Windows**: an NSIS `.exe` installer.
- **On Mac**: a `.dmg` you drag into Applications.

You must run `npm run dist` *on* the platform you're building for (a
Windows installer can only be built on Windows, etc.) — this is a limit of
how these installers are put together, not something CareLedger's code
controls. `dist/` is never committed to git (it's just built output, easy
to regenerate) — the file that matters is whatever comes out of that
folder, ready to hand to someone.

### Building Windows and Mac versions without owning a Windows or Mac computer

`.github/workflows/release.yml` builds all three platforms automatically
using GitHub's own free build machines (GitHub Actions) — no Windows or
Mac computer needed on our end. To ship a new version:

```bash
# 1. bump "version" in package.json, then:
git add package.json
git commit -m "bump version to 0.2.0"
git tag v0.2.0
git push && git push --tags
```

Pushing a tag like `v0.2.0` automatically triggers three builds (Linux,
Windows, Mac) on GitHub's servers, and each one publishes its installer to
the same GitHub Release — the tag version and `package.json`'s version
must match, since that's what electron-builder uses as the release name.
Progress can be watched under the repo's **Actions** tab on GitHub. It can
also be re-run by hand from that same tab ("Run workflow") without pushing
a new tag, e.g. to rebuild the current version again.

The local `npm run dist` / `npm run release` commands above still work for
a quick Linux build on this machine, but actual Windows/Mac installers can
only come from this GitHub Actions workflow (or a real Windows/Mac
computer) — building a `.exe` or `.dmg` from Linux directly isn't possible.

## How it's put together (plain words)

- **`src/main/`** — the "backend" that runs on the clinic's computer.
  - `db.js` — everything about the database: the tables (patients, visits,
    settings, staff) and every read/write function. This is the only file
    that talks to SQLite directly.
  - `auth.js` — password hashing/checking only (no database, no Electron —
    just the math for keeping passwords safe).
  - `session.js` — remembers who is currently logged in for this run of the
    app, and refuses actions when nobody is.
  - `ipc.js` — connects the on-screen buttons/forms to `db.js`, gated by
    `session.js` — every action (like "add a patient") passes through here
    and is checked and stamped with who did it.
  - `backup.js` — backup filenames and the "keep only the last 10" cleanup
    logic. Plain functions, no Electron or database code, so they're easy
    to test on their own.
  - `permissions.js` — the one place that says which role can do what
    (Admin/Doctor/Nurse/Front Desk). `session.js` calls into this; nothing
    else needs to know the rules.
  - `updater.js` — checks GitHub for a newer version and quietly downloads
    it; failures (e.g. no internet) are logged and otherwise ignored, never
    shown to the user or allowed to disrupt the app.
  - `csv.js` — turns rows + column definitions into proper CSV text
    (handles commas/quotes/newlines correctly). No database or Electron
    code, so it's directly unit-tested.
  - `licenseSync.js` — checks the `licenses.json` file in this GitHub repo
    for this install's Licensed Until date and adopts it locally if found
    (see "Remote subscription renewal" below). Failures are always treated
    as "nothing to update," never shown to the user.
  - `assistant.js` — builds the AI Assistant's system prompt (identity
    rules + the clinic's live data snapshot) and calls Anthropic's API.
    No database or Electron code, so the prompt-building half is directly
    unit-tested without needing a real API key.
  - `cloudSync.js` — pushes this clinic's Subscriptions data to the
    always-on `careledger-cloud` service. Failures are always treated as
    "will retry next interval," never shown to the user.
  - `main.js` — opens the app window, starts everything up, and schedules
    the automatic backup (shortly after opening, then hourly), the update
    check, and the remote license check (shortly after opening, then every
    6 hours).
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

Automatic backups live in `data/backups/` (dev) or the packaged app's user
data folder, alongside the real database — see the Automatic Backup section
above. The last 10 are kept automatically.

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

## Another gotcha (local dates vs. UTC dates)

The database's "today"/"this week" logic (Dashboard, Billing, low-stock
alerts) uses SQLite's `date('now', 'localtime')` — the clinic's own local
calendar day. JavaScript's `new Date().toISOString()` gives the UTC date
instead, which is a *different* calendar day for part of every single day
in any timezone that isn't exactly UTC+0. Always build a "today" date in
code with local getters (`date.getFullYear()`, `getMonth()`, `getDate()`),
never `toISOString().slice(0, 10)` — see `todayLocalDateString()` in
`app.js` and `localDateString()` in `test/db.test.js`. This bit us for
real once (a passing test started failing purely because the sandbox's
clock crossed local midnight while UTC hadn't yet), which is how it got
caught and fixed everywhere it appeared.

## Next step

Everything from the original product plan's build order is done, plus
automatic backup, packaging, printable receipts, role-based permissions,
vital signs, appointment scheduling, and a subscription expiry warning
banner. CareLedger is at the point
described in Section 9: build one small showable piece, demo it — except
now the whole thing is showable. The natural next step is real-world
testing: show it to 2-3 real clinics (Section 9), get their reaction, and
let that decide what gets refined next — rather than guessing what to
build without that feedback.

One more idea worth knowing about but **not built**: an **activity/audit
log** — a simple screen listing recent significant actions (logins,
staff added/removed, settings changed) with who and when. Every record
already remembers who created it (Phase 4), so most of the groundwork is
there; this would just be a dedicated place to see the trail at a glance.
Worth adding if/when trust and accountability become a bigger selling
point with clinics (this was inspired by looking at what an unrelated
company selling under the same name offers — see the naming conversation
from earlier).

Also still open, lower priority: cloud backup and phone access — the
plan's "optional extra layer".

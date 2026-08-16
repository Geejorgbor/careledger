// Minimal assertion-based test for the db layer. No test framework needed —
// run with `npm run test:db`. Uses an in-memory database so it never
// touches real clinic data.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createDb } = require('../src/main/db');
const { hashPassword, verifyPassword } = require('../src/main/auth');
const { createSession } = require('../src/main/session');
const { timestampedFilename, pruneOldBackups, runAutoBackup } = require('../src/main/backup');
const { canManageStaffAndSettings, canUseDispensary } = require('../src/main/permissions');
const { toCsvValue, toCsv } = require('../src/main/csv');
const { parseLicenseEntry } = require('../src/main/licenseSync');
const { buildSystemPrompt } = require('../src/main/assistant');

// The app's SQL uses date('now', 'localtime') for "today" — toISOString()
// is UTC, which drifts a day off from local "today" for part of every day
// depending on timezone (bit us for real once: system was 11:44pm local
// but already the next UTC day). Always build test dates from local
// getters so they agree with what the app itself considers "today".
function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function run() {
  const db = createDb(':memory:');

  // Registering a patient
  const patient = db.addPatient({
    firstName: 'Mary',
    lastName: 'Kollie',
    dateOfBirth: '1990-04-12',
    gender: 'Female',
    phone: '0770123456',
    address: 'Sinkor, Monrovia',
  });
  assert.ok(patient.id, 'patient should get an id');
  assert.strictEqual(patient.first_name, 'Mary');

  // Missing required field should throw
  assert.throws(() => db.addPatient({ firstName: '', lastName: 'X' }), /firstName/);

  // Listing / searching patients
  db.addPatient({ firstName: 'James', lastName: 'Doe' });
  const all = db.listPatients();
  assert.strictEqual(all.length, 2, 'should list both patients');
  const searched = db.listPatients('Kollie');
  assert.strictEqual(searched.length, 1);
  assert.strictEqual(searched[0].first_name, 'Mary');

  // Recording a visit
  const visit = db.addVisit({
    patientId: patient.id,
    visitDate: '2026-08-13',
    complaint: 'Fever',
    treatment: 'Paracetamol',
    paymentAmount: 15.5,
    paymentMethod: 'Cash',
    notes: 'Follow up in 3 days',
  });
  assert.ok(visit.id, 'visit should get an id');

  // Visit for a nonexistent patient should throw
  assert.throws(() => db.addVisit({ patientId: 9999, visitDate: '2026-08-13' }), /No patient/);

  // Pulling up visit history
  const visits = db.getVisitsForPatient(patient.id);
  assert.strictEqual(visits.length, 1);
  assert.strictEqual(visits[0].complaint, 'Fever');
  assert.strictEqual(visits[0].payment_amount, 15.5);

  // Billing: charge vs payment, balance, and income summary
  const today = localDateString();

  // Default case: no chargeAmount given -> assumed paid in full
  const paidInFullVisit = db.addVisit({
    patientId: patient.id,
    visitDate: today,
    paymentAmount: 20,
  });
  assert.strictEqual(paidInFullVisit.charge_amount, 20, 'charge should default to payment amount when omitted');

  // Explicit partial payment -> should show up as an outstanding balance
  const partialVisit = db.addVisit({
    patientId: patient.id,
    visitDate: today,
    chargeAmount: 50,
    paymentAmount: 30,
  });
  assert.strictEqual(partialVisit.charge_amount, 50);
  assert.strictEqual(partialVisit.payment_amount, 30);

  const outstanding = db.listOutstandingBalances();
  assert.strictEqual(outstanding.length, 1, 'only the partially-paid visit should be outstanding');
  assert.strictEqual(outstanding[0].visit_id, partialVisit.id);
  assert.strictEqual(outstanding[0].balance, 20);
  assert.strictEqual(outstanding[0].first_name, 'Mary');

  const income = db.getIncomeSummary();
  // 15.5 (first visit, dated 2026-08-13) + 20 (paid in full) + 30 (partial) = 65.5 paid today/this week/this month
  // (the 2026-08-13 visit only counts if "today" happens to be that date, so just check the two we know are today's)
  assert.ok(income.today >= 50, `today's income should include both of today's visits, got ${income.today}`);
  assert.ok(income.thisWeek >= income.today, 'this week should be at least this much');
  assert.ok(income.thisMonth >= income.thisWeek, 'this month should be at least this week');

  db.close();

  // Migration path: simulate a pre-Phase-2 database (visits table with no
  // charge_amount column) and make sure opening it with the current code
  // adds the column and backfills it without losing data.
  const legacyDbPath = path.join(os.tmpdir(), `careledger-legacy-test-${Date.now()}.db`);
  const legacyConn = new Database(legacyDbPath);
  legacyConn.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT, gender TEXT, phone TEXT, address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      visit_date TEXT NOT NULL,
      complaint TEXT, treatment TEXT,
      payment_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const legacyPatientId = legacyConn.prepare(
    `INSERT INTO patients (first_name, last_name) VALUES ('Old', 'Patient')`
  ).run().lastInsertRowid;
  legacyConn.prepare(
    `INSERT INTO visits (patient_id, visit_date, payment_amount) VALUES (?, '2026-01-01', 40)`
  ).run(legacyPatientId);
  legacyConn.close();

  const migratedDb = createDb(legacyDbPath);
  const migratedVisits = migratedDb.getVisitsForPatient(legacyPatientId);
  assert.strictEqual(migratedVisits.length, 1);
  assert.strictEqual(migratedVisits[0].charge_amount, 40, 'legacy visit should be backfilled as paid in full');
  migratedDb.close();
  fs.rmSync(legacyDbPath, { force: true });
  fs.rmSync(`${legacyDbPath}-wal`, { force: true });
  fs.rmSync(`${legacyDbPath}-shm`, { force: true });

  const db2 = createDb(':memory:');
  // Settings (white-label foundation)
  assert.strictEqual(db2.getSetting('clinicName'), null);
  db2.setSetting('clinicName', 'Good Hope Clinic');
  assert.strictEqual(db2.getSetting('clinicName'), 'Good Hope Clinic');
  db2.setSetting('clinicName', 'Renamed Clinic');
  assert.strictEqual(db2.getSetting('clinicName'), 'Renamed Clinic', 'setSetting should overwrite, not duplicate');

  // Drug Dispensary: stock + expiry tracking
  const soonDate = localDateString(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)); // 5 days from now
  const farDate = localDateString(new Date(Date.now() + 200 * 24 * 60 * 60 * 1000)); // ~6+ months out

  const paracetamol = db2.addDrug({
    name: 'Paracetamol',
    unit: 'tablet',
    quantityOnHand: 100,
    reorderLevel: 20,
    expiryDate: farDate,
  });
  assert.ok(paracetamol.id, 'drug should get an id');
  assert.strictEqual(paracetamol.quantity_on_hand, 100);

  assert.throws(() => db2.addDrug({ name: '' }), /name/, 'drug name is required');

  // Restocking increases quantity and logs a movement
  const afterRestock = db2.restockDrug({ drugId: paracetamol.id, quantity: 50, note: 'Delivery from supplier' });
  assert.strictEqual(afterRestock.quantity_on_hand, 150);

  // Dispensing decreases quantity and logs a movement
  const afterDispense = db2.dispenseDrug({ drugId: paracetamol.id, quantity: 30, note: 'Handed to patient' });
  assert.strictEqual(afterDispense.quantity_on_hand, 120);

  // Cannot dispense more than is in stock
  assert.throws(
    () => db2.dispenseDrug({ drugId: paracetamol.id, quantity: 9999 }),
    /in stock/,
    'should refuse to dispense more than is on hand'
  );

  // Movement history is recorded in order (most recent first)
  const movements = db2.getMovementsForDrug(paracetamol.id);
  assert.strictEqual(movements.length, 2);
  assert.strictEqual(movements[0].type, 'dispense');
  assert.strictEqual(movements[0].quantity, 30);
  assert.strictEqual(movements[1].type, 'restock');
  assert.strictEqual(movements[1].quantity, 50);

  // Low stock: a drug at/under its reorder level shows up
  const bandages = db2.addDrug({ name: 'Bandages', unit: 'roll', quantityOnHand: 5, reorderLevel: 10 });
  const lowStock = db2.listLowStockDrugs();
  assert.strictEqual(lowStock.length, 1, 'only Bandages is at/under its reorder level');
  assert.strictEqual(lowStock[0].id, bandages.id);

  // Expiring soon: within 30 days shows up, a distant expiry does not
  db2.addDrug({ name: 'Amoxicillin', unit: 'capsule', quantityOnHand: 40, reorderLevel: 10, expiryDate: soonDate });
  const expiringSoon = db2.listExpiringSoonDrugs();
  assert.strictEqual(expiringSoon.length, 1, 'only Amoxicillin expires within 30 days');
  assert.strictEqual(expiringSoon[0].name, 'Amoxicillin');

  // Staff Logins & Security

  // Password hashing: never store/compare plaintext, salted so two equal
  // passwords don't produce equal hashes
  const hash1 = hashPassword('correct-horse');
  const hash2 = hashPassword('correct-horse');
  assert.notStrictEqual(hash1, hash2, 'same password should hash differently each time (random salt)');
  assert.ok(verifyPassword('correct-horse', hash1), 'correct password should verify');
  assert.ok(!verifyPassword('wrong-password', hash1), 'wrong password should not verify');

  const nurse = db2.addStaff({ name: 'Nurse Joy', role: 'Nurse', username: 'NurseJoy', password: 'petals123' });
  assert.ok(nurse.id, 'staff should get an id');
  assert.strictEqual(nurse.password_hash, undefined, 'listStaff-shaped result should never include the password hash');
  assert.strictEqual(nurse.username, 'nursejoy', 'usernames are stored lowercase');

  assert.throws(() => db2.addStaff({ name: 'Someone', role: 'Nurse', username: 'nursejoy', password: 'x' }), /taken/, 'usernames must be unique, case-insensitively');
  assert.throws(() => db2.addStaff({ name: '', role: 'Nurse', username: 'x', password: 'x' }), /name/);

  const fullNurseRecord = db2.getStaffByUsername('nursejoy');
  assert.ok(fullNurseRecord.password_hash, 'internal lookup by username should include the hash for verification');
  assert.ok(verifyPassword('petals123', fullNurseRecord.password_hash));

  assert.strictEqual(db2.countActiveStaff(), 1);
  db2.setStaffActive(nurse.id, false);
  assert.strictEqual(db2.countActiveStaff(), 0, 'deactivated staff should not count as active');
  db2.setStaffActive(nurse.id, true);
  assert.strictEqual(db2.countActiveStaff(), 1);

  const staffList = db2.listStaff();
  assert.strictEqual(staffList.length, 1);
  assert.strictEqual(staffList[0].password_hash, undefined, 'listStaff must never expose password hashes to the renderer');

  // Session: login/logout, and requireLogin gating
  const session = createSession(db2);
  assert.strictEqual(session.hasAnyStaff(), true);
  assert.strictEqual(session.getCurrentStaff(), null, 'nobody logged in yet on a fresh session');
  assert.throws(() => session.requireLogin(), /Not logged in/);

  assert.throws(() => session.login('nursejoy', 'wrong-password'), /Incorrect/);
  assert.throws(() => session.login('nobody', 'petals123'), /Incorrect/);

  const loggedIn = session.login('nursejoy', 'petals123');
  assert.strictEqual(loggedIn.name, 'Nurse Joy');
  assert.strictEqual(loggedIn.password_hash, undefined, 'session-returned staff must never include the password hash');
  assert.deepStrictEqual(session.getCurrentStaff(), loggedIn);
  assert.deepStrictEqual(session.requireLogin(), loggedIn);

  db2.setStaffActive(nurse.id, false);
  assert.throws(() => session.login('nursejoy', 'petals123'), /Incorrect/, 'a deactivated account cannot log in');

  session.logout();
  assert.strictEqual(session.getCurrentStaff(), null);
  assert.throws(() => session.requireLogin(), /Not logged in/);

  db2.setStaffActive(nurse.id, true); // restore for reuse below
  session.login('nursejoy', 'petals123');
  const doctor = db2.addStaff({ name: 'Dr. Marshall', role: 'Doctor', username: 'drmarshall', password: 'stethoscope' });

  // Attribution: created_by_staff_id is stamped and joined back with a name
  const attributedPatient = db2.addPatient({ firstName: 'Attributed', lastName: 'Patient', createdByStaffId: doctor.id });
  const attributedVisit = db2.addVisit({
    patientId: attributedPatient.id,
    visitDate: today,
    paymentAmount: 10,
    createdByStaffId: doctor.id,
  });
  assert.strictEqual(attributedVisit.created_by_staff_id, doctor.id);
  const visitsWithAuthor = db2.getVisitsForPatient(attributedPatient.id);
  assert.strictEqual(visitsWithAuthor[0].recorded_by_name, 'Dr. Marshall', 'visit history should show who recorded it');

  const attributedDrug = db2.addDrug({ name: 'Ibuprofen', quantityOnHand: 50, reorderLevel: 10, createdByStaffId: doctor.id });
  db2.restockDrug({ drugId: attributedDrug.id, quantity: 10, createdByStaffId: doctor.id });
  const drugMovementsWithAuthor = db2.getMovementsForDrug(attributedDrug.id);
  assert.strictEqual(drugMovementsWithAuthor[0].recorded_by_name, 'Dr. Marshall', 'stock movements should show who did it');

  // A record made with no logged-in staff (or before Phase 4 existed) has
  // no author, and that's fine — not every historical record can have one.
  const unattributedPatient = db2.addPatient({ firstName: 'No', lastName: 'Author' });
  assert.strictEqual(unattributedPatient.created_by_staff_id, null);

  db2.close();

  // Migration path: a pre-Phase-4 database (no staff table, no
  // created_by_staff_id columns anywhere) should upgrade cleanly.
  const legacyDb2Path = path.join(os.tmpdir(), `careledger-legacy-phase4-test-${Date.now()}.db`);
  const legacyConn2 = new Database(legacyDb2Path);
  legacyConn2.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      date_of_birth TEXT, gender TEXT, phone TEXT, address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL,
      visit_date TEXT NOT NULL, complaint TEXT, treatment TEXT,
      charge_amount REAL NOT NULL DEFAULT 0, payment_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE drugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, unit TEXT,
      quantity_on_hand REAL NOT NULL DEFAULT 0, reorder_level REAL NOT NULL DEFAULT 0,
      expiry_date TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE drug_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, drug_id INTEGER NOT NULL,
      type TEXT NOT NULL, quantity REAL NOT NULL, note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const legacyPid2 = legacyConn2.prepare(`INSERT INTO patients (first_name, last_name) VALUES ('Legacy', 'Patient')`).run().lastInsertRowid;
  legacyConn2.close();

  const migratedDb2 = createDb(legacyDb2Path);
  assert.strictEqual(migratedDb2.countActiveStaff(), 0, 'no staff exist yet on an upgraded legacy database');
  const migratedPatient = migratedDb2.getPatient(legacyPid2);
  assert.strictEqual(migratedPatient.created_by_staff_id, null, 'pre-Phase-4 records simply have no known author');
  // The upgraded database should be fully usable: create the first account.
  const firstStaff = migratedDb2.addStaff({ name: 'Setup Admin', role: 'Admin', username: 'admin', password: 'setup123' });
  assert.ok(firstStaff.id);
  migratedDb2.close();
  fs.rmSync(legacyDb2Path, { force: true });
  fs.rmSync(`${legacyDb2Path}-wal`, { force: true });
  fs.rmSync(`${legacyDb2Path}-shm`, { force: true });

  // Dashboard: the "automatic magic" summary, on its own isolated db so the
  // counts are exact and easy to reason about.
  const db3 = createDb(':memory:');
  const alice = db3.addPatient({ firstName: 'Alice', lastName: 'A' });
  const bob = db3.addPatient({ firstName: 'Bob', lastName: 'B' });
  const carol = db3.addPatient({ firstName: 'Carol', lastName: 'C' });

  // Two visits today for Alice (same patient twice) should count as ONE
  // patient seen today, not two.
  db3.addVisit({ patientId: alice.id, visitDate: today, complaint: 'Fever', paymentAmount: 20 });
  db3.addVisit({ patientId: alice.id, visitDate: today, complaint: 'Fever', paymentAmount: 5 });
  db3.addVisit({ patientId: bob.id, visitDate: today, complaint: 'Cough', paymentAmount: 10 });
  // A week-old-but-not-today visit still counts for "this week" and for
  // top illnesses, just not for "today".
  const threeDaysAgo = localDateString(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  db3.addVisit({ patientId: carol.id, visitDate: threeDaysAgo, complaint: 'Fever', paymentAmount: 8 });

  db3.addDrug({ name: 'Low Stock Drug', quantityOnHand: 2, reorderLevel: 10 });
  db3.addDrug({ name: 'Expiring Drug', quantityOnHand: 100, reorderLevel: 10, expiryDate: soonDate });
  db3.addDrug({ name: 'Healthy Drug', quantityOnHand: 100, reorderLevel: 10, expiryDate: farDate });

  const summary = db3.getDashboardSummary();
  assert.strictEqual(summary.patientsToday, 2, 'Alice (once, despite 2 visits) + Bob seen today');
  assert.strictEqual(summary.patientsThisWeek, 3, 'Alice + Bob + Carol all seen within the week');
  assert.strictEqual(summary.incomeToday, 35, "today's income should only count today's visits (20 + 5 + 10)");

  assert.strictEqual(summary.topIllnessesThisWeek[0].complaint, 'Fever');
  assert.strictEqual(summary.topIllnessesThisWeek[0].n, 3, 'Fever appears on 3 visits this week (2 today + 1 three days ago)');
  assert.strictEqual(summary.topIllnessesThisWeek[1].complaint, 'Cough');
  assert.strictEqual(summary.topIllnessesThisWeek[1].n, 1);

  assert.strictEqual(summary.lowStockDrugs.length, 1);
  assert.strictEqual(summary.lowStockDrugs[0].name, 'Low Stock Drug');
  assert.strictEqual(summary.expiringSoonDrugs.length, 1);
  assert.strictEqual(summary.expiringSoonDrugs[0].name, 'Expiring Drug');
  // Healthy Drug should appear in neither list.

  db3.close();

  // Backup: db.backupTo() should produce a real, independently-openable
  // SQLite file with the same data — using SQLite's own online backup API,
  // not a raw file copy, so it's safe even while the source db is in use.
  const backupTestDbPath = path.join(os.tmpdir(), `careledger-backup-source-${Date.now()}.db`);
  const sourceDb = createDb(backupTestDbPath);
  sourceDb.addPatient({ firstName: 'Backup', lastName: 'Target' });

  const snapshotPath = path.join(os.tmpdir(), `careledger-backup-snapshot-${Date.now()}.db`);
  await sourceDb.backupTo(snapshotPath);
  sourceDb.close();

  const snapshotConn = new Database(snapshotPath, { readonly: true });
  const snapshotPatients = snapshotConn.prepare('SELECT * FROM patients').all();
  assert.strictEqual(snapshotPatients.length, 1);
  assert.strictEqual(snapshotPatients[0].first_name, 'Backup');
  snapshotConn.close();

  for (const p of [backupTestDbPath, `${backupTestDbPath}-wal`, `${backupTestDbPath}-shm`, snapshotPath]) {
    fs.rmSync(p, { force: true });
  }

  // timestampedFilename: sortable (chronological order == alphabetical
  // order) and always matches the pattern pruneOldBackups looks for.
  const nameA = timestampedFilename(new Date('2026-01-01T09:05:03'));
  const nameB = timestampedFilename(new Date('2026-01-01T09:05:04'));
  assert.ok(nameA < nameB, 'later timestamps should sort after earlier ones as plain strings');
  assert.ok(/^careledger-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/.test(nameA), `unexpected filename shape: ${nameA}`);

  // pruneOldBackups: keeps only the newest N, deletes the rest
  const pruneTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careledger-prune-test-'));
  const filenames = ['a', 'b', 'c', 'd', 'e'].map((_, i) => `careledger-backup-2026-01-0${i + 1}_00-00-00.db`);
  for (const name of filenames) fs.writeFileSync(path.join(pruneTestDir, name), 'x');
  fs.writeFileSync(path.join(pruneTestDir, 'not-a-backup-file.txt'), 'x'); // should be left alone

  const removedCount = pruneOldBackups(pruneTestDir, 3);
  assert.strictEqual(removedCount, 2);
  const remaining = fs.readdirSync(pruneTestDir).sort();
  assert.deepStrictEqual(remaining, ['careledger-backup-2026-01-03_00-00-00.db', 'careledger-backup-2026-01-04_00-00-00.db', 'careledger-backup-2026-01-05_00-00-00.db', 'not-a-backup-file.txt'], 'should keep the 3 newest backups and the unrelated file');
  fs.rmSync(pruneTestDir, { recursive: true, force: true });

  // runAutoBackup: end-to-end — creates the backups dir, writes a real
  // snapshot, and prunes down to the configured maximum.
  const autoBackupSourcePath = path.join(os.tmpdir(), `careledger-autobackup-source-${Date.now()}.db`);
  const autoBackupDb = createDb(autoBackupSourcePath);
  autoBackupDb.addPatient({ firstName: 'Auto', lastName: 'Backup' });
  const autoBackupsDir = path.join(os.tmpdir(), `careledger-autobackup-dir-${Date.now()}`);

  const firstBackupPath = await runAutoBackup(autoBackupDb, autoBackupsDir);
  assert.ok(fs.existsSync(firstBackupPath), 'runAutoBackup should create the backup file');
  assert.strictEqual(fs.readdirSync(autoBackupsDir).length, 1);

  autoBackupDb.close();
  fs.rmSync(autoBackupSourcePath, { force: true });
  fs.rmSync(`${autoBackupSourcePath}-wal`, { force: true });
  fs.rmSync(`${autoBackupSourcePath}-shm`, { force: true });
  fs.rmSync(autoBackupsDir, { recursive: true, force: true });

  // Role-based permissions
  assert.strictEqual(canManageStaffAndSettings('Admin'), true);
  assert.strictEqual(canManageStaffAndSettings('Doctor'), false);
  assert.strictEqual(canManageStaffAndSettings('Nurse'), false);
  assert.strictEqual(canManageStaffAndSettings('Front Desk'), false);

  assert.strictEqual(canUseDispensary('Admin'), true);
  assert.strictEqual(canUseDispensary('Doctor'), true);
  assert.strictEqual(canUseDispensary('Nurse'), true);
  assert.strictEqual(canUseDispensary('Front Desk'), false);

  const db4 = createDb(':memory:');
  db4.addStaff({ name: 'Admin Person', role: 'Admin', username: 'admin1', password: 'pw' });
  db4.addStaff({ name: 'Front Desk Person', role: 'Front Desk', username: 'frontdesk1', password: 'pw' });
  db4.addStaff({ name: 'Doctor Person', role: 'Doctor', username: 'doctor1', password: 'pw' });

  const session2 = createSession(db4);

  // Front Desk: can log in and do normal logged-in things, but not admin
  // or dispensary actions
  session2.login('frontdesk1', 'pw');
  assert.doesNotThrow(() => session2.requireLogin());
  assert.throws(() => session2.requireAdmin(), /Admin/);
  assert.throws(() => session2.requireDispensaryAccess(), /Front Desk/);

  // Doctor: dispensary yes, admin no
  session2.login('doctor1', 'pw');
  assert.doesNotThrow(() => session2.requireDispensaryAccess());
  assert.throws(() => session2.requireAdmin(), /Admin/);

  // Admin: both
  session2.login('admin1', 'pw');
  assert.doesNotThrow(() => session2.requireAdmin());
  assert.doesNotThrow(() => session2.requireDispensaryAccess());

  db4.close();

  // Vital signs on a visit
  const db5 = createDb(':memory:');
  const vitalsPatient = db5.addPatient({ firstName: 'Vitals', lastName: 'Test' });

  const vitalsVisit = db5.addVisit({
    patientId: vitalsPatient.id,
    visitDate: today,
    temperatureC: 38.5,
    bloodPressure: '120/80',
    pulseBpm: 72,
    weightKg: 65.4,
  });
  assert.strictEqual(vitalsVisit.temperature_c, 38.5);
  assert.strictEqual(vitalsVisit.blood_pressure, '120/80');
  assert.strictEqual(vitalsVisit.pulse_bpm, 72);
  assert.strictEqual(vitalsVisit.weight_kg, 65.4);

  // Vitals are entirely optional — a visit with none of them should just
  // store nulls, not fail or default to 0 (0°C / 0 bpm would be a very
  // misleading medical record).
  const noVitalsVisit = db5.addVisit({ patientId: vitalsPatient.id, visitDate: today, paymentAmount: 5 });
  assert.strictEqual(noVitalsVisit.temperature_c, null);
  assert.strictEqual(noVitalsVisit.blood_pressure, null);
  assert.strictEqual(noVitalsVisit.pulse_bpm, null);
  assert.strictEqual(noVitalsVisit.weight_kg, null);

  db5.close();

  // Appointment scheduling
  const db6 = createDb(':memory:');
  const apptPatient = db6.addPatient({ firstName: 'Appt', lastName: 'Patient' });
  const tomorrow = localDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const yesterday = localDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const appt = db6.addAppointment({
    patientId: apptPatient.id,
    appointmentDate: tomorrow,
    appointmentTime: '09:30',
    reason: 'Follow-up',
  });
  assert.ok(appt.id, 'appointment should get an id');
  assert.strictEqual(appt.status, 'Scheduled', 'new appointments default to Scheduled');

  assert.throws(() => db6.addAppointment({ patientId: 9999, appointmentDate: tomorrow }), /No patient/);
  assert.throws(() => db6.addAppointment({ patientId: apptPatient.id, appointmentDate: '' }), /appointmentDate/);

  // Upcoming list: only today-or-later, Scheduled appointments show up
  const pastAppt = db6.addAppointment({ patientId: apptPatient.id, appointmentDate: yesterday, reason: 'Old visit' });
  let upcoming = db6.listUpcomingAppointments();
  assert.strictEqual(upcoming.length, 1, 'a past-dated appointment should not show as upcoming');
  assert.strictEqual(upcoming[0].id, appt.id);
  assert.strictEqual(upcoming[0].first_name, 'Appt', 'upcoming list should include patient name via join');

  // Changing status removes it from the upcoming (Scheduled-only) list
  db6.setAppointmentStatus(appt.id, 'Completed');
  upcoming = db6.listUpcomingAppointments();
  assert.strictEqual(upcoming.length, 0, 'a completed appointment should no longer be upcoming');

  assert.throws(() => db6.setAppointmentStatus(appt.id, 'NotARealStatus'), /status must be one of/);
  assert.throws(() => db6.setAppointmentStatus(99999, 'Cancelled'), /No appointment/);

  const patientAppts = db6.getAppointmentsForPatient(apptPatient.id);
  assert.strictEqual(patientAppts.length, 2, 'patient should have both appointments in their history');

  db6.close();

  // CSV export
  assert.strictEqual(toCsvValue(null), '');
  assert.strictEqual(toCsvValue(undefined), '');
  assert.strictEqual(toCsvValue(42), '42');
  assert.strictEqual(toCsvValue('plain'), 'plain');
  assert.strictEqual(toCsvValue('has,comma'), '"has,comma"');
  assert.strictEqual(toCsvValue('has "quotes"'), '"has ""quotes"""');
  assert.strictEqual(toCsvValue('has\nnewline'), '"has\nnewline"');

  const csv = toCsv(
    [{ name: 'Mary, Kollie', notes: 'said "hello"' }, { name: 'James', notes: '' }],
    [{ key: 'name', header: 'Name' }, { key: 'notes', header: 'Notes' }]
  );
  const csvLines = csv.split('\r\n');
  assert.strictEqual(csvLines[0], 'Name,Notes');
  assert.strictEqual(csvLines[1], '"Mary, Kollie","said ""hello"""');
  assert.strictEqual(csvLines[2], 'James,');

  // Export queries: unlimited (unlike the on-screen lists) and correctly joined
  const db7 = createDb(':memory:');
  const exportStaff = db7.addStaff({ name: 'Export Nurse', role: 'Nurse', username: 'exportnurse', password: 'pw' });
  const exportPatient = db7.addPatient({ firstName: 'Export', lastName: 'Patient' });
  db7.addVisit({ patientId: exportPatient.id, visitDate: today, complaint: 'Cough', paymentAmount: 12, createdByStaffId: exportStaff.id });
  db7.addDrug({ name: 'Export Drug', unit: 'tablet', quantityOnHand: 10, reorderLevel: 2 });

  const exportedPatients = db7.listAllPatients();
  assert.strictEqual(exportedPatients.length, 1);
  assert.strictEqual(exportedPatients[0].first_name, 'Export');

  const exportedVisits = db7.listAllVisits();
  assert.strictEqual(exportedVisits.length, 1);
  assert.strictEqual(exportedVisits[0].first_name, 'Export', 'exported visits should include the patient name via join');
  assert.strictEqual(exportedVisits[0].recorded_by_name, 'Export Nurse', 'exported visits should include who recorded it');

  const exportedDrugs = db7.listAllDrugs();
  assert.strictEqual(exportedDrugs.length, 1);
  assert.strictEqual(exportedDrugs[0].name, 'Export Drug');

  db7.close();

  // Clinic id: stable across calls, unique per database
  const db8 = createDb(':memory:');
  const clinicIdFirstCall = db8.getOrCreateClinicId();
  assert.ok(clinicIdFirstCall, 'clinic id should be generated');
  assert.strictEqual(db8.getOrCreateClinicId(), clinicIdFirstCall, 'clinic id should be stable across calls');

  const db9 = createDb(':memory:');
  assert.notStrictEqual(db9.getOrCreateClinicId(), clinicIdFirstCall, 'clinic id should differ per install');
  db8.close();
  db9.close();

  // Remote license file parsing (licenseSync.js) — pure logic, no network
  assert.strictEqual(parseLicenseEntry('not json', 'abc'), null, 'malformed JSON should be treated as no update');
  assert.strictEqual(parseLicenseEntry('{}', 'abc'), null, 'unknown clinic id should be treated as no update');
  assert.strictEqual(
    parseLicenseEntry('{"abc": {"expiresAt": "not-a-date-field"}}', 'xyz'),
    null,
    'a different clinic id in the file should not match'
  );
  assert.strictEqual(
    parseLicenseEntry('{"abc": {}}', 'abc'),
    null,
    'an entry with no expiresAt should be treated as no update'
  );
  const match = parseLicenseEntry('{"abc": {"expiresAt": "2027-01-15", "clinicName": "Test Clinic"}}', 'abc');
  assert.deepStrictEqual(match, { expiresAt: '2027-01-15' });

  const matchWithPlan = parseLicenseEntry('{"abc": {"expiresAt": "2027-01-15", "plan": "10month"}}', 'abc');
  assert.deepStrictEqual(matchWithPlan, { expiresAt: '2027-01-15', plan: '10month' });

  const matchWithBadPlan = parseLicenseEntry('{"abc": {"expiresAt": "2027-01-15", "plan": "lifetime"}}', 'abc');
  assert.deepStrictEqual(matchWithBadPlan, { expiresAt: '2027-01-15' }, 'an unrecognized plan value should be dropped, not trusted blindly');

  // Advanced Reports & Trends (10-Month plan bonus) — db-level aggregation
  const db10 = createDb(':memory:');
  const trendsStaff = db10.addStaff({ name: 'Trends Nurse', role: 'Nurse', username: 'trendsnurse', password: 'pw' });
  const trendsPatientA = db10.addPatient({ firstName: 'Trend', lastName: 'PatientA' });
  const trendsPatientB = db10.addPatient({ firstName: 'Trend', lastName: 'PatientB' });
  db10.addVisit({ patientId: trendsPatientA.id, visitDate: today, complaint: 'Malaria', paymentAmount: 15, createdByStaffId: trendsStaff.id });
  db10.addVisit({ patientId: trendsPatientB.id, visitDate: today, complaint: 'Malaria', paymentAmount: 25, createdByStaffId: trendsStaff.id });
  db10.addVisit({ patientId: trendsPatientA.id, visitDate: today, complaint: 'Typhoid', paymentAmount: 10, createdByStaffId: trendsStaff.id });

  const monthlyVisits = db10.getMonthlyVisitTrends();
  assert.strictEqual(monthlyVisits.length, 6, 'trend window should always be exactly 6 months, even the quiet ones');
  const currentMonthTrend = monthlyVisits[monthlyVisits.length - 1];
  assert.strictEqual(currentMonthTrend.month, today.slice(0, 7), 'the last bucket should be the current month');
  assert.strictEqual(currentMonthTrend.visitCount, 3);
  assert.strictEqual(currentMonthTrend.income, 50);
  assert.strictEqual(monthlyVisits[0].visitCount, 0, 'a month with no visits should show as zero, not be skipped');

  const newPatients = db10.getNewPatientsByMonth();
  assert.strictEqual(newPatients.length, 6);
  assert.strictEqual(newPatients[newPatients.length - 1].count, 2, 'both patients were registered this month');

  const topIllnesses = db10.getTopIllnessesLast6Months();
  assert.strictEqual(topIllnesses[0].complaint, 'Malaria');
  assert.strictEqual(topIllnesses[0].n, 2);

  // AI Assistant (10-Month plan bonus): daily message quota
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(db10.checkAndConsumeAiMessageQuota(5), true, `message ${i + 1} of 5 should be allowed, still under the daily limit`);
  }
  assert.strictEqual(db10.checkAndConsumeAiMessageQuota(5), false, 'a 6th message should be blocked once the daily limit of 5 is reached');
  db10.close();

  // AI Assistant: system prompt always tells the truth about being an AI,
  // and never lets a clinic-chosen name make it claim to be a real person
  const prompt = buildSystemPrompt('Nana', { patientsSeenToday: 3 });
  assert.ok(prompt.includes('Nana'), 'system prompt should use the configured assistant name');
  assert.ok(/automated assistant/i.test(prompt), 'system prompt must identify itself as automated');
  assert.ok(/not a human/i.test(prompt) || /not a real person/i.test(prompt), 'system prompt must rule out claiming to be human');
  assert.ok(prompt.includes('"patientsSeenToday": 3'), 'system prompt should include the live data snapshot');

  console.log('All db.js tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

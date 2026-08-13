// Minimal assertion-based test for the db layer. No test framework needed —
// run with `npm run test:db`. Uses an in-memory database so it never
// touches real clinic data.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createDb } = require('../src/main/db');

function run() {
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
  const today = new Date().toISOString().slice(0, 10);

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

  db2.close();
  console.log('All db.js tests passed.');
}

run();

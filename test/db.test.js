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

  // Drug Dispensary: stock + expiry tracking
  const soonDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 5 days from now
  const farDate = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // ~6+ months out

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

  db2.close();
  console.log('All db.js tests passed.');
}

run();

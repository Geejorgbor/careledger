// Minimal assertion-based test for the db layer. No test framework needed —
// run with `npm run test:db`. Uses an in-memory database so it never
// touches real clinic data.

const assert = require('assert');
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

  // Settings (white-label foundation)
  assert.strictEqual(db.getSetting('clinicName'), null);
  db.setSetting('clinicName', 'Good Hope Clinic');
  assert.strictEqual(db.getSetting('clinicName'), 'Good Hope Clinic');
  db.setSetting('clinicName', 'Renamed Clinic');
  assert.strictEqual(db.getSetting('clinicName'), 'Renamed Clinic', 'setSetting should overwrite, not duplicate');

  db.close();
  console.log('All db.js tests passed.');
}

run();

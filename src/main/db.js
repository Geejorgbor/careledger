const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  visit_date TEXT NOT NULL,
  complaint TEXT,
  treatment TEXT,
  charge_amount REAL NOT NULL DEFAULT 0,
  payment_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
`;

/**
 * Brings an older database file up to the current schema. Only ever adds
 * columns and backfills them — never drops or rewrites existing data, so a
 * clinic's real records are never at risk when the app is updated.
 */
function runMigrations(conn) {
  const visitCols = conn.prepare("PRAGMA table_info(visits)").all().map((c) => c.name);
  if (!visitCols.includes('charge_amount')) {
    conn.exec('ALTER TABLE visits ADD COLUMN charge_amount REAL');
    // Phase 1 only ever recorded a single payment figure, which was always
    // treated as "paid in full" — so that's the correct backfill for what
    // was owed on those older visits.
    conn.exec('UPDATE visits SET charge_amount = payment_amount WHERE charge_amount IS NULL');
  }
}

/**
 * Opens (creating if needed) the CareLedger SQLite database and returns
 * a plain object of query functions. dbPath may be a file path or ':memory:'.
 */
function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  runMigrations(conn);

  const stmts = {
    insertPatient: conn.prepare(`
      INSERT INTO patients (first_name, last_name, date_of_birth, gender, phone, address)
      VALUES (@firstName, @lastName, @dateOfBirth, @gender, @phone, @address)
    `),
    getPatientById: conn.prepare(`SELECT * FROM patients WHERE id = ?`),
    searchPatients: conn.prepare(`
      SELECT * FROM patients
      WHERE first_name LIKE @term OR last_name LIKE @term OR phone LIKE @term
      ORDER BY last_name, first_name
      LIMIT 200
    `),
    listPatients: conn.prepare(`
      SELECT * FROM patients ORDER BY last_name, first_name LIMIT 200
    `),
    insertVisit: conn.prepare(`
      INSERT INTO visits (patient_id, visit_date, complaint, treatment, charge_amount, payment_amount, payment_method, notes)
      VALUES (@patientId, @visitDate, @complaint, @treatment, @chargeAmount, @paymentAmount, @paymentMethod, @notes)
    `),
    getVisitsForPatient: conn.prepare(`
      SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC, id DESC
    `),
    getSetting: conn.prepare(`SELECT value FROM settings WHERE key = ?`),
    setSetting: conn.prepare(`
      INSERT INTO settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
    incomeToday: conn.prepare(`
      SELECT COALESCE(SUM(payment_amount), 0) AS total FROM visits
      WHERE visit_date = date('now', 'localtime')
    `),
    incomeThisWeek: conn.prepare(`
      SELECT COALESCE(SUM(payment_amount), 0) AS total FROM visits
      WHERE visit_date >= date('now', 'localtime', 'weekday 0', '-6 days')
    `),
    incomeThisMonth: conn.prepare(`
      SELECT COALESCE(SUM(payment_amount), 0) AS total FROM visits
      WHERE visit_date >= date('now', 'localtime', 'start of month')
    `),
    outstandingBalances: conn.prepare(`
      SELECT
        v.id AS visit_id,
        v.visit_date,
        v.charge_amount,
        v.payment_amount,
        (v.charge_amount - v.payment_amount) AS balance,
        p.id AS patient_id,
        p.first_name,
        p.last_name
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE v.charge_amount > v.payment_amount
      ORDER BY v.visit_date DESC
    `),
  };

  function requireNonEmpty(value, fieldName) {
    if (!value || !String(value).trim()) {
      throw new Error(`${fieldName} is required`);
    }
  }

  return {
    addPatient({ firstName, lastName, dateOfBirth, gender, phone, address }) {
      requireNonEmpty(firstName, 'firstName');
      requireNonEmpty(lastName, 'lastName');
      const info = stmts.insertPatient.run({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        phone: phone || null,
        address: address || null,
      });
      return stmts.getPatientById.get(info.lastInsertRowid);
    },

    getPatient(id) {
      return stmts.getPatientById.get(id);
    },

    listPatients(searchTerm) {
      if (searchTerm && searchTerm.trim()) {
        return stmts.searchPatients.all({ term: `%${searchTerm.trim()}%` });
      }
      return stmts.listPatients.all();
    },

    addVisit({ patientId, visitDate, complaint, treatment, chargeAmount, paymentAmount, paymentMethod, notes }) {
      if (!patientId) throw new Error('patientId is required');
      requireNonEmpty(visitDate, 'visitDate');
      if (!stmts.getPatientById.get(patientId)) {
        throw new Error(`No patient with id ${patientId}`);
      }
      const paid = Number(paymentAmount) || 0;
      // If no charge is given, assume the visit was charged exactly what
      // was paid (the common case: pay in full on the spot).
      const charged = chargeAmount === undefined || chargeAmount === null || chargeAmount === ''
        ? paid
        : Number(chargeAmount) || 0;
      const info = stmts.insertVisit.run({
        patientId,
        visitDate,
        complaint: complaint || null,
        treatment: treatment || null,
        chargeAmount: charged,
        paymentAmount: paid,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
      });
      return conn.prepare('SELECT * FROM visits WHERE id = ?').get(info.lastInsertRowid);
    },

    getVisitsForPatient(patientId) {
      return stmts.getVisitsForPatient.all(patientId);
    },

    getIncomeSummary() {
      return {
        today: stmts.incomeToday.get().total,
        thisWeek: stmts.incomeThisWeek.get().total,
        thisMonth: stmts.incomeThisMonth.get().total,
      };
    },

    listOutstandingBalances() {
      return stmts.outstandingBalances.all();
    },

    getSetting(key) {
      const row = stmts.getSetting.get(key);
      return row ? row.value : null;
    },

    setSetting(key, value) {
      stmts.setSetting.run({ key, value });
    },

    close() {
      conn.close();
    },
  };
}

module.exports = { createDb };

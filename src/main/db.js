const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./auth');

// Last n "YYYY-MM" month labels ending with the current month, oldest first
// — built from local Date getters (not UTC) so "this month" always agrees
// with the clinic's own calendar, same rule as every other date in the app.
function lastNMonthLabels(n) {
  const now = new Date();
  const labels = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return labels;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  address TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  visit_date TEXT NOT NULL,
  complaint TEXT,
  treatment TEXT,
  temperature_c REAL,
  blood_pressure TEXT,
  pulse_bpm INTEGER,
  weight_kg REAL,
  charge_amount REAL NOT NULL DEFAULT 0,
  payment_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT,
  quantity_on_hand REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  expiry_date TEXT,
  notes TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drug_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drug_id INTEGER NOT NULL REFERENCES drugs(id),
  type TEXT NOT NULL CHECK (type IN ('restock', 'dispense')),
  quantity REAL NOT NULL,
  note TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_date TEXT NOT NULL,
  appointment_time TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Completed', 'Cancelled', 'No-Show')),
  notes TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_drug_movements_drug_id ON drug_movements(drug_id);
CREATE INDEX IF NOT EXISTS idx_drugs_name ON drugs(name);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
`;

/**
 * Brings an older database file up to the current schema. Only ever adds
 * columns and backfills them — never drops or rewrites existing data, so a
 * clinic's real records are never at risk when the app is updated.
 */
function addColumnIfMissing(conn, table, column, ddl) {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function runMigrations(conn) {
  const visitCols = conn.prepare("PRAGMA table_info(visits)").all().map((c) => c.name);
  if (!visitCols.includes('charge_amount')) {
    conn.exec('ALTER TABLE visits ADD COLUMN charge_amount REAL');
    // Phase 1 only ever recorded a single payment figure, which was always
    // treated as "paid in full" — so that's the correct backfill for what
    // was owed on those older visits.
    conn.exec('UPDATE visits SET charge_amount = payment_amount WHERE charge_amount IS NULL');
  }

  // Records made before Phase 4 (logins) simply have no known author —
  // left NULL rather than guessed at.
  addColumnIfMissing(conn, 'patients', 'created_by_staff_id', 'created_by_staff_id INTEGER REFERENCES staff(id)');
  addColumnIfMissing(conn, 'visits', 'created_by_staff_id', 'created_by_staff_id INTEGER REFERENCES staff(id)');
  addColumnIfMissing(conn, 'drugs', 'created_by_staff_id', 'created_by_staff_id INTEGER REFERENCES staff(id)');
  addColumnIfMissing(conn, 'drug_movements', 'created_by_staff_id', 'created_by_staff_id INTEGER REFERENCES staff(id)');

  // Vital signs — added after visits already existed in older databases.
  addColumnIfMissing(conn, 'visits', 'temperature_c', 'temperature_c REAL');
  addColumnIfMissing(conn, 'visits', 'blood_pressure', 'blood_pressure TEXT');
  addColumnIfMissing(conn, 'visits', 'pulse_bpm', 'pulse_bpm INTEGER');
  addColumnIfMissing(conn, 'visits', 'weight_kg', 'weight_kg REAL');
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
      INSERT INTO patients (first_name, last_name, date_of_birth, gender, phone, address, created_by_staff_id)
      VALUES (@firstName, @lastName, @dateOfBirth, @gender, @phone, @address, @createdByStaffId)
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
    // Deliberately no LIMIT — these back CSV export, where "give me
    // everything" is the whole point, unlike the on-screen lists above.
    listAllPatients: conn.prepare(`
      SELECT * FROM patients ORDER BY last_name, first_name
    `),
    insertVisit: conn.prepare(`
      INSERT INTO visits (patient_id, visit_date, complaint, treatment, temperature_c, blood_pressure, pulse_bpm, weight_kg, charge_amount, payment_amount, payment_method, notes, created_by_staff_id)
      VALUES (@patientId, @visitDate, @complaint, @treatment, @temperatureC, @bloodPressure, @pulseBpm, @weightKg, @chargeAmount, @paymentAmount, @paymentMethod, @notes, @createdByStaffId)
    `),
    getVisitsForPatient: conn.prepare(`
      SELECT v.*, s.name AS recorded_by_name
      FROM visits v
      LEFT JOIN staff s ON s.id = v.created_by_staff_id
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC, v.id DESC
    `),
    listAllVisits: conn.prepare(`
      SELECT v.*, p.first_name, p.last_name, s.name AS recorded_by_name
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN staff s ON s.id = v.created_by_staff_id
      ORDER BY v.visit_date, v.id
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
    patientsSeenToday: conn.prepare(`
      SELECT COUNT(DISTINCT patient_id) AS n FROM visits
      WHERE visit_date = date('now', 'localtime')
    `),
    patientsSeenThisWeek: conn.prepare(`
      SELECT COUNT(DISTINCT patient_id) AS n FROM visits
      WHERE visit_date >= date('now', 'localtime', 'weekday 0', '-6 days')
    `),
    topIllnessesThisWeek: conn.prepare(`
      SELECT complaint, COUNT(*) AS n FROM visits
      WHERE visit_date >= date('now', 'localtime', 'weekday 0', '-6 days')
        AND complaint IS NOT NULL AND trim(complaint) != ''
      GROUP BY complaint
      ORDER BY n DESC, complaint
      LIMIT 5
    `),
    monthlyVisitTrends: conn.prepare(`
      SELECT
        strftime('%Y-%m', visit_date) AS month,
        COUNT(*) AS visit_count,
        COALESCE(SUM(payment_amount), 0) AS income
      FROM visits
      WHERE visit_date >= date('now', 'localtime', 'start of month', '-5 months')
      GROUP BY month
    `),
    newPatientsByMonth: conn.prepare(`
      SELECT strftime('%Y-%m', created_at, 'localtime') AS month, COUNT(*) AS n
      FROM patients
      WHERE created_at >= datetime('now', '-6 months')
      GROUP BY month
    `),
    topIllnessesLast6Months: conn.prepare(`
      SELECT complaint, COUNT(*) AS n FROM visits
      WHERE visit_date >= date('now', 'localtime', 'start of month', '-5 months')
        AND complaint IS NOT NULL AND trim(complaint) != ''
      GROUP BY complaint
      ORDER BY n DESC, complaint
      LIMIT 8
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
    insertDrug: conn.prepare(`
      INSERT INTO drugs (name, unit, quantity_on_hand, reorder_level, expiry_date, notes, created_by_staff_id)
      VALUES (@name, @unit, @quantityOnHand, @reorderLevel, @expiryDate, @notes, @createdByStaffId)
    `),
    getDrugById: conn.prepare(`SELECT * FROM drugs WHERE id = ?`),
    searchDrugs: conn.prepare(`
      SELECT * FROM drugs WHERE name LIKE @term ORDER BY name LIMIT 200
    `),
    listDrugs: conn.prepare(`SELECT * FROM drugs ORDER BY name LIMIT 200`),
    listAllDrugs: conn.prepare(`SELECT * FROM drugs ORDER BY name`),
    updateDrugQuantity: conn.prepare(`
      UPDATE drugs SET quantity_on_hand = @quantityOnHand WHERE id = @id
    `),
    insertMovement: conn.prepare(`
      INSERT INTO drug_movements (drug_id, type, quantity, note, created_by_staff_id)
      VALUES (@drugId, @type, @quantity, @note, @createdByStaffId)
    `),
    getMovementsForDrug: conn.prepare(`
      SELECT m.*, s.name AS recorded_by_name
      FROM drug_movements m
      LEFT JOIN staff s ON s.id = m.created_by_staff_id
      WHERE m.drug_id = ?
      ORDER BY m.created_at DESC, m.id DESC
    `),
    lowStockDrugs: conn.prepare(`
      SELECT * FROM drugs WHERE quantity_on_hand <= reorder_level ORDER BY name
    `),
    expiringSoonDrugs: conn.prepare(`
      SELECT * FROM drugs
      WHERE expiry_date IS NOT NULL AND expiry_date <= date('now', 'localtime', '+30 days')
      ORDER BY expiry_date
    `),
    insertAppointment: conn.prepare(`
      INSERT INTO appointments (patient_id, appointment_date, appointment_time, reason, notes, created_by_staff_id)
      VALUES (@patientId, @appointmentDate, @appointmentTime, @reason, @notes, @createdByStaffId)
    `),
    getAppointmentById: conn.prepare(`SELECT * FROM appointments WHERE id = ?`),
    getAppointmentsForPatient: conn.prepare(`
      SELECT * FROM appointments WHERE patient_id = ?
      ORDER BY appointment_date DESC, appointment_time DESC, id DESC
    `),
    upcomingAppointments: conn.prepare(`
      SELECT a.*, p.first_name, p.last_name, p.phone
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.status = 'Scheduled' AND a.appointment_date >= date('now', 'localtime')
      ORDER BY a.appointment_date, a.appointment_time
    `),
    setAppointmentStatus: conn.prepare(`UPDATE appointments SET status = @status WHERE id = @id`),
    appointmentsTodayCount: conn.prepare(`
      SELECT COUNT(*) AS n FROM appointments
      WHERE status = 'Scheduled' AND appointment_date = date('now', 'localtime')
    `),
    insertStaff: conn.prepare(`
      INSERT INTO staff (name, role, username, password_hash)
      VALUES (@name, @role, @username, @passwordHash)
    `),
    getStaffById: conn.prepare(`SELECT * FROM staff WHERE id = ?`),
    getStaffByUsername: conn.prepare(`SELECT * FROM staff WHERE username = ?`),
    // Deliberately excludes password_hash — this is the shape sent to the
    // renderer, and a password hash should never leave the main process.
    listStaff: conn.prepare(`
      SELECT id, name, role, username, active, created_at FROM staff ORDER BY name
    `),
    countActiveStaff: conn.prepare(`SELECT COUNT(*) AS n FROM staff WHERE active = 1`),
    setStaffActive: conn.prepare(`UPDATE staff SET active = @active WHERE id = @id`),
  };

  function requireNonEmpty(value, fieldName) {
    if (!value || !String(value).trim()) {
      throw new Error(`${fieldName} is required`);
    }
  }

  return {
    addPatient({ firstName, lastName, dateOfBirth, gender, phone, address, createdByStaffId }) {
      requireNonEmpty(firstName, 'firstName');
      requireNonEmpty(lastName, 'lastName');
      const info = stmts.insertPatient.run({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        phone: phone || null,
        address: address || null,
        createdByStaffId: createdByStaffId || null,
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

    listAllPatients() {
      return stmts.listAllPatients.all();
    },

    listAllVisits() {
      return stmts.listAllVisits.all();
    },

    addVisit({ patientId, visitDate, complaint, treatment, temperatureC, bloodPressure, pulseBpm, weightKg, chargeAmount, paymentAmount, paymentMethod, notes, createdByStaffId }) {
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
      const toNullableNumber = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
      const info = stmts.insertVisit.run({
        patientId,
        visitDate,
        complaint: complaint || null,
        treatment: treatment || null,
        temperatureC: toNullableNumber(temperatureC),
        bloodPressure: bloodPressure || null,
        pulseBpm: toNullableNumber(pulseBpm),
        weightKg: toNullableNumber(weightKg),
        chargeAmount: charged,
        paymentAmount: paid,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        createdByStaffId: createdByStaffId || null,
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

    // The one-screen "automatic magic" summary — nothing here is new data,
    // it's all totals and lists pulled together from patients/visits/drugs
    // so nobody has to add anything up by hand.
    getDashboardSummary() {
      return {
        patientsToday: stmts.patientsSeenToday.get().n,
        patientsThisWeek: stmts.patientsSeenThisWeek.get().n,
        incomeToday: stmts.incomeToday.get().total,
        appointmentsToday: stmts.appointmentsTodayCount.get().n,
        topIllnessesThisWeek: stmts.topIllnessesThisWeek.all(),
        lowStockDrugs: stmts.lowStockDrugs.all(),
        expiringSoonDrugs: stmts.expiringSoonDrugs.all(),
      };
    },

    listOutstandingBalances() {
      return stmts.outstandingBalances.all();
    },

    // Advanced Reports & Trends (10-Month plan bonus). Every month in the
    // window is always present, even with zero activity, so the chart
    // never silently skips a quiet month.
    getMonthlyVisitTrends() {
      const rows = stmts.monthlyVisitTrends.all();
      return lastNMonthLabels(6).map((month) => {
        const row = rows.find((r) => r.month === month);
        return { month, visitCount: row ? row.visit_count : 0, income: row ? row.income : 0 };
      });
    },

    getNewPatientsByMonth() {
      const rows = stmts.newPatientsByMonth.all();
      return lastNMonthLabels(6).map((month) => {
        const row = rows.find((r) => r.month === month);
        return { month, count: row ? row.n : 0 };
      });
    },

    getTopIllnessesLast6Months() {
      return stmts.topIllnessesLast6Months.all();
    },

    getSetting(key) {
      const row = stmts.getSetting.get(key);
      return row ? row.value : null;
    },

    setSetting(key, value) {
      stmts.setSetting.run({ key, value });
    },

    // A stable random id for this one installed copy of the app, used to
    // look it up in the remote licenses file (see licenseSync.js) without
    // exposing anything identifying about the clinic itself. Created once,
    // on first use, and never changes after that.
    getOrCreateClinicId() {
      const existing = stmts.getSetting.get('clinicId');
      if (existing && existing.value) return existing.value;
      const id = crypto.randomUUID();
      stmts.setSetting.run({ key: 'clinicId', value: id });
      return id;
    },

    addDrug({ name, unit, quantityOnHand, reorderLevel, expiryDate, notes, createdByStaffId }) {
      requireNonEmpty(name, 'name');
      const info = stmts.insertDrug.run({
        name: name.trim(),
        unit: unit || null,
        quantityOnHand: Number(quantityOnHand) || 0,
        reorderLevel: Number(reorderLevel) || 0,
        expiryDate: expiryDate || null,
        notes: notes || null,
        createdByStaffId: createdByStaffId || null,
      });
      return stmts.getDrugById.get(info.lastInsertRowid);
    },

    getDrug(id) {
      return stmts.getDrugById.get(id);
    },

    listDrugs(searchTerm) {
      if (searchTerm && searchTerm.trim()) {
        return stmts.searchDrugs.all({ term: `%${searchTerm.trim()}%` });
      }
      return stmts.listDrugs.all();
    },

    listAllDrugs() {
      return stmts.listAllDrugs.all();
    },

    // Adds to stock (a new delivery arriving). If a new expiry date is
    // given it replaces the stored one — clinics track the soonest
    // expiring batch, not a full per-batch history, to keep this simple.
    restockDrug({ drugId, quantity, expiryDate, note, createdByStaffId }) {
      const drug = stmts.getDrugById.get(drugId);
      if (!drug) throw new Error(`No drug with id ${drugId}`);
      const qty = Number(quantity);
      if (!qty || qty <= 0) throw new Error('quantity must be greater than 0');
      const run = conn.transaction(() => {
        stmts.updateDrugQuantity.run({ id: drugId, quantityOnHand: drug.quantity_on_hand + qty });
        if (expiryDate) {
          conn.prepare('UPDATE drugs SET expiry_date = ? WHERE id = ?').run(expiryDate, drugId);
        }
        stmts.insertMovement.run({ drugId, type: 'restock', quantity: qty, note: note || null, createdByStaffId: createdByStaffId || null });
      });
      run();
      return stmts.getDrugById.get(drugId);
    },

    // Removes from stock (medicine handed to a patient). Cannot dispense
    // more than is on hand — the count must always reflect real stock.
    dispenseDrug({ drugId, quantity, note, createdByStaffId }) {
      const drug = stmts.getDrugById.get(drugId);
      if (!drug) throw new Error(`No drug with id ${drugId}`);
      const qty = Number(quantity);
      if (!qty || qty <= 0) throw new Error('quantity must be greater than 0');
      if (qty > drug.quantity_on_hand) {
        throw new Error(`Only ${drug.quantity_on_hand} ${drug.unit || 'unit(s)'} of ${drug.name} in stock`);
      }
      const run = conn.transaction(() => {
        stmts.updateDrugQuantity.run({ id: drugId, quantityOnHand: drug.quantity_on_hand - qty });
        stmts.insertMovement.run({ drugId, type: 'dispense', quantity: qty, note: note || null, createdByStaffId: createdByStaffId || null });
      });
      run();
      return stmts.getDrugById.get(drugId);
    },

    getMovementsForDrug(drugId) {
      return stmts.getMovementsForDrug.all(drugId);
    },

    listLowStockDrugs() {
      return stmts.lowStockDrugs.all();
    },

    listExpiringSoonDrugs() {
      return stmts.expiringSoonDrugs.all();
    },

    addAppointment({ patientId, appointmentDate, appointmentTime, reason, notes, createdByStaffId }) {
      if (!patientId) throw new Error('patientId is required');
      requireNonEmpty(appointmentDate, 'appointmentDate');
      if (!stmts.getPatientById.get(patientId)) {
        throw new Error(`No patient with id ${patientId}`);
      }
      const info = stmts.insertAppointment.run({
        patientId,
        appointmentDate,
        appointmentTime: appointmentTime || null,
        reason: reason || null,
        notes: notes || null,
        createdByStaffId: createdByStaffId || null,
      });
      return stmts.getAppointmentById.get(info.lastInsertRowid);
    },

    getAppointmentsForPatient(patientId) {
      return stmts.getAppointmentsForPatient.all(patientId);
    },

    listUpcomingAppointments() {
      return stmts.upcomingAppointments.all();
    },

    setAppointmentStatus(id, status) {
      const validStatuses = ['Scheduled', 'Completed', 'Cancelled', 'No-Show'];
      if (!validStatuses.includes(status)) {
        throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
      }
      if (!stmts.getAppointmentById.get(id)) {
        throw new Error(`No appointment with id ${id}`);
      }
      stmts.setAppointmentStatus.run({ id, status });
      return stmts.getAppointmentById.get(id);
    },

    addStaff({ name, role, username, password }) {
      requireNonEmpty(name, 'name');
      requireNonEmpty(role, 'role');
      requireNonEmpty(username, 'username');
      requireNonEmpty(password, 'password');
      try {
        const info = stmts.insertStaff.run({
          name: name.trim(),
          role: role.trim(),
          username: username.trim().toLowerCase(),
          passwordHash: hashPassword(password),
        });
        return stmts.listStaff.all().find((s) => s.id === info.lastInsertRowid);
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT') {
          throw new Error(`Username "${username}" is already taken`);
        }
        throw err;
      }
    },

    // Internal use only (session/login) — includes the password hash, so
    // this must never be sent to the renderer.
    getStaffByUsername(username) {
      return stmts.getStaffByUsername.get(username.trim().toLowerCase());
    },

    getStaffById(id) {
      return stmts.getStaffById.get(id);
    },

    listStaff() {
      return stmts.listStaff.all();
    },

    countActiveStaff() {
      return stmts.countActiveStaff.get().n;
    },

    setStaffActive(id, active) {
      stmts.setStaffActive.run({ id, active: active ? 1 : 0 });
    },

    // Uses SQLite's own online backup API (via better-sqlite3) rather than
    // copying the file directly — this produces a consistent snapshot even
    // while the database is open and being written to, which a plain file
    // copy of a WAL-mode database cannot safely guarantee.
    backupTo(destPath) {
      return conn.backup(destPath);
    },

    close() {
      conn.close();
    },
  };
}

module.exports = { createDb };

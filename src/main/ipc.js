const { ipcMain } = require('electron');

/**
 * Wires renderer IPC channels to the database layer. Every handler is
 * wrapped so thrown errors become { ok: false, error } instead of crashing
 * the app or leaving the renderer hanging.
 *
 * Every clinic-data channel requires a logged-in staff member (enforced
 * here in the main process, not just hidden in the UI — a renderer bug or
 * a tampered window can never bypass this). Actions that create a record
 * are stamped with who did it.
 */
function registerIpcHandlers(db, session) {
  function handle(channel, fn) {
    ipcMain.handle(channel, (_event, ...args) => {
      try {
        return { ok: true, data: fn(...args) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
  }

  // ---------- Auth ----------
  handle('auth:hasStaff', () => session.hasAnyStaff());
  handle('auth:login', (username, password) => session.login(username, password));
  handle('auth:logout', () => session.logout());
  handle('auth:currentStaff', () => session.getCurrentStaff());

  // ---------- Staff management ----------
  // The very first account can be created with nobody logged in yet (there's
  // no one else who could do it). After that, adding staff requires being
  // logged in as an existing staff member.
  handle('staff:add', (data) => {
    const isFirstAccount = !session.hasAnyStaff();
    if (!isFirstAccount) session.requireLogin();
    const staff = db.addStaff(data);
    if (isFirstAccount) session.login(data.username, data.password);
    return staff;
  });
  handle('staff:list', () => {
    session.requireLogin();
    return db.listStaff();
  });
  handle('staff:setActive', (id, active) => {
    session.requireLogin();
    db.setStaffActive(id, active);
  });

  // ---------- Patients ----------
  handle('patients:add', (patient) => {
    const staff = session.requireLogin();
    return db.addPatient({ ...patient, createdByStaffId: staff.id });
  });
  handle('patients:list', (searchTerm) => {
    session.requireLogin();
    return db.listPatients(searchTerm);
  });
  handle('patients:get', (id) => {
    session.requireLogin();
    return db.getPatient(id);
  });

  // ---------- Visits ----------
  handle('visits:add', (visit) => {
    const staff = session.requireLogin();
    return db.addVisit({ ...visit, createdByStaffId: staff.id });
  });
  handle('visits:listForPatient', (patientId) => {
    session.requireLogin();
    return db.getVisitsForPatient(patientId);
  });

  // ---------- Dashboard ----------
  handle('dashboard:summary', () => {
    session.requireLogin();
    return db.getDashboardSummary();
  });

  // ---------- Billing ----------
  handle('billing:incomeSummary', () => {
    session.requireLogin();
    return db.getIncomeSummary();
  });
  handle('billing:outstandingBalances', () => {
    session.requireLogin();
    return db.listOutstandingBalances();
  });

  // ---------- Dispensary ----------
  handle('drugs:add', (drug) => {
    const staff = session.requireLogin();
    return db.addDrug({ ...drug, createdByStaffId: staff.id });
  });
  handle('drugs:list', (searchTerm) => {
    session.requireLogin();
    return db.listDrugs(searchTerm);
  });
  handle('drugs:get', (id) => {
    session.requireLogin();
    return db.getDrug(id);
  });
  handle('drugs:restock', (data) => {
    const staff = session.requireLogin();
    return db.restockDrug({ ...data, createdByStaffId: staff.id });
  });
  handle('drugs:dispense', (data) => {
    const staff = session.requireLogin();
    return db.dispenseDrug({ ...data, createdByStaffId: staff.id });
  });
  handle('drugs:movements', (drugId) => {
    session.requireLogin();
    return db.getMovementsForDrug(drugId);
  });
  handle('drugs:lowStock', () => {
    session.requireLogin();
    return db.listLowStockDrugs();
  });
  handle('drugs:expiringSoon', () => {
    session.requireLogin();
    return db.listExpiringSoonDrugs();
  });

  // ---------- Settings ----------
  handle('settings:get', (key) => db.getSetting(key));
  handle('settings:set', (key, value) => {
    session.requireLogin();
    db.setSetting(key, value);
  });
}

module.exports = { registerIpcHandlers };

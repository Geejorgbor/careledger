const { ipcMain, dialog, BrowserWindow } = require('electron');
const { runAutoBackup } = require('./backup');

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
function registerIpcHandlers(db, session, getBackupsDir) {
  function handle(channel, fn) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
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
    if (!isFirstAccount) session.requireAdmin();
    const staff = db.addStaff(data);
    if (isFirstAccount) session.login(data.username, data.password);
    return staff;
  });
  handle('staff:list', () => {
    session.requireLogin();
    return db.listStaff();
  });
  handle('staff:setActive', (id, active) => {
    session.requireAdmin();
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

  // ---------- Appointments ----------
  handle('appointments:add', (appointment) => {
    const staff = session.requireLogin();
    return db.addAppointment({ ...appointment, createdByStaffId: staff.id });
  });
  handle('appointments:listForPatient', (patientId) => {
    session.requireLogin();
    return db.getAppointmentsForPatient(patientId);
  });
  handle('appointments:listUpcoming', () => {
    session.requireLogin();
    return db.listUpcomingAppointments();
  });
  handle('appointments:setStatus', (id, status) => {
    session.requireLogin();
    return db.setAppointmentStatus(id, status);
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
    const staff = session.requireDispensaryAccess();
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
    const staff = session.requireDispensaryAccess();
    return db.restockDrug({ ...data, createdByStaffId: staff.id });
  });
  handle('drugs:dispense', (data) => {
    const staff = session.requireDispensaryAccess();
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

  // ---------- Backups ----------
  handle('backup:status', () => {
    session.requireLogin();
    return {
      lastBackupAt: db.getSetting('lastBackupAt'),
      lastBackupError: db.getSetting('lastBackupError'),
      lastManualBackupAt: db.getSetting('lastManualBackupAt'),
    };
  });
  handle('backup:runNow', async () => {
    session.requireLogin();
    const dest = await runAutoBackup(db, getBackupsDir());
    db.setSetting('lastBackupAt', new Date().toISOString());
    db.setSetting('lastBackupError', '');
    return { path: dest };
  });
  handle('backup:exportTo', async () => {
    session.requireLogin();
    const win = BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Back Up CareLedger Data',
      defaultPath: `careledger-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'CareLedger Backup', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    await db.backupTo(filePath);
    db.setSetting('lastManualBackupAt', new Date().toISOString());
    return { canceled: false, filePath };
  });

  // ---------- Settings ----------
  handle('settings:get', (key) => db.getSetting(key));
  handle('settings:set', (key, value) => {
    session.requireAdmin();
    db.setSetting(key, value);
  });
}

module.exports = { registerIpcHandlers };

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { runAutoBackup } = require('./backup');
const { autoUpdater } = require('./updater');
const { toCsv } = require('./csv');

const MAX_LOGO_BYTES = 3 * 1024 * 1024; // 3MB — a clinic logo should never need to be bigger
const LOGO_MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };

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

  // ---------- App / Updates ----------
  handle('app:getVersion', () => app.getVersion());
  handle('app:checkForUpdates', async () => {
    session.requireLogin();
    if (!app.isPackaged) {
      throw new Error('Checking for updates only works in the installed app, not while developing.');
    }
    const result = await autoUpdater.checkForUpdates();
    return { version: result && result.updateInfo ? result.updateInfo.version : app.getVersion() };
  });

  // ---------- Data export ----------
  async function exportToCsv(defaultFilename, rows, columns) {
    const win = BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Data',
      defaultPath: defaultFilename,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, toCsv(rows, columns));
    return { canceled: false, filePath };
  }

  const todayStamp = () => new Date().toISOString().slice(0, 10);

  handle('export:patients', async () => {
    session.requireLogin();
    const rows = db.listAllPatients();
    const columns = [
      { key: 'first_name', header: 'First Name' },
      { key: 'last_name', header: 'Last Name' },
      { key: 'date_of_birth', header: 'Date of Birth' },
      { key: 'gender', header: 'Gender' },
      { key: 'phone', header: 'Phone' },
      { key: 'address', header: 'Address' },
      { key: 'created_at', header: 'Registered At' },
    ];
    return exportToCsv(`careledger-patients-${todayStamp()}.csv`, rows, columns);
  });

  handle('export:visits', async () => {
    session.requireLogin();
    const rows = db.listAllVisits().map((v) => ({
      ...v,
      patient_name: `${v.first_name} ${v.last_name}`,
      balance: v.charge_amount - v.payment_amount,
    }));
    const columns = [
      { key: 'visit_date', header: 'Visit Date' },
      { key: 'patient_name', header: 'Patient' },
      { key: 'complaint', header: 'Complaint' },
      { key: 'treatment', header: 'Treatment' },
      { key: 'temperature_c', header: 'Temperature (C)' },
      { key: 'blood_pressure', header: 'Blood Pressure' },
      { key: 'pulse_bpm', header: 'Pulse (bpm)' },
      { key: 'weight_kg', header: 'Weight (kg)' },
      { key: 'charge_amount', header: 'Charged' },
      { key: 'payment_amount', header: 'Paid' },
      { key: 'balance', header: 'Balance' },
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'notes', header: 'Notes' },
      { key: 'recorded_by_name', header: 'Recorded By' },
    ];
    return exportToCsv(`careledger-visits-${todayStamp()}.csv`, rows, columns);
  });

  handle('export:drugs', async () => {
    session.requireLogin();
    const rows = db.listAllDrugs();
    const columns = [
      { key: 'name', header: 'Name' },
      { key: 'unit', header: 'Unit' },
      { key: 'quantity_on_hand', header: 'Quantity On Hand' },
      { key: 'reorder_level', header: 'Reorder Level' },
      { key: 'expiry_date', header: 'Expiry Date' },
      { key: 'notes', header: 'Notes' },
    ];
    return exportToCsv(`careledger-drugs-${todayStamp()}.csv`, rows, columns);
  });

  // ---------- Settings ----------
  handle('settings:get', (key) => db.getSetting(key));
  handle('settings:set', (key, value) => {
    session.requireAdmin();
    db.setSetting(key, value);
  });
  // The logo is stored as a data URI right inside the settings table (not
  // a separate file) — so it's automatically included in every backup and
  // survives moving/reinstalling the app, same as everything else.
  handle('settings:pickLogo', async () => {
    session.requireAdmin();
    const win = BrowserWindow.getAllWindows()[0];
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose Clinic Logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { canceled: true };

    const filePath = filePaths[0];
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_LOGO_BYTES) {
      throw new Error('That image is too large — please choose one under 3MB.');
    }
    const mimeType = LOGO_MIME_TYPES[path.extname(filePath).toLowerCase()];
    if (!mimeType) {
      throw new Error('Please choose a PNG, JPG, or GIF image.');
    }
    const dataUri = `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
    db.setSetting('clinicLogo', dataUri);
    return { canceled: false, dataUri };
  });
}

module.exports = { registerIpcHandlers };

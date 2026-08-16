const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createDb } = require('./db');
const { registerIpcHandlers } = require('./ipc');
const { createSession } = require('./session');
const { runAutoBackup } = require('./backup');
const { checkForUpdatesQuietly } = require('./updater');
const { checkRemoteLicense } = require('./licenseSync');

const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FIRST_AUTO_BACKUP_DELAY_MS = 10 * 1000; // shortly after startup, not blocking it

const LICENSE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const FIRST_LICENSE_SYNC_DELAY_MS = 15 * 1000; // shortly after startup, not blocking it

let mainWindow;
let db;

function getDbPath() {
  // In dev (not packaged), keep the database inside the project folder so
  // it's easy to find and reset. Once packaged, use Electron's per-user
  // data directory so each clinic's data persists across app updates.
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '..', 'data', 'careledger.db');
  }
  return path.join(app.getPath('userData'), 'careledger.db');
}

function getBackupsDir() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '..', 'data', 'backups');
  }
  return path.join(app.getPath('userData'), 'backups');
}

async function performAutoBackup() {
  try {
    await runAutoBackup(db, getBackupsDir());
    db.setSetting('lastBackupAt', new Date().toISOString());
  } catch (err) {
    // Backup quietly retries next interval — a failed backup (e.g. disk
    // full) must never crash the app or block someone from using it.
    console.error('Automatic backup failed:', err);
    db.setSetting('lastBackupError', err.message);
  }
}

async function performLicenseSync() {
  try {
    const clinicId = db.getOrCreateClinicId();
    const remote = await checkRemoteLicense(clinicId);
    if (!remote) return; // offline, file missing, or this clinic not listed — nothing to do

    const currentExpiresAt = db.getSetting('licenseExpiresAt');
    const currentPlan = db.getSetting('licensePlan');
    const expiresAtChanged = remote.expiresAt !== currentExpiresAt;
    const planChanged = Boolean(remote.plan) && remote.plan !== currentPlan;
    if (!expiresAtChanged && !planChanged) return; // already up to date

    db.setSetting('licenseExpiresAt', remote.expiresAt);
    if (remote.plan) db.setSetting('licensePlan', remote.plan);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('license:updated', {
        expiresAt: remote.expiresAt,
        plan: remote.plan || currentPlan || null,
      });
    }
  } catch (err) {
    // Same rule as backups and updates: a remote-license hiccup must never
    // crash the app or interrupt anyone using it.
    console.error('License sync failed:', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  db = createDb(getDbPath());
  const session = createSession(db);
  registerIpcHandlers(db, session, getBackupsDir);
  createWindow();

  setTimeout(performAutoBackup, FIRST_AUTO_BACKUP_DELAY_MS);
  setInterval(performAutoBackup, AUTO_BACKUP_INTERVAL_MS);

  setTimeout(performLicenseSync, FIRST_LICENSE_SYNC_DELAY_MS);
  setInterval(performLicenseSync, LICENSE_SYNC_INTERVAL_MS);

  // Only checks in the real installed app — during development (npm
  // start) there's no packaged update artifact to compare against.
  if (app.isPackaged) {
    checkForUpdatesQuietly();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

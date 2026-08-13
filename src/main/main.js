const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createDb } = require('./db');
const { registerIpcHandlers } = require('./ipc');
const { createSession } = require('./session');
const { runAutoBackup } = require('./backup');

const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FIRST_AUTO_BACKUP_DELAY_MS = 10 * 1000; // shortly after startup, not blocking it

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

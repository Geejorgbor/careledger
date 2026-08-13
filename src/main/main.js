const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createDb } = require('./db');
const { registerIpcHandlers } = require('./ipc');

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
  registerIpcHandlers(db);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

const { ipcMain } = require('electron');

/**
 * Wires renderer IPC channels to the database layer. Every handler is
 * wrapped so thrown errors become { ok: false, error } instead of crashing
 * the app or leaving the renderer hanging.
 */
function registerIpcHandlers(db) {
  function handle(channel, fn) {
    ipcMain.handle(channel, (_event, ...args) => {
      try {
        return { ok: true, data: fn(...args) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
  }

  handle('patients:add', (patient) => db.addPatient(patient));
  handle('patients:list', (searchTerm) => db.listPatients(searchTerm));
  handle('patients:get', (id) => db.getPatient(id));
  handle('visits:add', (visit) => db.addVisit(visit));
  handle('visits:listForPatient', (patientId) => db.getVisitsForPatient(patientId));
  handle('billing:incomeSummary', () => db.getIncomeSummary());
  handle('billing:outstandingBalances', () => db.listOutstandingBalances());
  handle('drugs:add', (drug) => db.addDrug(drug));
  handle('drugs:list', (searchTerm) => db.listDrugs(searchTerm));
  handle('drugs:get', (id) => db.getDrug(id));
  handle('drugs:restock', (data) => db.restockDrug(data));
  handle('drugs:dispense', (data) => db.dispenseDrug(data));
  handle('drugs:movements', (drugId) => db.getMovementsForDrug(drugId));
  handle('drugs:lowStock', () => db.listLowStockDrugs());
  handle('drugs:expiringSoon', () => db.listExpiringSoonDrugs());
  handle('settings:get', (key) => db.getSetting(key));
  handle('settings:set', (key, value) => db.setSetting(key, value));
}

module.exports = { registerIpcHandlers };

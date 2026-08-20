const { contextBridge, ipcRenderer } = require('electron');

function unwrap(promise) {
  return promise.then((result) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  });
}

contextBridge.exposeInMainWorld('careledger', {
  hasStaff: () => unwrap(ipcRenderer.invoke('auth:hasStaff')),
  login: (username, password) => unwrap(ipcRenderer.invoke('auth:login', username, password)),
  logout: () => unwrap(ipcRenderer.invoke('auth:logout')),
  currentStaff: () => unwrap(ipcRenderer.invoke('auth:currentStaff')),
  addStaff: (data) => unwrap(ipcRenderer.invoke('staff:add', data)),
  listStaff: () => unwrap(ipcRenderer.invoke('staff:list')),
  setStaffActive: (id, active) => unwrap(ipcRenderer.invoke('staff:setActive', id, active)),

  addPatient: (patient) => unwrap(ipcRenderer.invoke('patients:add', patient)),
  listPatients: (searchTerm) => unwrap(ipcRenderer.invoke('patients:list', searchTerm)),
  getPatient: (id) => unwrap(ipcRenderer.invoke('patients:get', id)),
  addVisit: (visit) => unwrap(ipcRenderer.invoke('visits:add', visit)),
  listVisitsForPatient: (patientId) => unwrap(ipcRenderer.invoke('visits:listForPatient', patientId)),
  addSubscriptionClient: (client) => unwrap(ipcRenderer.invoke('subscriptions:add', client)),
  listSubscriptionClients: (searchTerm) => unwrap(ipcRenderer.invoke('subscriptions:list', searchTerm)),
  getSubscriptionClient: (id) => unwrap(ipcRenderer.invoke('subscriptions:get', id)),
  setSubscriptionClientStatus: (id, status) => unwrap(ipcRenderer.invoke('subscriptions:setStatus', id, status)),
  addSubscriptionHistory: (entry) => unwrap(ipcRenderer.invoke('subscriptions:addHistory', entry)),
  getSubscriptionHistoryForClient: (clientId) => unwrap(ipcRenderer.invoke('subscriptions:historyForClient', clientId)),
  getRefillsDue: (windowDays) => unwrap(ipcRenderer.invoke('subscriptions:refillsDue', windowDays)),
  addAppointment: (appointment) => unwrap(ipcRenderer.invoke('appointments:add', appointment)),
  listAppointmentsForPatient: (patientId) => unwrap(ipcRenderer.invoke('appointments:listForPatient', patientId)),
  listUpcomingAppointments: () => unwrap(ipcRenderer.invoke('appointments:listUpcoming')),
  setAppointmentStatus: (id, status) => unwrap(ipcRenderer.invoke('appointments:setStatus', id, status)),
  getDashboardSummary: () => unwrap(ipcRenderer.invoke('dashboard:summary')),
  getIncomeSummary: () => unwrap(ipcRenderer.invoke('billing:incomeSummary')),
  listOutstandingBalances: () => unwrap(ipcRenderer.invoke('billing:outstandingBalances')),
  addDrug: (drug) => unwrap(ipcRenderer.invoke('drugs:add', drug)),
  listDrugs: (searchTerm) => unwrap(ipcRenderer.invoke('drugs:list', searchTerm)),
  getDrug: (id) => unwrap(ipcRenderer.invoke('drugs:get', id)),
  restockDrug: (data) => unwrap(ipcRenderer.invoke('drugs:restock', data)),
  dispenseDrug: (data) => unwrap(ipcRenderer.invoke('drugs:dispense', data)),
  getMovementsForDrug: (drugId) => unwrap(ipcRenderer.invoke('drugs:movements', drugId)),
  listLowStockDrugs: () => unwrap(ipcRenderer.invoke('drugs:lowStock')),
  listExpiringSoonDrugs: () => unwrap(ipcRenderer.invoke('drugs:expiringSoon')),
  exportPatients: () => unwrap(ipcRenderer.invoke('export:patients')),
  exportVisits: () => unwrap(ipcRenderer.invoke('export:visits')),
  exportDrugs: () => unwrap(ipcRenderer.invoke('export:drugs')),
  getBackupStatus: () => unwrap(ipcRenderer.invoke('backup:status')),
  runBackupNow: () => unwrap(ipcRenderer.invoke('backup:runNow')),
  exportBackup: () => unwrap(ipcRenderer.invoke('backup:exportTo')),
  getAppVersion: () => unwrap(ipcRenderer.invoke('app:getVersion')),
  checkForUpdates: () => unwrap(ipcRenderer.invoke('app:checkForUpdates')),
  getSetting: (key) => unwrap(ipcRenderer.invoke('settings:get', key)),
  setSetting: (key, value) => unwrap(ipcRenderer.invoke('settings:set', key, value)),
  pickClinicLogo: () => unwrap(ipcRenderer.invoke('settings:pickLogo')),
  getClinicId: () => unwrap(ipcRenderer.invoke('settings:getClinicId')),
  onLicenseUpdated: (callback) => {
    ipcRenderer.on('license:updated', (_event, data) => callback(data));
  },
  getTrends: () => unwrap(ipcRenderer.invoke('reports:trends')),

  getAssistantSettings: () => unwrap(ipcRenderer.invoke('assistant:getSettings')),
  saveAssistantSettings: (data) => unwrap(ipcRenderer.invoke('assistant:saveSettings', data)),
  sendAssistantMessage: (history, message) => unwrap(ipcRenderer.invoke('assistant:sendMessage', { history, message })),
});

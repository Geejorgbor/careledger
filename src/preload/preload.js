const { contextBridge, ipcRenderer } = require('electron');

function unwrap(promise) {
  return promise.then((result) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  });
}

contextBridge.exposeInMainWorld('careledger', {
  addPatient: (patient) => unwrap(ipcRenderer.invoke('patients:add', patient)),
  listPatients: (searchTerm) => unwrap(ipcRenderer.invoke('patients:list', searchTerm)),
  getPatient: (id) => unwrap(ipcRenderer.invoke('patients:get', id)),
  addVisit: (visit) => unwrap(ipcRenderer.invoke('visits:add', visit)),
  listVisitsForPatient: (patientId) => unwrap(ipcRenderer.invoke('visits:listForPatient', patientId)),
  getSetting: (key) => unwrap(ipcRenderer.invoke('settings:get', key)),
  setSetting: (key, value) => unwrap(ipcRenderer.invoke('settings:set', key, value)),
});

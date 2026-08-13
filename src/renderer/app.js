// CareLedger renderer — plain JS, no framework. Screens are shown/hidden
// sections; state lives in a few module-level variables.

let currentPatientId = null;
let currentDrugId = null;

const els = {
  authScreen: document.getElementById('auth-screen'),
  appRoot: document.getElementById('app'),
  formSetup: document.getElementById('form-setup'),
  setupError: document.getElementById('setup-error'),
  formLogin: document.getElementById('form-login'),
  loginError: document.getElementById('login-error'),
  currentStaffLabel: document.getElementById('current-staff-label'),
  btnLogout: document.getElementById('btn-logout'),

  dashPatientsToday: document.getElementById('dash-patients-today'),
  dashPatientsWeek: document.getElementById('dash-patients-week'),
  dashIncomeToday: document.getElementById('dash-income-today'),
  dashNeedsAttention: document.getElementById('dash-needs-attention'),
  dashIllnessesTableBody: document.getElementById('dash-illnesses-table-body'),
  dashIllnessesEmpty: document.getElementById('dash-illnesses-empty'),
  dashAttentionTableBody: document.getElementById('dash-attention-table-body'),
  dashAttentionEmpty: document.getElementById('dash-attention-empty'),

  staffTableBody: document.getElementById('staff-table-body'),
  btnNewStaff: document.getElementById('btn-new-staff'),
  modalNewStaff: document.getElementById('modal-new-staff'),
  formNewStaff: document.getElementById('form-new-staff'),

  backupStatus: document.getElementById('backup-status'),
  btnBackupNow: document.getElementById('btn-backup-now'),
  btnBackupExport: document.getElementById('btn-backup-export'),

  clinicName: document.getElementById('clinic-name'),
  navBtns: document.querySelectorAll('.nav-btn'),
  views: document.querySelectorAll('.view'),

  patientSearch: document.getElementById('patient-search'),
  patientsTableBody: document.getElementById('patients-table-body'),
  patientsEmpty: document.getElementById('patients-empty'),
  btnNewPatient: document.getElementById('btn-new-patient'),

  detailPatientName: document.getElementById('detail-patient-name'),
  detailPatientMeta: document.getElementById('detail-patient-meta'),
  visitsTableBody: document.getElementById('visits-table-body'),
  visitsEmpty: document.getElementById('visits-empty'),
  btnNewVisit: document.getElementById('btn-new-visit'),
  btnBackToPatients: document.getElementById('btn-back-to-patients'),

  settingsForm: document.getElementById('settings-form'),
  settingsClinicName: document.getElementById('settings-clinic-name'),
  settingsSaved: document.getElementById('settings-saved'),

  modalNewPatient: document.getElementById('modal-new-patient'),
  formNewPatient: document.getElementById('form-new-patient'),
  modalNewVisit: document.getElementById('modal-new-visit'),
  formNewVisit: document.getElementById('form-new-visit'),

  incomeToday: document.getElementById('income-today'),
  incomeWeek: document.getElementById('income-week'),
  incomeMonth: document.getElementById('income-month'),
  outstandingTableBody: document.getElementById('outstanding-table-body'),
  outstandingEmpty: document.getElementById('outstanding-empty'),

  drugSearch: document.getElementById('drug-search'),
  drugsTableBody: document.getElementById('drugs-table-body'),
  drugsEmpty: document.getElementById('drugs-empty'),
  btnNewDrug: document.getElementById('btn-new-drug'),

  detailDrugName: document.getElementById('detail-drug-name'),
  detailDrugMeta: document.getElementById('detail-drug-meta'),
  drugMovementsTableBody: document.getElementById('drug-movements-table-body'),
  drugMovementsEmpty: document.getElementById('drug-movements-empty'),
  btnRestockDrug: document.getElementById('btn-restock-drug'),
  btnDispenseDrug: document.getElementById('btn-dispense-drug'),
  btnBackToDrugs: document.getElementById('btn-back-to-drugs'),

  modalNewDrug: document.getElementById('modal-new-drug'),
  formNewDrug: document.getElementById('form-new-drug'),
  modalRestockDrug: document.getElementById('modal-restock-drug'),
  formRestockDrug: document.getElementById('form-restock-drug'),
  modalDispenseDrug: document.getElementById('modal-dispense-drug'),
  formDispenseDrug: document.getElementById('form-dispense-drug'),
};

function switchView(name) {
  els.views.forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  els.navBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return isoDate;
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

// ---------- Auth ----------

async function initAuth() {
  const hasStaff = await window.careledger.hasStaff();
  els.formSetup.hidden = hasStaff;
  els.formLogin.hidden = !hasStaff;
}

els.formSetup.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.setupError.hidden = true;
  const data = Object.fromEntries(new FormData(els.formSetup));
  try {
    await window.careledger.addStaff(data);
    els.formSetup.reset();
    await enterApp();
  } catch (err) {
    els.setupError.textContent = err.message;
    els.setupError.hidden = false;
  }
});

els.formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  const data = Object.fromEntries(new FormData(els.formLogin));
  try {
    await window.careledger.login(data.username, data.password);
    els.formLogin.reset();
    await enterApp();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
  }
});

els.btnLogout.addEventListener('click', async () => {
  await window.careledger.logout();
  els.appRoot.hidden = true;
  els.authScreen.hidden = false;
  currentPatientId = null;
  currentDrugId = null;
  switchView('dashboard');
  await initAuth();
});

async function enterApp() {
  const staff = await window.careledger.currentStaff();
  els.currentStaffLabel.textContent = `${staff.name} (${staff.role})`;
  els.authScreen.hidden = true;
  els.appRoot.hidden = false;
  switchView('dashboard');
  await loadSettings();
  await loadDashboard();
}

// ---------- Dashboard ----------

async function loadDashboard() {
  const summary = await window.careledger.getDashboardSummary();
  els.dashPatientsToday.textContent = summary.patientsToday;
  els.dashPatientsWeek.textContent = summary.patientsThisWeek;
  els.dashIncomeToday.textContent = formatMoney(summary.incomeToday);

  const attentionItems = [
    ...summary.lowStockDrugs.map((d) => ({
      drug: d,
      why: 'Low Stock',
      detail: `${d.quantity_on_hand} ${d.unit || 'unit(s)'} left (reorder at ${d.reorder_level})`,
    })),
    ...summary.expiringSoonDrugs.map((d) => ({
      drug: d,
      why: 'Expiring Soon',
      detail: `Expires ${d.expiry_date}`,
    })),
  ];
  els.dashNeedsAttention.textContent = attentionItems.length;

  els.dashIllnessesTableBody.innerHTML = '';
  els.dashIllnessesEmpty.hidden = summary.topIllnessesThisWeek.length > 0;
  for (const row of summary.topIllnessesThisWeek) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.complaint}</td><td>${row.n}</td>`;
    els.dashIllnessesTableBody.appendChild(tr);
  }

  els.dashAttentionTableBody.innerHTML = '';
  els.dashAttentionEmpty.hidden = attentionItems.length > 0;
  for (const item of attentionItems) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.drug.name}</td>
      <td class="${item.why === 'Low Stock' ? 'stock-low' : 'stock-expiring'}">${item.why}</td>
      <td>${item.detail}</td>
    `;
    tr.addEventListener('click', () => openDrugDetail(item.drug.id));
    els.dashAttentionTableBody.appendChild(tr);
  }
}

// ---------- Patients list ----------

async function loadPatients() {
  const patients = await window.careledger.listPatients(els.patientSearch.value);
  els.patientsTableBody.innerHTML = '';
  els.patientsEmpty.hidden = patients.length > 0;
  for (const p of patients) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.first_name} ${p.last_name}</td>
      <td>${p.phone || ''}</td>
      <td>${formatDate(p.date_of_birth)}</td>
      <td>${p.gender || ''}</td>
    `;
    tr.addEventListener('click', () => openPatientDetail(p.id));
    els.patientsTableBody.appendChild(tr);
  }
}

els.patientSearch.addEventListener('input', () => loadPatients());
els.btnNewPatient.addEventListener('click', () => els.modalNewPatient.showModal());

els.formNewPatient.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewPatient));
  try {
    await window.careledger.addPatient(data);
    els.modalNewPatient.close();
    els.formNewPatient.reset();
    await loadPatients();
  } catch (err) {
    alert(`Could not save patient: ${err.message}`);
  }
});

// ---------- Patient detail / visits ----------

async function openPatientDetail(patientId) {
  currentPatientId = patientId;
  const patient = await window.careledger.getPatient(patientId);
  els.detailPatientName.textContent = `${patient.first_name} ${patient.last_name}`;
  const metaParts = [];
  if (patient.date_of_birth) metaParts.push(`DOB: ${patient.date_of_birth}`);
  if (patient.gender) metaParts.push(patient.gender);
  if (patient.phone) metaParts.push(patient.phone);
  if (patient.address) metaParts.push(patient.address);
  els.detailPatientMeta.textContent = metaParts.join(' · ');

  switchView('patient-detail');
  await loadVisits();
}

async function loadVisits() {
  const visits = await window.careledger.listVisitsForPatient(currentPatientId);
  els.visitsTableBody.innerHTML = '';
  els.visitsEmpty.hidden = visits.length > 0;
  for (const v of visits) {
    const tr = document.createElement('tr');
    const balance = v.charge_amount - v.payment_amount;
    tr.innerHTML = `
      <td>${formatDate(v.visit_date)}</td>
      <td>${v.complaint || ''}</td>
      <td>${v.treatment || ''}</td>
      <td>${formatMoney(v.charge_amount)}</td>
      <td>${formatMoney(v.payment_amount)}${v.payment_method ? ` (${v.payment_method})` : ''}</td>
      <td class="${balance > 0 ? 'balance-owed' : 'balance-paid'}">${formatMoney(balance)}</td>
      <td>${v.notes || ''}</td>
      <td>${v.recorded_by_name || ''}</td>
    `;
    els.visitsTableBody.appendChild(tr);
  }
}

els.btnBackToPatients.addEventListener('click', () => {
  currentPatientId = null;
  switchView('patients');
  loadPatients();
});

els.btnNewVisit.addEventListener('click', () => {
  const dateInput = els.formNewVisit.elements['visitDate'];
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  paidAmountManuallyEdited = false;
  els.modalNewVisit.showModal();
});

// Most visits are paid in full on the spot, so typing the charge amount
// also fills in the paid amount — unless the person has already typed
// something different into "Amount Paid Today" themselves (a partial
// payment), in which case we leave their input alone.
let paidAmountManuallyEdited = false;
const chargeAmountInput = els.formNewVisit.elements['chargeAmount'];
const paymentAmountInput = els.formNewVisit.elements['paymentAmount'];
chargeAmountInput.addEventListener('input', () => {
  if (!paidAmountManuallyEdited) paymentAmountInput.value = chargeAmountInput.value;
});
paymentAmountInput.addEventListener('input', () => {
  paidAmountManuallyEdited = true;
});

els.formNewVisit.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewVisit));
  data.patientId = currentPatientId;
  try {
    await window.careledger.addVisit(data);
    els.modalNewVisit.close();
    els.formNewVisit.reset();
    await loadVisits();
  } catch (err) {
    alert(`Could not save visit: ${err.message}`);
  }
});

// ---------- Billing ----------

async function loadBilling() {
  const income = await window.careledger.getIncomeSummary();
  els.incomeToday.textContent = formatMoney(income.today);
  els.incomeWeek.textContent = formatMoney(income.thisWeek);
  els.incomeMonth.textContent = formatMoney(income.thisMonth);

  const outstanding = await window.careledger.listOutstandingBalances();
  els.outstandingTableBody.innerHTML = '';
  els.outstandingEmpty.hidden = outstanding.length > 0;
  for (const o of outstanding) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.first_name} ${o.last_name}</td>
      <td>${formatDate(o.visit_date)}</td>
      <td>${formatMoney(o.charge_amount)}</td>
      <td>${formatMoney(o.payment_amount)}</td>
      <td class="balance-owed">${formatMoney(o.balance)}</td>
    `;
    tr.addEventListener('click', () => openPatientDetail(o.patient_id));
    els.outstandingTableBody.appendChild(tr);
  }
}

// ---------- Dispensary (drug list) ----------

function isLowStock(drug) {
  return drug.quantity_on_hand <= drug.reorder_level;
}

function isExpiringSoon(drug) {
  if (!drug.expiry_date) return false;
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  return new Date(drug.expiry_date) <= in30Days;
}

async function loadDrugs() {
  const drugs = await window.careledger.listDrugs(els.drugSearch.value);
  els.drugsTableBody.innerHTML = '';
  els.drugsEmpty.hidden = drugs.length > 0;
  for (const d of drugs) {
    const tr = document.createElement('tr');
    const lowStock = isLowStock(d);
    const expiringSoon = isExpiringSoon(d);
    tr.innerHTML = `
      <td>${d.name}</td>
      <td>${d.unit || ''}</td>
      <td class="${lowStock ? 'stock-low' : ''}">${d.quantity_on_hand}${lowStock ? ' (low)' : ''}</td>
      <td>${d.reorder_level}</td>
      <td class="${expiringSoon ? 'stock-expiring' : ''}">${formatDate(d.expiry_date)}${expiringSoon ? ' (soon)' : ''}</td>
    `;
    tr.addEventListener('click', () => openDrugDetail(d.id));
    els.drugsTableBody.appendChild(tr);
  }
}

els.drugSearch.addEventListener('input', () => loadDrugs());
els.btnNewDrug.addEventListener('click', () => els.modalNewDrug.showModal());

els.formNewDrug.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewDrug));
  try {
    await window.careledger.addDrug(data);
    els.modalNewDrug.close();
    els.formNewDrug.reset();
    await loadDrugs();
  } catch (err) {
    alert(`Could not save drug: ${err.message}`);
  }
});

// ---------- Drug detail / stock movements ----------

async function openDrugDetail(drugId) {
  currentDrugId = drugId;
  const drug = await window.careledger.getDrug(drugId);
  els.detailDrugName.textContent = drug.name;
  const metaParts = [`${drug.quantity_on_hand} ${drug.unit || 'unit(s)'} on hand`, `reorder at ${drug.reorder_level}`];
  if (drug.expiry_date) metaParts.push(`expires ${drug.expiry_date}`);
  els.detailDrugMeta.textContent = metaParts.join(' · ');

  switchView('drug-detail');
  await loadDrugMovements();
}

async function loadDrugMovements() {
  const movements = await window.careledger.getMovementsForDrug(currentDrugId);
  els.drugMovementsTableBody.innerHTML = '';
  els.drugMovementsEmpty.hidden = movements.length > 0;
  for (const m of movements) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.created_at}</td>
      <td>${m.type === 'restock' ? 'Restock' : 'Dispense'}</td>
      <td>${m.type === 'dispense' ? '-' : '+'}${m.quantity}</td>
      <td>${m.note || ''}</td>
      <td>${m.recorded_by_name || ''}</td>
    `;
    els.drugMovementsTableBody.appendChild(tr);
  }
}

els.btnBackToDrugs.addEventListener('click', () => {
  currentDrugId = null;
  switchView('dispensary');
  loadDrugs();
});

els.btnRestockDrug.addEventListener('click', () => els.modalRestockDrug.showModal());
els.btnDispenseDrug.addEventListener('click', () => els.modalDispenseDrug.showModal());

els.formRestockDrug.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formRestockDrug));
  data.drugId = currentDrugId;
  try {
    await window.careledger.restockDrug(data);
    els.modalRestockDrug.close();
    els.formRestockDrug.reset();
    await openDrugDetail(currentDrugId);
  } catch (err) {
    alert(`Could not save restock: ${err.message}`);
  }
});

els.formDispenseDrug.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formDispenseDrug));
  data.drugId = currentDrugId;
  try {
    await window.careledger.dispenseDrug(data);
    els.modalDispenseDrug.close();
    els.formDispenseDrug.reset();
    await openDrugDetail(currentDrugId);
  } catch (err) {
    alert(`Could not save dispense: ${err.message}`);
  }
});

// ---------- Settings (white-label foundation) ----------

async function loadSettings() {
  const clinicName = await window.careledger.getSetting('clinicName');
  if (clinicName) {
    els.clinicName.textContent = clinicName;
    els.settingsClinicName.value = clinicName;
  }
}

els.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = els.settingsClinicName.value.trim();
  await window.careledger.setSetting('clinicName', name);
  els.clinicName.textContent = name || 'CareLedger';
  els.settingsSaved.hidden = false;
  setTimeout(() => { els.settingsSaved.hidden = true; }, 1500);
});

// ---------- Staff management ----------

async function loadStaff() {
  const staff = await window.careledger.listStaff();
  els.staffTableBody.innerHTML = '';
  for (const s of staff) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.role}</td>
      <td>${s.username}</td>
      <td class="${s.active ? 'status-active' : 'status-inactive'}">${s.active ? 'Active' : 'Inactive'}</td>
      <td></td>
    `;
    const actionCell = tr.lastElementChild;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'secondary';
    toggleBtn.textContent = s.active ? 'Deactivate' : 'Activate';
    toggleBtn.addEventListener('click', async () => {
      await window.careledger.setStaffActive(s.id, !s.active);
      await loadStaff();
    });
    actionCell.appendChild(toggleBtn);
    els.staffTableBody.appendChild(tr);
  }
}

els.btnNewStaff.addEventListener('click', () => els.modalNewStaff.showModal());

els.formNewStaff.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewStaff));
  try {
    await window.careledger.addStaff(data);
    els.modalNewStaff.close();
    els.formNewStaff.reset();
    await loadStaff();
  } catch (err) {
    alert(`Could not save staff: ${err.message}`);
  }
});

// ---------- Backups ----------

async function loadBackupStatus() {
  const status = await window.careledger.getBackupStatus();
  const parts = [];
  parts.push(status.lastBackupAt
    ? `Last automatic backup: ${new Date(status.lastBackupAt).toLocaleString()}`
    : 'No automatic backup yet — the first one happens shortly after opening the app.');
  if (status.lastManualBackupAt) {
    parts.push(`Last backup to a folder: ${new Date(status.lastManualBackupAt).toLocaleString()}`);
  }
  if (status.lastBackupError) {
    parts.push(`Last automatic backup attempt failed: ${status.lastBackupError}`);
  }
  els.backupStatus.textContent = parts.join(' · ');
}

els.btnBackupNow.addEventListener('click', async () => {
  els.btnBackupNow.disabled = true;
  try {
    await window.careledger.runBackupNow();
    await loadBackupStatus();
  } catch (err) {
    alert(`Backup failed: ${err.message}`);
  } finally {
    els.btnBackupNow.disabled = false;
  }
});

els.btnBackupExport.addEventListener('click', async () => {
  els.btnBackupExport.disabled = true;
  try {
    const result = await window.careledger.exportBackup();
    if (!result.canceled) {
      await loadBackupStatus();
      alert(`Backup saved to:\n${result.filePath}`);
    }
  } catch (err) {
    alert(`Backup failed: ${err.message}`);
  } finally {
    els.btnBackupExport.disabled = false;
  }
});

// ---------- Nav + modal close buttons ----------

els.navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    if (btn.dataset.view === 'dashboard') loadDashboard();
    if (btn.dataset.view === 'patients') loadPatients();
    if (btn.dataset.view === 'billing') loadBilling();
    if (btn.dataset.view === 'dispensary') loadDrugs();
    if (btn.dataset.view === 'settings') { loadStaff(); loadBackupStatus(); }
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.close).close();
  });
});

// ---------- Init ----------

initAuth();

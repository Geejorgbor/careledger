// CareLedger renderer — plain JS, no framework. Screens are shown/hidden
// sections; state lives in a few module-level variables.

let currentPatientId = null;
let currentPatient = null;
let currentDrugId = null;
let currentStaffRole = null;

// Mirrors src/main/permissions.js — kept in sync by hand since the
// renderer can't require() main-process code directly (contextIsolation).
// This only controls what's shown; the real security boundary is enforced
// again in ipc.js no matter what the UI hides.
function canManageStaffAndSettings(role) {
  return role === 'Admin';
}
function canUseDispensary(role) {
  return role === 'Admin' || role === 'Doctor' || role === 'Nurse';
}

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
  dashAppointmentsToday: document.getElementById('dash-appointments-today'),

  appointmentsTableBody: document.getElementById('appointments-table-body'),
  appointmentsEmpty: document.getElementById('appointments-empty'),
  patientAppointmentsTableBody: document.getElementById('patient-appointments-table-body'),
  patientAppointmentsEmpty: document.getElementById('patient-appointments-empty'),
  btnNewAppointment: document.getElementById('btn-new-appointment'),
  modalNewAppointment: document.getElementById('modal-new-appointment'),
  formNewAppointment: document.getElementById('form-new-appointment'),

  staffTableBody: document.getElementById('staff-table-body'),
  btnNewStaff: document.getElementById('btn-new-staff'),
  modalNewStaff: document.getElementById('modal-new-staff'),
  formNewStaff: document.getElementById('form-new-staff'),

  backupStatus: document.getElementById('backup-status'),
  btnBackupNow: document.getElementById('btn-backup-now'),
  btnBackupExport: document.getElementById('btn-backup-export'),

  btnExportPatients: document.getElementById('btn-export-patients'),
  btnExportVisits: document.getElementById('btn-export-visits'),
  btnExportDrugs: document.getElementById('btn-export-drugs'),

  appVersion: document.getElementById('app-version'),
  btnCheckUpdates: document.getElementById('btn-check-updates'),
  updateStatus: document.getElementById('update-status'),

  clinicName: document.getElementById('clinic-name'),
  headerLogo: document.getElementById('header-logo'),
  settingsLogoPreview: document.getElementById('settings-logo-preview'),
  settingsLogoEmpty: document.getElementById('settings-logo-empty'),
  btnUploadLogo: document.getElementById('btn-upload-logo'),
  btnRemoveLogo: document.getElementById('btn-remove-logo'),
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

  subscriptionSearch: document.getElementById('subscription-search'),
  subscriptionsTableBody: document.getElementById('subscriptions-table-body'),
  subscriptionsEmpty: document.getElementById('subscriptions-empty'),
  btnNewSubscriptionClient: document.getElementById('btn-new-subscription-client'),
  detailSubscriptionName: document.getElementById('detail-subscription-name'),
  detailSubscriptionMeta: document.getElementById('detail-subscription-meta'),
  btnToggleSubscriptionStatus: document.getElementById('btn-toggle-subscription-status'),
  subscriptionHistoryTableBody: document.getElementById('subscription-history-table-body'),
  subscriptionHistoryEmpty: document.getElementById('subscription-history-empty'),
  btnNewSubscriptionHistory: document.getElementById('btn-new-subscription-history'),
  btnBackToSubscriptions: document.getElementById('btn-back-to-subscriptions'),
  modalNewSubscriptionClient: document.getElementById('modal-new-subscription-client'),
  formNewSubscriptionClient: document.getElementById('form-new-subscription-client'),
  modalNewSubscriptionHistory: document.getElementById('modal-new-subscription-history'),
  formNewSubscriptionHistory: document.getElementById('form-new-subscription-history'),
  subscriptionHistoryType: document.getElementById('subscription-history-type'),
  subscriptionHistoryOrderFields: document.getElementById('subscription-history-order-fields'),

  settingsForm: document.getElementById('settings-form'),
  settingsClinicName: document.getElementById('settings-clinic-name'),
  settingsSaved: document.getElementById('settings-saved'),

  licenseForm: document.getElementById('license-form'),
  settingsLicenseDate: document.getElementById('settings-license-date'),
  licenseSaved: document.getElementById('license-saved'),
  licenseBanner: document.getElementById('license-banner'),
  btnPlanBuy3mo: document.getElementById('btn-plan-buy-3mo'),
  btnPlanBuy10mo: document.getElementById('btn-plan-buy-10mo'),
  btnPlanRenew3mo: document.getElementById('btn-plan-renew-3mo'),
  btnPlanRenew10mo: document.getElementById('btn-plan-renew-10mo'),
  settingsClinicId: document.getElementById('settings-clinic-id'),

  navTrends: document.getElementById('nav-trends'),
  trendVisitsBars: document.getElementById('trend-visits-bars'),
  trendIncomeBars: document.getElementById('trend-income-bars'),
  trendPatientsBars: document.getElementById('trend-patients-bars'),
  trendIllnessesTableBody: document.getElementById('trend-illnesses-table-body'),
  trendIllnessesEmpty: document.getElementById('trend-illnesses-empty'),

  navAssistant: document.getElementById('nav-assistant'),
  assistantTitle: document.getElementById('assistant-title'),
  assistantNotReady: document.getElementById('assistant-not-ready'),
  assistantChat: document.getElementById('assistant-chat'),
  assistantMessages: document.getElementById('assistant-messages'),
  assistantForm: document.getElementById('assistant-form'),
  assistantInput: document.getElementById('assistant-input'),
  assistantError: document.getElementById('assistant-error'),
  assistantSettingsForm: document.getElementById('assistant-settings-form'),
  settingsAssistantName: document.getElementById('settings-assistant-name'),
  settingsAssistantApiKey: document.getElementById('settings-assistant-api-key'),
  assistantSettingsSaved: document.getElementById('assistant-settings-saved'),

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

// Shown briefly in a table while its data is being fetched, so switching
// tabs never looks like a blank flash before content appears.
function showLoadingRow(tbody, colspan) {
  tbody.innerHTML = `<tr class="loading-row"><td colspan="${colspan}"><span class="spinner"></span>Loading&hellip;</td></tr>`;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return isoDate;
}

// The database's "today"/"this week" logic runs in local time (SQLite's
// date('now', 'localtime')), so date fields we pre-fill must agree — using
// toISOString() (always UTC) can show the wrong day for part of every day,
// depending on the clinic's timezone.
function todayLocalDateString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "YYYY-MM-DD" -> local Date. Never use `new Date("YYYY-MM-DD")` directly —
// that parses as UTC midnight and can land on the wrong local day.
function parseLocalDateString(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDateString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addMonthsToDate(date, months) {
  return formatLocalDateString(new Date(date.getFullYear(), date.getMonth() + months, date.getDate()));
}

// Same local-date rule as todayLocalDateString(), but N months from today —
// used by the subscription "New Clinic" buy buttons.
function dateMonthsFromTodayString(months) {
  return addMonthsToDate(new Date(), months);
}

// Used by the "Renewing Clinic" buttons: extends from whichever is later,
// the clinic's current Licensed Until date or today — so renewing early
// never throws away time they already paid for.
function renewalDateString(months) {
  const currentValue = els.settingsLicenseDate.value;
  const base = currentValue && currentValue >= todayLocalDateString()
    ? parseLocalDateString(currentValue)
    : new Date();
  return addMonthsToDate(base, months);
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
  currentPatient = null;
  currentDrugId = null;
  currentStaffRole = null;
  assistantHistory = [];
  els.assistantMessages.innerHTML = '';
  switchView('dashboard');
  await initAuth();
});

async function enterApp() {
  const staff = await window.careledger.currentStaff();
  currentStaffRole = staff.role;
  els.currentStaffLabel.textContent = `${staff.name} (${staff.role})`;
  applyPermissionsToUI(staff.role);
  els.authScreen.hidden = true;
  els.appRoot.hidden = false;
  switchView('dashboard');
  await loadSettings();
  await loadDashboard();
}

function applyPermissionsToUI(role) {
  const isAdmin = canManageStaffAndSettings(role);
  const canDispense = canUseDispensary(role);

  els.btnNewStaff.hidden = !isAdmin;
  els.settingsClinicName.disabled = !isAdmin;
  els.settingsForm.querySelector('button[type="submit"]').hidden = !isAdmin;
  els.assistantSettingsForm.querySelector('button[type="submit"]').hidden = !isAdmin;
  els.settingsAssistantName.disabled = !isAdmin;
  els.settingsAssistantApiKey.disabled = !isAdmin;

  els.btnNewDrug.hidden = !canDispense;
  els.btnRestockDrug.hidden = !canDispense;
  els.btnDispenseDrug.hidden = !canDispense;
}

// ---------- Dashboard ----------

async function loadDashboard() {
  showLoadingRow(els.dashIllnessesTableBody, 2);
  showLoadingRow(els.dashAttentionTableBody, 3);
  const summary = await window.careledger.getDashboardSummary();
  els.dashPatientsToday.textContent = summary.patientsToday;
  els.dashPatientsWeek.textContent = summary.patientsThisWeek;
  els.dashIncomeToday.textContent = formatMoney(summary.incomeToday);
  els.dashAppointmentsToday.textContent = summary.appointmentsToday;

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
  showLoadingRow(els.patientsTableBody, 4);
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
  currentPatient = patient;
  els.detailPatientName.textContent = `${patient.first_name} ${patient.last_name}`;
  const metaParts = [];
  if (patient.date_of_birth) metaParts.push(`DOB: ${patient.date_of_birth}`);
  if (patient.gender) metaParts.push(patient.gender);
  if (patient.phone) metaParts.push(patient.phone);
  if (patient.address) metaParts.push(patient.address);
  els.detailPatientMeta.textContent = metaParts.join(' · ');

  switchView('patient-detail');
  await loadVisits();
  await loadPatientAppointments();
}

function formatVitals(v) {
  const parts = [];
  if (v.temperature_c !== null && v.temperature_c !== undefined) parts.push(`T: ${v.temperature_c}°C`);
  if (v.blood_pressure) parts.push(`BP: ${v.blood_pressure}`);
  if (v.pulse_bpm !== null && v.pulse_bpm !== undefined) parts.push(`P: ${v.pulse_bpm}bpm`);
  if (v.weight_kg !== null && v.weight_kg !== undefined) parts.push(`W: ${v.weight_kg}kg`);
  return parts.join(' · ');
}

async function loadVisits() {
  showLoadingRow(els.visitsTableBody, 10);
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
      <td>${formatVitals(v)}</td>
      <td>${formatMoney(v.charge_amount)}</td>
      <td>${formatMoney(v.payment_amount)}${v.payment_method ? ` (${v.payment_method})` : ''}</td>
      <td class="${balance > 0 ? 'balance-owed' : 'balance-paid'}">${formatMoney(balance)}</td>
      <td>${v.notes || ''}</td>
      <td>${v.recorded_by_name || ''}</td>
      <td></td>
    `;
    const printCell = tr.lastElementChild;
    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn-print';
    printBtn.textContent = 'Print Receipt';
    printBtn.addEventListener('click', () => printReceipt(v));
    printCell.appendChild(printBtn);
    els.visitsTableBody.appendChild(tr);
  }
}

function printReceipt(visit) {
  const balance = visit.charge_amount - visit.payment_amount;
  const rows = [
    ['Patient', `${currentPatient.first_name} ${currentPatient.last_name}`],
    ['Visit Date', formatDate(visit.visit_date)],
  ];
  if (visit.complaint) rows.push(['Complaint', visit.complaint]);
  if (visit.treatment) rows.push(['Treatment', visit.treatment]);
  if (formatVitals(visit)) rows.push(['Vitals', formatVitals(visit)]);
  rows.push(['Amount Charged', formatMoney(visit.charge_amount)]);
  rows.push(['Amount Paid', `${formatMoney(visit.payment_amount)}${visit.payment_method ? ` (${visit.payment_method})` : ''}`]);
  if (balance > 0) rows.push(['Balance Owed', formatMoney(balance)]);
  if (visit.recorded_by_name) rows.push(['Served By', visit.recorded_by_name]);
  rows.push(['Printed', new Date().toLocaleString()]);

  document.getElementById('receipt-clinic-name').textContent = els.clinicName.textContent || 'CareLedger';
  document.getElementById('receipt-fields').innerHTML = rows
    .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
    .join('');

  const receiptLogo = document.getElementById('receipt-logo');
  receiptLogo.hidden = !currentLogoDataUri;
  if (currentLogoDataUri) {
    receiptLogo.src = currentLogoDataUri;
  } else {
    receiptLogo.removeAttribute('src');
  }

  window.print();
}

els.btnBackToPatients.addEventListener('click', () => {
  currentPatientId = null;
  currentPatient = null;
  switchView('patients');
  loadPatients();
});

els.btnNewVisit.addEventListener('click', () => {
  const dateInput = els.formNewVisit.elements['visitDate'];
  if (!dateInput.value) dateInput.value = todayLocalDateString();
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

// ---------- Appointments ----------

const APPOINTMENT_STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No-Show'];

function statusSelect(appointment, onChange) {
  const select = document.createElement('select');
  for (const status of APPOINTMENT_STATUSES) {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    if (status === appointment.status) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', async () => {
    await window.careledger.setAppointmentStatus(appointment.id, select.value);
    onChange();
  });
  return select;
}

async function loadAppointments() {
  showLoadingRow(els.appointmentsTableBody, 6);
  const appointments = await window.careledger.listUpcomingAppointments();
  els.appointmentsTableBody.innerHTML = '';
  els.appointmentsEmpty.hidden = appointments.length > 0;
  for (const a of appointments) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(a.appointment_date)}</td>
      <td>${a.appointment_time || ''}</td>
      <td>${a.first_name} ${a.last_name}</td>
      <td>${a.phone || ''}</td>
      <td>${a.reason || ''}</td>
      <td></td>
    `;
    tr.lastElementChild.appendChild(statusSelect(a, loadAppointments));
    tr.addEventListener('click', (e) => {
      if (e.target.tagName !== 'SELECT') openPatientDetail(a.patient_id);
    });
    els.appointmentsTableBody.appendChild(tr);
  }
}

async function loadPatientAppointments() {
  showLoadingRow(els.patientAppointmentsTableBody, 4);
  const appointments = await window.careledger.listAppointmentsForPatient(currentPatientId);
  els.patientAppointmentsTableBody.innerHTML = '';
  els.patientAppointmentsEmpty.hidden = appointments.length > 0;
  for (const a of appointments) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(a.appointment_date)}</td>
      <td>${a.appointment_time || ''}</td>
      <td>${a.reason || ''}</td>
      <td></td>
    `;
    tr.lastElementChild.appendChild(statusSelect(a, loadPatientAppointments));
    els.patientAppointmentsTableBody.appendChild(tr);
  }
}

els.btnNewAppointment.addEventListener('click', () => {
  const dateInput = els.formNewAppointment.elements['appointmentDate'];
  if (!dateInput.value) dateInput.value = todayLocalDateString();
  els.modalNewAppointment.showModal();
});

els.formNewAppointment.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewAppointment));
  data.patientId = currentPatientId;
  try {
    await window.careledger.addAppointment(data);
    els.modalNewAppointment.close();
    els.formNewAppointment.reset();
    await loadPatientAppointments();
  } catch (err) {
    alert(`Could not save appointment: ${err.message}`);
  }
});

// ---------- Subscriptions (retail refill-plan clients) ----------

let currentSubscriptionClientId = null;

async function loadSubscriptions() {
  showLoadingRow(els.subscriptionsTableBody, 4);
  const clients = await window.careledger.listSubscriptionClients(els.subscriptionSearch.value);
  els.subscriptionsTableBody.innerHTML = '';
  els.subscriptionsEmpty.hidden = clients.length > 0;
  for (const c of clients) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.phone || ''}</td>
      <td>${c.sponsor || ''}</td>
      <td><span class="${c.status === 'Active' ? 'status-active' : 'status-inactive'}">${c.status}</span></td>
    `;
    tr.addEventListener('click', () => openSubscriptionDetail(c.id));
    els.subscriptionsTableBody.appendChild(tr);
  }
}

els.subscriptionSearch.addEventListener('input', () => loadSubscriptions());
els.btnNewSubscriptionClient.addEventListener('click', () => els.modalNewSubscriptionClient.showModal());

els.formNewSubscriptionClient.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewSubscriptionClient));
  try {
    await window.careledger.addSubscriptionClient(data);
    els.modalNewSubscriptionClient.close();
    els.formNewSubscriptionClient.reset();
    await loadSubscriptions();
  } catch (err) {
    alert(`Could not save client: ${err.message}`);
  }
});

let currentSubscriptionClient = null;

async function openSubscriptionDetail(clientId) {
  currentSubscriptionClientId = clientId;
  const client = await window.careledger.getSubscriptionClient(clientId);
  currentSubscriptionClient = client;
  els.detailSubscriptionName.textContent = client.name;
  const metaParts = [];
  if (client.phone) metaParts.push(client.phone);
  if (client.sponsor) metaParts.push(`Sponsor: ${client.sponsor}`);
  metaParts.push(client.status);
  els.detailSubscriptionMeta.textContent = metaParts.join(' · ');
  els.btnToggleSubscriptionStatus.textContent = client.status === 'Active' ? 'Mark Inactive' : 'Mark Active';

  switchView('subscription-detail');
  await loadSubscriptionHistory();
}

async function loadSubscriptionHistory() {
  showLoadingRow(els.subscriptionHistoryTableBody, 6);
  const history = await window.careledger.getSubscriptionHistoryForClient(currentSubscriptionClientId);
  els.subscriptionHistoryTableBody.innerHTML = '';
  els.subscriptionHistoryEmpty.hidden = history.length > 0;
  for (const h of history) {
    const tr = document.createElement('tr');
    const medication = h.medication ? `${h.medication}${h.quantity ? ` (${h.quantity})` : ''}` : '';
    tr.innerHTML = `
      <td>${formatDate(h.entry_date)}</td>
      <td>${h.entry_type}</td>
      <td>${medication}</td>
      <td>${h.day_supply ? `${h.day_supply} days` : ''}</td>
      <td>${h.note || ''}</td>
      <td>${h.recorded_by_name || ''}</td>
    `;
    els.subscriptionHistoryTableBody.appendChild(tr);
  }
}

els.btnBackToSubscriptions.addEventListener('click', () => {
  currentSubscriptionClientId = null;
  currentSubscriptionClient = null;
  switchView('subscriptions');
  loadSubscriptions();
});

els.btnToggleSubscriptionStatus.addEventListener('click', async () => {
  const newStatus = currentSubscriptionClient.status === 'Active' ? 'Inactive' : 'Active';
  await window.careledger.setSubscriptionClientStatus(currentSubscriptionClientId, newStatus);
  await openSubscriptionDetail(currentSubscriptionClientId);
});

els.btnNewSubscriptionHistory.addEventListener('click', () => {
  const dateInput = els.formNewSubscriptionHistory.elements['entryDate'];
  if (!dateInput.value) dateInput.value = todayLocalDateString();
  els.subscriptionHistoryType.value = 'Order';
  els.subscriptionHistoryOrderFields.hidden = false;
  els.modalNewSubscriptionHistory.showModal();
});

els.subscriptionHistoryType.addEventListener('change', () => {
  els.subscriptionHistoryOrderFields.hidden = els.subscriptionHistoryType.value !== 'Order';
});

els.formNewSubscriptionHistory.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.formNewSubscriptionHistory));
  data.clientId = currentSubscriptionClientId;
  try {
    await window.careledger.addSubscriptionHistory(data);
    els.modalNewSubscriptionHistory.close();
    els.formNewSubscriptionHistory.reset();
    await loadSubscriptionHistory();
  } catch (err) {
    alert(`Could not save entry: ${err.message}`);
  }
});

// ---------- Trends (10-Month plan bonus) ----------

function monthShortLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

// Renders a simple bar per item, height scaled to the largest value in the
// set — no charting library needed for six small bars.
function renderBarChart(container, items, valueFormatter) {
  const maxValue = Math.max(1, ...items.map((i) => i.value));
  container.innerHTML = '';
  for (const item of items) {
    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    const heightPct = Math.max(4, Math.round((item.value / maxValue) * 100));
    bar.innerHTML = `
      <div class="trend-bar-value">${valueFormatter(item.value)}</div>
      <div class="trend-bar-fill" style="height: ${heightPct}%"></div>
      <div class="trend-bar-label">${monthShortLabel(item.month)}</div>
    `;
    container.appendChild(bar);
  }
}

async function loadTrends() {
  const trends = await window.careledger.getTrends();

  renderBarChart(
    els.trendVisitsBars,
    trends.monthlyVisits.map((m) => ({ month: m.month, value: m.visitCount })),
    (v) => String(v)
  );
  renderBarChart(
    els.trendIncomeBars,
    trends.monthlyVisits.map((m) => ({ month: m.month, value: m.income })),
    (v) => formatMoney(v)
  );
  renderBarChart(
    els.trendPatientsBars,
    trends.newPatientsByMonth.map((m) => ({ month: m.month, value: m.count })),
    (v) => String(v)
  );

  els.trendIllnessesTableBody.innerHTML = '';
  els.trendIllnessesEmpty.hidden = trends.topIllnesses.length > 0;
  for (const item of trends.topIllnesses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.complaint}</td><td>${item.n}</td>`;
    els.trendIllnessesTableBody.appendChild(tr);
  }
}

// ---------- Assistant (10-Month plan bonus) ----------

let assistantHistory = [];

function renderAssistantMessage(role, text) {
  const div = document.createElement('div');
  div.className = `assistant-message ${role}`;
  div.textContent = text;
  els.assistantMessages.appendChild(div);
  els.assistantMessages.scrollTop = els.assistantMessages.scrollHeight;
}

async function loadAssistantSettings() {
  const settings = await window.careledger.getAssistantSettings();
  els.assistantTitle.textContent = settings.assistantName;
  els.settingsAssistantName.value = settings.assistantName;
  els.settingsAssistantApiKey.placeholder = settings.hasApiKey ? 'Already set — leave blank to keep it' : 'sk-ant-...';

  const assistantEligible = settings.isEligiblePlan && settings.hasApiKey;
  els.assistantNotReady.hidden = assistantEligible;
  els.assistantChat.hidden = !assistantEligible;
}

els.assistantForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = els.assistantInput.value.trim();
  if (!message) return;

  els.assistantError.hidden = true;
  renderAssistantMessage('user', message);
  els.assistantInput.value = '';
  els.assistantInput.disabled = true;

  try {
    const { reply } = await window.careledger.sendAssistantMessage(assistantHistory, message);
    assistantHistory.push({ role: 'user', content: message });
    assistantHistory.push({ role: 'assistant', content: reply });
    renderAssistantMessage('assistant', reply);
  } catch (err) {
    els.assistantError.textContent = err.message;
    els.assistantError.hidden = false;
  } finally {
    els.assistantInput.disabled = false;
    els.assistantInput.focus();
  }
});

els.assistantSettingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await window.careledger.saveAssistantSettings({
    assistantName: els.settingsAssistantName.value.trim(),
    apiKey: els.settingsAssistantApiKey.value.trim(),
  });
  els.settingsAssistantApiKey.value = '';
  await loadAssistantSettings();
  els.assistantSettingsSaved.hidden = false;
  setTimeout(() => { els.assistantSettingsSaved.hidden = true; }, 1500);
});

// ---------- Billing ----------

async function loadBilling() {
  const income = await window.careledger.getIncomeSummary();
  els.incomeToday.textContent = formatMoney(income.today);
  els.incomeWeek.textContent = formatMoney(income.thisWeek);
  els.incomeMonth.textContent = formatMoney(income.thisMonth);

  showLoadingRow(els.outstandingTableBody, 5);
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
  showLoadingRow(els.drugsTableBody, 5);
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
  showLoadingRow(els.drugMovementsTableBody, 5);
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

let currentLogoDataUri = '';

function applyLogo(dataUri) {
  currentLogoDataUri = dataUri || '';
  const hasLogo = Boolean(currentLogoDataUri);

  els.headerLogo.hidden = !hasLogo;
  els.settingsLogoPreview.hidden = !hasLogo;
  els.settingsLogoEmpty.hidden = hasLogo;
  els.btnRemoveLogo.hidden = !hasLogo;

  if (hasLogo) {
    els.headerLogo.src = currentLogoDataUri;
    els.settingsLogoPreview.src = currentLogoDataUri;
  } else {
    els.headerLogo.removeAttribute('src');
    els.settingsLogoPreview.removeAttribute('src');
  }
}

async function loadSettings() {
  const clinicName = await window.careledger.getSetting('clinicName');
  if (clinicName) {
    els.clinicName.textContent = clinicName;
    els.settingsClinicName.value = clinicName;
  }
  applyLogo(await window.careledger.getSetting('clinicLogo'));

  const licenseExpiresAt = await window.careledger.getSetting('licenseExpiresAt');
  if (licenseExpiresAt) els.settingsLicenseDate.value = licenseExpiresAt;
  updateLicenseBanner(licenseExpiresAt);

  pendingLicensePlan = await window.careledger.getSetting('licensePlan');
  applyPlanToUI(pendingLicensePlan);

  els.settingsClinicId.value = await window.careledger.getClinicId();
}

// Set by the Buy/Renew plan buttons, and written to settings when the
// Subscription form is saved — kept separate from the form's own submit so
// typing a custom date by hand never silently changes which plan a clinic
// is on.
let pendingLicensePlan = null;

function applyPlanToUI(plan) {
  els.navTrends.hidden = plan !== '10month';
  els.navAssistant.hidden = plan !== '10month';
}

window.careledger.onLicenseUpdated(({ expiresAt, plan }) => {
  els.settingsLicenseDate.value = expiresAt || '';
  updateLicenseBanner(expiresAt);
  if (plan) {
    pendingLicensePlan = plan;
    applyPlanToUI(plan);
  }
});

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - todayLocal) / (24 * 60 * 60 * 1000));
}

function updateLicenseBanner(expiresAtStr) {
  if (!expiresAtStr) {
    els.licenseBanner.hidden = true;
    return;
  }
  const days = daysUntil(expiresAtStr);
  if (days < 0) {
    const daysAgo = Math.abs(days);
    els.licenseBanner.textContent = `Your subscription expired on ${expiresAtStr} (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago) — please contact PayeConnect to renew.`;
    els.licenseBanner.className = 'banner-expired';
    els.licenseBanner.hidden = false;
  } else if (days <= 7) {
    els.licenseBanner.textContent = `Your subscription expires in ${days} day${days === 1 ? '' : 's'} (${expiresAtStr}) — please contact PayeConnect to renew.`;
    els.licenseBanner.className = 'banner-warning';
    els.licenseBanner.hidden = false;
  } else {
    els.licenseBanner.hidden = true;
  }
}

els.btnPlanBuy3mo.addEventListener('click', () => {
  els.settingsLicenseDate.value = dateMonthsFromTodayString(3);
  pendingLicensePlan = '3month';
});

els.btnPlanBuy10mo.addEventListener('click', () => {
  els.settingsLicenseDate.value = dateMonthsFromTodayString(10);
  pendingLicensePlan = '10month';
});

els.btnPlanRenew3mo.addEventListener('click', () => {
  els.settingsLicenseDate.value = renewalDateString(3);
  pendingLicensePlan = '3month';
});

els.btnPlanRenew10mo.addEventListener('click', () => {
  els.settingsLicenseDate.value = renewalDateString(10);
  pendingLicensePlan = '10month';
});

els.licenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = els.settingsLicenseDate.value;
  await window.careledger.setSetting('licenseExpiresAt', value);
  if (pendingLicensePlan) await window.careledger.setSetting('licensePlan', pendingLicensePlan);
  applyPlanToUI(pendingLicensePlan);
  updateLicenseBanner(value);
  els.licenseSaved.hidden = false;
  setTimeout(() => { els.licenseSaved.hidden = true; }, 1500);
});

els.btnUploadLogo.addEventListener('click', async () => {
  els.btnUploadLogo.disabled = true;
  try {
    const result = await window.careledger.pickClinicLogo();
    if (!result.canceled) applyLogo(result.dataUri);
  } catch (err) {
    alert(`Could not upload logo: ${err.message}`);
  } finally {
    els.btnUploadLogo.disabled = false;
  }
});

els.btnRemoveLogo.addEventListener('click', async () => {
  await window.careledger.setSetting('clinicLogo', '');
  applyLogo('');
});

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
  showLoadingRow(els.staffTableBody, 5);
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
    if (canManageStaffAndSettings(currentStaffRole)) {
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
    }
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

// ---------- Data export ----------

async function runExport(button, exportFn) {
  button.disabled = true;
  try {
    const result = await exportFn();
    if (!result.canceled) {
      alert(`Saved to:\n${result.filePath}`);
    }
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

els.btnExportPatients.addEventListener('click', () => runExport(els.btnExportPatients, window.careledger.exportPatients));
els.btnExportVisits.addEventListener('click', () => runExport(els.btnExportVisits, window.careledger.exportVisits));
els.btnExportDrugs.addEventListener('click', () => runExport(els.btnExportDrugs, window.careledger.exportDrugs));

// ---------- Updates ----------

async function loadAppVersion() {
  const version = await window.careledger.getAppVersion();
  els.appVersion.textContent = `You're running version ${version}.`;
}

els.btnCheckUpdates.addEventListener('click', async () => {
  els.btnCheckUpdates.disabled = true;
  els.updateStatus.textContent = 'Checking…';
  try {
    const result = await window.careledger.checkForUpdates();
    const current = await window.careledger.getAppVersion();
    els.updateStatus.textContent = result.version === current
      ? "You're on the latest version."
      : `Update found (version ${result.version}) — it will download in the background and be ready next time you restart CareLedger.`;
  } catch (err) {
    els.updateStatus.textContent = `Could not check for updates: ${err.message}`;
  } finally {
    els.btnCheckUpdates.disabled = false;
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
    if (btn.dataset.view === 'appointments') loadAppointments();
    if (btn.dataset.view === 'subscriptions') loadSubscriptions();
    if (btn.dataset.view === 'trends') loadTrends();
    if (btn.dataset.view === 'assistant') loadAssistantSettings();
    if (btn.dataset.view === 'settings') { loadStaff(); loadBackupStatus(); loadAppVersion(); loadAssistantSettings(); }
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.close).close();
  });
});

// ---------- Init ----------

initAuth();

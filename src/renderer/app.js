// CareLedger renderer — plain JS, no framework. Screens are shown/hidden
// sections; state lives in a few module-level variables.

let currentPatientId = null;

const els = {
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
    tr.innerHTML = `
      <td>${formatDate(v.visit_date)}</td>
      <td>${v.complaint || ''}</td>
      <td>${v.treatment || ''}</td>
      <td>${formatMoney(v.payment_amount)}${v.payment_method ? ` (${v.payment_method})` : ''}</td>
      <td>${v.notes || ''}</td>
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
  els.modalNewVisit.showModal();
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

// ---------- Nav + modal close buttons ----------

els.navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    if (btn.dataset.view === 'patients') loadPatients();
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.close).close();
  });
});

// ---------- Init ----------

loadSettings();
loadPatients();

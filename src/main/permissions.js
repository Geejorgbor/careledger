// A small, explicit permission table — kept separate from session.js so
// "who can do what" is one easy place to read and change, not scattered
// across every ipc.js handler.
//
// Admin: everything, including staff accounts and clinic settings.
// Doctor / Nurse: full clinical work (patients, visits, dispensing
//   medicine) plus viewing billing — but not staff accounts or settings.
// Front Desk: patients, visits, and billing (registration and payment is
//   their job) — but cannot manage staff, settings, or the dispensary.
//   Handing out medicine is deliberately kept to clinical roles only.

const ADMIN_ROLES = ['Admin'];
const DISPENSARY_ROLES = ['Admin', 'Doctor', 'Nurse'];

function canManageStaffAndSettings(role) {
  return ADMIN_ROLES.includes(role);
}

function canUseDispensary(role) {
  return DISPENSARY_ROLES.includes(role);
}

module.exports = { canManageStaffAndSettings, canUseDispensary };

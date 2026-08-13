const { verifyPassword } = require('./auth');
const { canManageStaffAndSettings, canUseDispensary } = require('./permissions');

/**
 * Tracks who is currently logged in, for a single-window desktop app.
 * There is exactly one active session for the whole app at a time — this
 * is a shared clinic computer, not a multi-user server.
 */
function createSession(db) {
  let currentStaff = null;

  function toSafeStaff(staff) {
    return { id: staff.id, name: staff.name, role: staff.role, username: staff.username };
  }

  // Used by IPC handlers that touch clinic data — throws instead of
  // silently proceeding, so data can never be written without a known
  // author once logins are set up.
  function requireLogin() {
    if (!currentStaff) throw new Error('Not logged in');
    return currentStaff;
  }

  function requireAdmin() {
    const staff = requireLogin();
    if (!canManageStaffAndSettings(staff.role)) {
      throw new Error('Only Admin accounts can do this');
    }
    return staff;
  }

  function requireDispensaryAccess() {
    const staff = requireLogin();
    if (!canUseDispensary(staff.role)) {
      throw new Error('Front Desk accounts cannot manage the dispensary');
    }
    return staff;
  }

  return {
    hasAnyStaff() {
      return db.countActiveStaff() > 0;
    },

    login(username, password) {
      const staff = db.getStaffByUsername(username);
      if (!staff || !staff.active || !verifyPassword(password, staff.password_hash)) {
        throw new Error('Incorrect username or password');
      }
      currentStaff = toSafeStaff(staff);
      return currentStaff;
    },

    logout() {
      currentStaff = null;
    },

    getCurrentStaff() {
      return currentStaff;
    },

    requireLogin,
    requireAdmin,
    requireDispensaryAccess,
  };
}

module.exports = { createSession };

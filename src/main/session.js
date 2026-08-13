const { verifyPassword } = require('./auth');

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

    // Used by IPC handlers that touch clinic data — throws instead of
    // silently proceeding, so data can never be written without a known
    // author once logins are set up.
    requireLogin() {
      if (!currentStaff) throw new Error('Not logged in');
      return currentStaff;
    },
  };
}

module.exports = { createSession };

const crypto = require('crypto');

// Uses Node's built-in crypto (scrypt) rather than an npm package like
// bcrypt — bcrypt is a native module and would need the same
// electron-rebuild dance as better-sqlite3. crypto is already part of
// Electron's bundled Node, so this needs zero extra dependencies.

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };

const fs = require('fs');
const path = require('path');

const MAX_AUTO_BACKUPS = 10;
const FILE_PREFIX = 'careledger-backup-';
const FILE_SUFFIX = '.db';

function timestampedFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
  return `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`;
}

// Keeps only the most recent MAX_AUTO_BACKUPS files in a backups folder.
// Filenames sort lexicographically in chronological order (see
// timestampedFilename), so no need to stat every file's mtime.
function pruneOldBackups(dir, maxKept = MAX_AUTO_BACKUPS) {
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX))
    .sort();
  const excess = files.length - maxKept;
  for (let i = 0; i < excess; i++) {
    fs.rmSync(path.join(dir, files[i]), { force: true });
  }
  return excess > 0 ? excess : 0;
}

async function runAutoBackup(db, backupsDir) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const dest = path.join(backupsDir, timestampedFilename());
  await db.backupTo(dest);
  pruneOldBackups(backupsDir);
  return dest;
}

module.exports = { timestampedFilename, pruneOldBackups, runAutoBackup, MAX_AUTO_BACKUPS };

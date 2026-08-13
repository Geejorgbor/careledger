const { autoUpdater } = require('electron-updater');

// Never let a failed update check bother anyone or crash the app — no
// internet, no releases published yet, whatever the reason, CareLedger
// just keeps working exactly as it did before. It's built to work fully
// offline; checking for updates is a nice-to-have layer on top, not a
// requirement.
autoUpdater.on('error', (err) => {
  console.error('Update check failed:', err.message);
});

function checkForUpdatesQuietly() {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('Update check failed:', err.message);
  });
}

module.exports = { checkForUpdatesQuietly, autoUpdater };

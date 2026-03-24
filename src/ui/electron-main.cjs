/**
 * Electron main process for the Gitter Registry Browser.
 * This is a CommonJS file because Electron's main process requires it.
 *
 * Receives the server URL via GITTER_UI_URL environment variable.
 */

const { app, BrowserWindow } = require('electron');

const url = process.env.GITTER_UI_URL;
if (!url) {
  process.stderr.write('GITTER_UI_URL environment variable is not set.\n');
  process.exit(1);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Gitter Registry Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(url);

  win.on('closed', () => {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

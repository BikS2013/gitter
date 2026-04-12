/**
 * Electron main process for the Gitter Registry Browser.
 * This is a CommonJS file because Electron's main process requires it.
 *
 * Receives the server URL via GITTER_UI_URL environment variable.
 * Persists window size and position to ~/.gitter/ui-state.json.
 */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const url = process.env.GITTER_UI_URL;
if (!url) {
  process.stderr.write('GITTER_UI_URL environment variable is not set.\n');
  process.exit(1);
}

const STATE_FILE = path.join(process.env.HOME || '', '.gitter', 'ui-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // ignore corrupted state file
  }
  return null;
}

function saveWindowState(bounds) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(bounds, null, 2) + '\n', 'utf-8');
  } catch {
    // ignore write failures silently
  }
}

function createWindow() {
  const saved = loadWindowState();

  const options = {
    width: saved && saved.width ? saved.width : 1200,
    height: saved && saved.height ? saved.height : 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Gitter Registry Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  };

  // Restore position if saved
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    options.x = saved.x;
    options.y = saved.y;
  }

  const win = new BrowserWindow(options);
  win.loadURL(url);

  // Save state on resize and move (debounced)
  var saveTimeout = null;
  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(function() {
      var bounds = win.getBounds();
      saveWindowState(bounds);
    }, 500);
  }

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);

  win.on('closed', function() {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function() {
  app.quit();
});

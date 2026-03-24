import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startServer } from '../ui/server.js';

interface UiCmdOptions {
  port?: string;
  open?: boolean;  // Commander inverts --no-open to open: false
  browser?: boolean; // --browser flag to force system browser instead of Electron
}

export async function uiCommand(options: UiCmdOptions): Promise<void> {
  const port = parseInt(options.port ?? '3000', 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    process.stderr.write(`Invalid port: ${options.port}. Must be between 1 and 65535.\n`);
    process.exit(1);
  }

  startServer(port);

  if (options.open === false) return;

  const url = `http://127.0.0.1:${port}`;

  // --browser flag: open in system browser instead of Electron
  if (options.browser) {
    const { exec } = await import('child_process');
    exec(`open "${url}"`, (err) => {
      if (err) {
        process.stderr.write(`Could not open browser. Visit ${url} manually.\n`);
      }
    });
    return;
  }

  // Launch Electron window
  try {
    // Resolve paths: electron binary and the electron-main script
    const electronPath = (await import('electron')).default as unknown as string;
    // electron-main.cjs is a standalone CJS file that Electron can run directly.
    // It lives alongside the source in src/ui/ and is copied to dist/ui/ by build.
    // We resolve it relative to this file's location (works in both dev and prod).
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const electronMain = join(__dirname, '..', 'ui', 'electron-main.cjs');

    const child = spawn(electronPath, [electronMain], {
      env: { ...process.env, GITTER_UI_URL: url },
      stdio: 'ignore',
      detached: false,
    });

    child.on('error', (err) => {
      process.stderr.write(`Failed to launch Electron: ${err.message}\n`);
      process.stderr.write(`Falling back to system browser...\n`);
      import('child_process').then(({ exec }) => exec(`open "${url}"`));
    });

    // When Electron window closes, shut down the server
    child.on('exit', () => {
      process.exit(0);
    });
  } catch {
    // Fallback to system browser if Electron is not available
    process.stderr.write('Electron not available. Opening in system browser...\n');
    const { exec } = await import('child_process');
    exec(`open "${url}"`, (err) => {
      if (err) {
        process.stderr.write(`Could not open browser. Visit ${url} manually.\n`);
      }
    });
  }
}

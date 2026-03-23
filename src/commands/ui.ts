import { exec } from 'child_process';
import { startServer } from '../ui/server.js';

interface UiCmdOptions {
  port?: string;
  open?: boolean;  // Commander inverts --no-open to open: false
}

export async function uiCommand(options: UiCmdOptions): Promise<void> {
  const port = parseInt(options.port ?? '3000', 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    process.stderr.write(`Invalid port: ${options.port}. Must be between 1 and 65535.\n`);
    process.exit(1);
  }

  startServer(port);

  // Open browser (unless --no-open)
  if (options.open !== false) {
    const url = `http://127.0.0.1:${port}`;
    exec(`open "${url}"`, (err) => {
      if (err) {
        process.stderr.write(`Could not open browser. Visit ${url} manually.\n`);
      }
    });
  }
}

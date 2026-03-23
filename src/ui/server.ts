import { createServer, IncomingMessage, ServerResponse } from 'http';
import { loadRegistry } from '../registry.js';
import { getHtmlPage } from './html.js';

export function startServer(port: number): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHtmlPage());
    } else if (req.url === '/api/registry') {
      // Re-read registry from disk on every request (live data)
      try {
        const registry = loadRegistry();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(registry));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load registry' }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stderr.write(`Gitter UI server running at http://127.0.0.1:${port}\n`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Use --port to specify a different port.`);
    }
    if (err.code === 'EACCES') {
      throw new Error(`Permission denied for port ${port}. Try a port above 1024.`);
    }
    throw err;
  });

  // Graceful shutdown
  const shutdown = () => {
    process.stderr.write('\nShutting down Gitter UI server...\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

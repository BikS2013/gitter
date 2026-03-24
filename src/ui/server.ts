import { createServer, IncomingMessage, ServerResponse } from 'http';
import { loadRegistry, saveRegistry, findByPath } from '../registry.js';
import { validateTag, addTagsToEntry, removeTagsFromEntry } from '../commands/tag.js';
import { getHtmlPage } from './html.js';

/**
 * Parse a JSON body from an incoming HTTP request.
 */
function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function startServer(port: number): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHtmlPage());

    } else if (req.url === '/api/registry' && req.method === 'GET') {
      // Re-read registry from disk on every request (live data)
      try {
        const registry = loadRegistry();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(registry));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load registry' }));
      }

    } else if (req.url === '/api/tags' && req.method === 'GET') {
      // GET /api/tags - Return all unique tags with counts
      try {
        const registry = loadRegistry();
        const tagMap = new Map<string, { name: string; count: number }>();

        for (const entry of registry.repositories) {
          if (!entry.tags) continue;
          for (const tag of entry.tags) {
            const key = tag.toLowerCase();
            const existing = tagMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              tagMap.set(key, { name: tag, count: 1 });
            }
          }
        }

        const tags = [...tagMap.values()].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tags }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load registry' }));
      }

    } else if (req.url === '/api/tags/add' && req.method === 'POST') {
      // POST /api/tags/add - Add tags to a specific repo
      try {
        const body = await parseJsonBody(req) as { localPath?: string; tags?: string[] };

        if (!body.localPath || !Array.isArray(body.tags) || body.tags.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing localPath or tags array' }));
          return;
        }

        // Validate each tag before mutating
        const validatedTags: string[] = [];
        for (const tag of body.tags) {
          try {
            validatedTags.push(validateTag(tag));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
            return;
          }
        }

        const registry = loadRegistry();
        const entry = findByPath(registry, body.localPath);
        if (!entry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Repository not found' }));
          return;
        }

        entry.tags = addTagsToEntry(entry, validatedTags);
        saveRegistry(registry);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tags: entry.tags }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }

    } else if (req.url === '/api/tags/remove' && req.method === 'POST') {
      // POST /api/tags/remove - Remove tags from a specific repo
      try {
        const body = await parseJsonBody(req) as { localPath?: string; tags?: string[] };

        if (!body.localPath || !Array.isArray(body.tags) || body.tags.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing localPath or tags array' }));
          return;
        }

        const registry = loadRegistry();
        const entry = findByPath(registry, body.localPath);
        if (!entry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Repository not found' }));
          return;
        }

        const newTags = removeTagsFromEntry(entry, body.tags);
        if (newTags.length === 0) {
          delete entry.tags;
        } else {
          entry.tags = newTags;
        }

        saveRegistry(registry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tags: entry.tags ?? [] }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }

    } else if (req.url === '/api/tags/eliminate' && req.method === 'POST') {
      // POST /api/tags/eliminate - Remove a tag from ALL repos
      try {
        const body = await parseJsonBody(req) as { tag?: string };

        if (!body.tag || typeof body.tag !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing tag field' }));
          return;
        }

        let validatedTag: string;
        try {
          validatedTag = validateTag(body.tag);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
          return;
        }

        const registry = loadRegistry();
        const target = validatedTag.toLowerCase();
        let affected = 0;

        for (const entry of registry.repositories) {
          if (!entry.tags) continue;
          const before = entry.tags.length;
          entry.tags = entry.tags.filter(t => t.toLowerCase() !== target);
          if (entry.tags.length < before) affected++;
          if (entry.tags.length === 0) delete entry.tags;
        }

        saveRegistry(registry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, affected }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
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

# Investigation: Adding a Local Web UI to Gitter CLI

## 1. Node.js Built-in HTTP Server

### Creating the Server

Node.js ships with the `http` module (and `net` for lower-level socket operations). No npm dependency is required. The pattern for a minimal server with both HTML and JSON API endpoints:

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'http';

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHtmlPage());
  } else if (req.method === 'GET' && req.url === '/api/registry') {
    const registry = loadRegistry();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ repositories: registry.repositories }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stderr.write(`Gitter UI running at http://127.0.0.1:${port}\n`);
});
```

### Key Design Points

- **Bind to `127.0.0.1` only**, not `0.0.0.0`. This ensures the server is not accessible from the network. The `server.listen(port, '127.0.0.1', callback)` signature handles this.
- **Two routes only**: `GET /` serves HTML, `GET /api/registry` serves JSON. Everything else returns 404.
- **No routing library needed.** With only two endpoints, a simple `if/else` on `req.url` is sufficient.
- **Read registry fresh on each API call.** Call `loadRegistry()` inside the request handler, not at startup. This means CLI changes in another terminal are reflected on browser refresh.

### Embedding HTML as a Template String

The HTML page can be returned from a function that builds a template literal string. This keeps everything in one `.ts` file (`src/web-server.ts`):

```typescript
function getHtmlPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gitter Registry</title>
  <style>
    /* All CSS inlined here */
  </style>
</head>
<body>
  <!-- All HTML here -->
  <script>
    // All JS inlined here
  </script>
</body>
</html>`;
}
```

**Escaping concern:** Since the HTML is a TypeScript template literal, any `${` inside the JS section would be interpreted as a template expression. Mitigation strategies:
- Use string concatenation in the embedded JS instead of template literals (`'value: ' + variable`).
- Or use `\${` to escape any template literals in the embedded JS.
- Or define the JS as a separate `const jsCode = '...'` using single-quoted strings, then embed it.

**Recommendation:** Use a function that returns the HTML string. Keep the embedded JS simple enough that template literal conflicts are minimal. Where JS needs template literals, use `\${` escaping.

---

## 2. Markdown Rendering in the Browser

### Constraint

The refined request specifies: **no external frontend resources** (no CDN links, no fetch to external URLs). This rules out loading marked.js or any library from a CDN.

### Options Evaluated

| Option | Size | CDN Required | Covers Gitter's Markdown Subset | Verdict |
|--------|------|-------------|--------------------------------|---------|
| marked.js via CDN | ~40KB min | Yes | Full CommonMark | Rejected (no CDN allowed) |
| marked.js bundled inline | ~40KB | No (inline in HTML string) | Full CommonMark | Viable but large |
| markdown-it via CDN | ~60KB min | Yes | Full CommonMark + plugins | Rejected |
| showdown via CDN | ~45KB min | Yes | Full markdown | Rejected |
| Custom inline renderer | ~2-3KB | No | Headings, bold, italic, lists, code blocks, inline code, links, paragraphs | **Recommended** |

### Recommended Approach: Custom Inline Markdown Renderer

Since gitter descriptions use a predictable subset of markdown (headings, bold, italic, lists, code blocks, inline code, links, paragraphs), a custom renderer of ~60-80 lines of JS handles everything needed. This avoids bloating the HTML string with 40KB+ of library code.

**Implementation sketch:**

```javascript
function renderMarkdown(md) {
  if (!md) return '';
  // Escape HTML entities first
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => '<pre><code>' + code.trim() + '</code></pre>');

  // Split into lines for block-level processing
  const lines = html.split('\n');
  let result = '';
  let inList = false;
  let inParagraph = false;

  for (const line of lines) {
    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inParagraph) { result += '</p>'; inParagraph = false; }
      if (inList) { result += '</ul>'; inList = false; }
      const level = headingMatch[1].length;
      result += '<h' + level + '>' + inlineMarkdown(headingMatch[2]) + '</h' + level + '>';
      continue;
    }
    // List items (- or *)
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (listMatch) {
      if (inParagraph) { result += '</p>'; inParagraph = false; }
      if (!inList) { result += '<ul>'; inList = true; }
      result += '<li>' + inlineMarkdown(listMatch[1]) + '</li>';
      continue;
    }
    // Numbered list items
    const numListMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (numListMatch) {
      // ... similar handling with <ol>
    }
    // Empty line
    if (line.trim() === '') {
      if (inList) { result += '</ul>'; inList = false; }
      if (inParagraph) { result += '</p>'; inParagraph = false; }
      continue;
    }
    // Regular text -> paragraph
    if (!inParagraph) { result += '<p>'; inParagraph = true; }
    result += inlineMarkdown(line) + ' ';
  }
  if (inList) result += '</ul>';
  if (inParagraph) result += '</p>';
  return result;
}

function inlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')           // inline code
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // bold
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')              // italic
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); // links
}
```

This handles every markdown feature listed in the refined request. The full implementation will be ~60-80 lines of JS, adding ~2-3KB to the HTML payload. It avoids both CDN dependencies and the bloat of embedding a full markdown library.

---

## 3. Opening the Browser

### macOS Approach

Since gitter targets macOS (per project context), use the built-in `open` command:

```typescript
import { exec } from 'child_process';

function openBrowser(url: string): void {
  exec(`open "${url}"`, (error) => {
    if (error) {
      process.stderr.write(`Could not open browser: ${error.message}\n`);
      process.stderr.write(`Open ${url} manually.\n`);
    }
  });
}
```

### Cross-platform (if needed later)

```typescript
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
            : process.platform === 'win32' ? 'start'
            : 'xdg-open';
  exec(`${cmd} "${url}"`, (error) => {
    if (error) {
      process.stderr.write(`Could not open browser: ${error.message}\n`);
      process.stderr.write(`Open ${url} manually.\n`);
    }
  });
}
```

**Recommendation:** Start with the macOS-only `open` command. The cross-platform pattern is trivial to add later if needed. No npm dependency (`open` package) is required.

### Timing

Call `openBrowser()` inside the `server.listen()` callback, so the browser opens only after the server is ready to accept connections.

---

## 4. Single-Page App Design Patterns (Vanilla JS)

### Two-Panel Layout with CSS

```css
.app {
  display: flex;
  height: calc(100vh - 60px); /* subtract header */
}
.list-panel {
  width: 360px;
  min-width: 300px;
  overflow-y: auto;
  border-right: 1px solid #333;
}
.detail-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
/* Responsive: stack on narrow screens */
@media (max-width: 768px) {
  .app { flex-direction: column; }
  .list-panel { width: 100%; max-height: 40vh; border-right: none; border-bottom: 1px solid #333; }
  .detail-panel { flex: 1; }
}
```

### State Management Pattern

With vanilla JS, use a simple module-level state object and a render function:

```javascript
const state = {
  repos: [],           // Full list from API
  filtered: [],        // After applying filters
  selectedIndex: -1,   // Currently selected repo
  searchText: '',
  sortField: 'repoName',
  sortDirection: 'asc',
  filters: { hasDescription: false, missingDescription: false, hasNotes: false, missingNotes: false }
};

function applyFilters() {
  let list = state.repos;
  if (state.searchText) {
    const q = state.searchText.toLowerCase();
    list = list.filter(r =>
      r.repoName.toLowerCase().includes(q) ||
      r.localPath.toLowerCase().includes(q) ||
      r.remotes.some(rem => rem.fetchUrl.toLowerCase().includes(q) || rem.pushUrl.toLowerCase().includes(q))
    );
  }
  if (state.filters.hasDescription) list = list.filter(r => r.description);
  if (state.filters.missingDescription) list = list.filter(r => !r.description);
  if (state.filters.hasNotes) list = list.filter(r => r.notes);
  if (state.filters.missingNotes) list = list.filter(r => !r.notes);
  // Sort
  list.sort((a, b) => {
    const valA = a[state.sortField] || '';
    const valB = b[state.sortField] || '';
    const cmp = typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
    return state.sortDirection === 'asc' ? cmp : -cmp;
  });
  state.filtered = list;
  renderList();
  updateCount();
}

function renderList() {
  const container = document.getElementById('repo-list');
  container.innerHTML = state.filtered.map((repo, i) => `
    <div class="repo-card ${i === state.selectedIndex ? 'selected' : ''}"
         onclick="selectRepo(${i})">
      <div class="repo-name">${escapeHtml(repo.repoName)}</div>
      <div class="repo-path">${escapeHtml(repo.localPath)}</div>
      <span class="badge">${escapeHtml(repo.currentBranch)}</span>
      ${repo.description ? '<span class="indicator" title="Has description">D</span>' : ''}
      ${repo.notes ? '<span class="indicator" title="Has notes">N</span>' : ''}
      <div class="repo-updated">${timeAgo(repo.lastUpdated)}</div>
    </div>
  `).join('');
}
```

### Relative Time ("3 days ago")

```javascript
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  const intervals = [
    [31536000, 'year'], [2592000, 'month'], [86400, 'day'],
    [3600, 'hour'], [60, 'minute'], [1, 'second']
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return count + ' ' + label + (count > 1 ? 's' : '') + ' ago';
  }
  return 'just now';
}
```

### HTML Escaping

Essential for security even on localhost, since repo names or paths could contain `<`, `>`, `&`:

```javascript
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
```

---

## 5. Port Handling

### Detecting Port Conflicts

The `server.listen()` call emits an `'error'` event if the port is in use. The error code is `EADDRINUSE`:

```typescript
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `Error: Port ${port} is already in use. ` +
      `Use --port <number> to specify a different port.\n`
    );
    process.exit(1);
  }
  throw err;
});
```

**Per project rules:** No silent fallback to another port. The command fails with a clear error message.

### Other Port Errors

- `EACCES` -- port requires elevated privileges (ports < 1024). Unlikely since default is 3000, but should be handled:
  ```typescript
  if (err.code === 'EACCES') {
    process.stderr.write(`Error: Port ${port} requires elevated privileges.\n`);
    process.exit(1);
  }
  ```

### Port Validation

Validate the `--port` option in the command handler before starting the server:

```typescript
const portNum = parseInt(portOption, 10);
if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
  process.stderr.write('Error: Port must be a number between 1 and 65535.\n');
  process.exit(1);
}
```

---

## 6. Graceful Shutdown

```typescript
function setupShutdown(server: Server): void {
  const shutdown = () => {
    process.stderr.write('\nShutting down Gitter UI...\n');
    server.close(() => {
      process.exit(0);
    });
    // Force exit after 3 seconds if connections linger
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

---

## 7. Proposed File Structure

```
src/
  cli.ts                  # Add 'ui' command registration
  commands/
    ui.ts                 # Command handler: parse options, validate port, start server, open browser
  web-server.ts           # HTTP server creation, route handling, HTML generation
```

This matches the structure proposed in the refined request. The `web-server.ts` file will be the largest file since it contains the full HTML/CSS/JS as an embedded string.

### Estimated Size

- `commands/ui.ts`: ~40 lines (option parsing, calling server start, calling open browser)
- `web-server.ts`: ~400-500 lines total
  - Server setup + routes: ~50 lines
  - HTML generation function: ~350-450 lines (CSS: ~100 lines, HTML structure: ~80 lines, JS logic: ~200 lines including markdown renderer)

---

## 8. Summary of Recommendations

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| HTTP server | Node.js built-in `http` module | No new dependency, two routes only |
| Markdown rendering | Custom inline renderer (~70 lines JS) | No CDN (per acceptance criteria #14), avoids 40KB+ library bloat |
| Browser opening | `child_process.exec('open URL')` | macOS-native, no npm dependency |
| Frontend framework | Vanilla HTML/CSS/JS in template string | Per requirement, no build step |
| Layout | CSS flexbox two-panel with responsive stacking | Simple, no framework needed |
| Port conflict | `EADDRINUSE` error handler, fail with message | Per project rule: no fallbacks |
| State management | Module-level state object + render functions | Standard vanilla JS pattern |
| HTML escaping | Manual escaping function | Security even on localhost |
| Binding | `127.0.0.1` only | Not accessible from network |
| New npm dependencies | Zero | Everything uses Node.js built-ins |

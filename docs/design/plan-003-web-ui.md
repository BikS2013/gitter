# Plan 003: Gitter Web UI

## Overview

Add a `gitter ui` command that launches a local HTTP server and opens a browser-based, read-only view of the gitter registry. The UI is a single-page application with all HTML, CSS, and JS inlined -- zero external frontend dependencies, zero build step. The server uses Node.js built-in `http` module -- zero new npm dependencies.

---

## Implementation Phases

### Phase A: Create `src/ui/html.ts` -- HTML Page Generator

**Objective:** Export a function `getHtmlPage(): string` that returns the complete single-page application as a template literal string.

**Tasks:**
1. Create `src/ui/html.ts` with the exported `getHtmlPage()` function.
2. Implement all CSS inline within the `<style>` tag.
3. Implement all JavaScript inline within the `<script>` tag.
4. Implement the custom markdown renderer inline.

**Escaping strategy:** Since the HTML is a TypeScript template literal, any `${` inside the embedded JS must be escaped as `\${`. Keep embedded JS simple enough that conflicts are minimal.

### Phase B: Create `src/ui/server.ts` -- HTTP Server

**Objective:** Export a `startServer(port: number): http.Server` function that creates and starts the HTTP server with two routes.

**Tasks:**
1. Create `src/ui/server.ts`.
2. Implement route `GET /` serving the HTML page from `getHtmlPage()`.
3. Implement route `GET /api/registry` serving the registry JSON (re-read from disk on every request).
4. Return 404 for all other routes.
5. Bind to `127.0.0.1` only.
6. Handle `EADDRINUSE` -- throw/exit with clear error message.
7. Handle `EACCES` -- throw/exit with clear error message.
8. Set up graceful shutdown on `SIGINT` and `SIGTERM`.

### Phase C: Create `src/commands/ui.ts` -- Command Handler

**Objective:** Implement the `gitter ui` command handler that validates options, starts the server, and opens the browser.

**Tasks:**
1. Create `src/commands/ui.ts` with `uiCommand(options)` function.
2. Validate `--port` (must be 1-65535).
3. Call `startServer(port)`.
4. Open the default browser via `child_process.exec('open "http://127.0.0.1:<port>"')` unless `--no-open`.
5. Print server URL to stderr.

### Phase D: Wire into CLI and Update Documentation

**Tasks:**
1. Add `ui` command registration in `src/cli.ts` with `--port` and `--no-open` options.
2. Update `/Users/giorgosmarinos/aiwork/coding-platform/macbook-desktop/CLAUDE.md` with the `<Gitter>` tool documentation reflecting the new `ui` command.

---

## Design Details

### File Structure

```
src/
  ui/
    html.ts              # getHtmlPage(): string -- complete SPA as template literal
    server.ts            # startServer(port): Server -- HTTP server with routes + shutdown
  commands/
    ui.ts                # uiCommand(options) -- command handler
  cli.ts                 # Add 'ui' command registration (modify existing)
```

### Command Specification

```
gitter ui [--port <number>] [--no-open]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--port <number>` | number | 3000 | Port for the local web server |
| `--no-open` | boolean flag | false | Suppress automatic browser launch |

**Note:** The default port 3000 is a CLI option default, not a configuration fallback -- this is acceptable per project rules.

**Behavior:**
- Starts HTTP server on `127.0.0.1:<port>`.
- Opens default browser (unless `--no-open`).
- Prints server URL to stderr (stdout/stderr discipline).
- Runs until `Ctrl+C` (SIGINT/SIGTERM), then shuts down gracefully.
- If port is in use, exits with clear error -- no silent fallback.

### API Endpoint

**`GET /api/registry`**

Returns the full registry JSON, with the same structure as `~/.gitter/registry.json`:

```json
{
  "version": 1,
  "repositories": [
    {
      "repoName": "my-app",
      "localPath": "/Users/dev/projects/my-app",
      "remotes": [
        { "name": "origin", "fetchUrl": "git@github.com:user/my-app.git", "pushUrl": "git@github.com:user/my-app.git" }
      ],
      "remoteBranches": ["origin/main"],
      "localBranches": ["main", "develop"],
      "currentBranch": "main",
      "lastUpdated": "2026-03-20T14:30:00.000Z",
      "description": {
        "businessDescription": "...",
        "technicalDescription": "...",
        "generatedAt": "2026-03-19T10:00:00.000Z",
        "generatedBy": "claude-sonnet-4-20250514",
        "instructions": "focus on API design"
      },
      "notes": "## Setup\n- Run `npm install`\n..."
    }
  ]
}
```

The registry is read fresh from disk on every request via `loadRegistry()` so that CLI changes in another terminal are reflected on browser refresh.

**`GET /`**

Returns `text/html` -- the complete single-page application.

**All other routes:** Return 404 with `text/plain` body "Not Found".

### HTML Page Structure

```
+--------------------------------------------------+
|  Gitter Registry Browser           [search box]  |
|  Showing X of Y repositories                     |
|  [filter toggles: has desc, missing desc,        |
|   has notes, missing notes]                       |
|  [sort: name | updated | path] [asc/desc toggle] |
+---------------------+----------------------------+
|  Repo List          |  Detail View               |
|  (left panel,       |  (right panel,             |
|   scrollable)       |   scrollable)              |
|                     |                            |
|  +---------------+  |  Repository Name           |
|  | repo1         |  |  -------------------------  |
|  | /path/to/...  |  |  Path: /full/path          |
|  | [main] [D][N] |  |  Branch: main              |
|  | 3 days ago    |  |  Local branches: ...       |
|  +---------------+  |  Remote branches: ...      |
|                     |  Remotes:                   |
|  +---------------+  |    origin  fetch  push     |
|  | repo2 (sel)   |  |  Updated: 2026-03-20 ...   |
|  | /path/to/...  |  |                            |
|  | [develop] [D] |  |  --- Business Description  |
|  | 1 hour ago    |  |  [rendered markdown]       |
|  +---------------+  |                            |
|                     |  --- Technical Description  |
|  +---------------+  |  [rendered markdown]       |
|  | repo3         |  |                            |
|  | /path/to/...  |  |  Generated: 2026-03-19     |
|  | [main]        |  |  Model: claude-sonnet-...  |
|  | 5 min ago     |  |                            |
|  +---------------+  |  --- Notes                 |
|                     |  [rendered markdown]       |
+---------------------+----------------------------+
```

**Responsive:** At viewport width < 768px, panels stack vertically (list on top, detail below, list capped at 40vh).

### Repository List Panel (Left)

Each repo card displays:
- **Repository name** (bold, primary text)
- **Local path** (truncated, monospace, secondary/muted color)
- **Current branch** (badge/tag style)
- **Status indicators:** "D" badge if has description, "N" badge if has notes
- **Last updated** (relative time, e.g., "3 days ago")

Clicking a card selects it (visual highlight) and populates the detail panel.

### Detail View Panel (Right)

When a repo is selected:

**Metadata section:**
- Repository name (h2 heading)
- Local path (full, monospace, displayed as copyable text)
- Current branch
- Local branches (comma-separated list)
- Remote branches (comma-separated, collapsible via details/summary if > 10)
- Remotes table (columns: name, fetch URL, push URL)
- Last updated (ISO timestamp + relative time)

**Description section (if `description` field exists):**
- "Business Description" heading + rendered markdown of `description.businessDescription`
- "Technical Description" heading + rendered markdown of `description.technicalDescription`
- Generation metadata: timestamp, model, instructions (if any)
- If no description: muted placeholder "No description available. Run `gitter describe` to generate one."

**Notes section (if `notes` field exists):**
- "Notes" heading + rendered markdown of `notes`
- If no notes: muted placeholder "No notes. Run `gitter notes` to add some."

### Filtering

All filters are combined with AND logic. The list updates immediately as filters change (no submit button). The filtered count in the header updates dynamically.

| Filter | Type | Behavior |
|--------|------|----------|
| Text search | `<input type="text">` | Case-insensitive partial match on repoName, localPath, and remote URLs (fetchUrl, pushUrl) |
| Has description | toggle/checkbox | Show only repos where `description` is defined |
| Missing description | toggle/checkbox | Show only repos where `description` is undefined/null |
| Has notes | toggle/checkbox | Show only repos where `notes` is defined and non-empty |
| Missing notes | toggle/checkbox | Show only repos where `notes` is undefined/null/empty |

### Sorting

| Sort option | Sort key | Direction |
|-------------|----------|-----------|
| Name | `repoName` | A-Z / Z-A |
| Last updated | `lastUpdated` | Newest first / Oldest first |
| Path | `localPath` | A-Z / Z-A |

Default sort: Name A-Z. Control: a `<select>` dropdown for field + a button to toggle direction.

### Inline Markdown Renderer (~60-80 lines JS)

A custom, dependency-free markdown-to-HTML converter embedded in the page script. Supports the subset of markdown used in gitter descriptions and notes:

| Feature | Syntax | HTML Output |
|---------|--------|-------------|
| Headings | `# H1` through `###### H6` | `<h1>` through `<h6>` |
| Bold | `**text**` | `<strong>text</strong>` |
| Italic | `*text*` | `<em>text</em>` |
| Inline code | `` `code` `` | `<code>code</code>` |
| Code blocks | ```` ``` ... ``` ```` | `<pre><code>...</code></pre>` |
| Unordered lists | `- item` or `* item` | `<ul><li>item</li></ul>` |
| Ordered lists | `1. item` | `<ol><li>item</li></ol>` |
| Links | `[text](url)` | `<a href="url" target="_blank">text</a>` |
| Paragraphs | Double newline separated text | `<p>text</p>` |

**Implementation approach:**
1. Escape HTML entities first (`&`, `<`, `>`)
2. Extract and replace code blocks (``` ... ```) before line-level processing to avoid interference
3. Process lines: detect headings, list items (unordered and ordered), empty lines, regular text
4. Apply inline transformations: inline code, bold, italic, links
5. Manage open/close tags for lists and paragraphs via state flags

### CSS Design

- Clean, modern, light theme with developer-friendly aesthetics
- Monospace font (`"SF Mono", "Fira Code", "Consolas", monospace`) for paths, branches, code
- Sans-serif font (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`) for UI text and descriptions
- Color palette: neutral grays for backgrounds, blue accent for selection and links, subtle borders
- Badge styling for branch names and D/N indicators
- Smooth transitions on hover/selection states
- Scrollable panels with contained overflow
- Fixed header area (filter/sort controls always visible)

### Server Module (`src/ui/server.ts`)

```typescript
// Exports:
export function startServer(port: number): http.Server;

// Internal:
// - Creates HTTP server with request router
// - Binds to 127.0.0.1
// - Sets up EADDRINUSE / EACCES error handlers
// - Sets up SIGINT/SIGTERM graceful shutdown
// - Returns the server instance
```

**Graceful shutdown logic:**
1. Listen for `SIGINT` and `SIGTERM`
2. Print shutdown message to stderr
3. Call `server.close()` to stop accepting new connections
4. Force exit after 3 seconds if connections linger (via `setTimeout(...).unref()`)

**Error handling:**
- `EADDRINUSE`: print "Error: Port N is already in use. Use --port <number> to specify a different port." to stderr, exit(1)
- `EACCES`: print "Error: Port N requires elevated privileges." to stderr, exit(1)

### Command Handler (`src/commands/ui.ts`)

```typescript
interface UiCmdOptions {
  port?: string;
  open?: boolean;  // commander inverts --no-open to options.open = false
}

export async function uiCommand(options: UiCmdOptions): Promise<void>;
```

**Logic:**
1. Parse and validate port (default 3000, must be integer 1-65535)
2. Call `startServer(port)` from `../ui/server.js`
3. In the server's `listening` callback: if `options.open !== false`, call `exec('open "http://127.0.0.1:${port}"')` to launch browser
4. Print "Gitter UI running at http://127.0.0.1:PORT" and "Press Ctrl+C to stop" to stderr

**Browser opening:** Use `child_process.exec('open "<url>"')` -- macOS native, no npm dependency needed. On error, print fallback message suggesting manual URL opening.

### CLI Registration (modify `src/cli.ts`)

```typescript
import { uiCommand } from './commands/ui.js';

program
  .command('ui')
  .description('Launch web UI to browse the repository registry')
  .option('--port <number>', 'Port for the local web server', '3000')
  .option('--no-open', 'Do not open the browser automatically')
  .action(uiCommand);
```

### Frontend State Management (Vanilla JS)

Simple module-level state object with render functions:

```javascript
const state = {
  repos: [],            // Full list from API
  filtered: [],         // After applying filters + sort
  selectedIndex: -1,    // Currently selected repo index in filtered array
  searchText: '',
  sortField: 'repoName',
  sortDirection: 'asc',
  filters: {
    hasDescription: false,
    missingDescription: false,
    hasNotes: false,
    missingNotes: false
  }
};
```

**Data flow:**
1. On page load: `fetch('/api/registry')` -> store `repositories` array in `state.repos` -> call `applyFilters()`
2. On any filter/sort change: call `applyFilters()` which filters, sorts, updates `state.filtered`, then calls `renderList()` and `updateCount()`
3. On repo click: set `state.selectedIndex`, call `renderList()` (to update highlight) and `renderDetail()`

**Utility functions (embedded JS):**
- `escapeHtml(str)` -- prevent XSS even on localhost (repo names/paths could contain `<`, `>`, `&`)
- `timeAgo(isoString)` -- relative time ("3 days ago", "just now")
- `renderMarkdown(md)` -- custom markdown-to-HTML converter

---

## Dependencies

**New npm dependencies: NONE**

Everything uses Node.js built-ins:
- `http` module for the server
- `child_process.exec` for opening the browser
- `loadRegistry()` from existing `src/registry.ts` for data access

**No external frontend resources:** No CDN links, no fetch to external URLs. All HTML, CSS, and JS are inlined in the template literal string.

---

## Non-Functional Requirements

| Requirement | Implementation |
|-------------|---------------|
| Read-only | Server never writes to the registry |
| Localhost only | Bind to `127.0.0.1`, not `0.0.0.0` |
| No authentication | Localhost-only, not network accessible |
| No pagination | Registry is typically small (tens to low hundreds of entries) |
| No port fallback | `EADDRINUSE` -> fail with error, per project rule |
| No live reload | User manually refreshes browser to see registry changes |
| No persistent UI state | Theme, sort order, filter state are not persisted |
| stdout/stderr discipline | All server messages go to stderr |

---

## Estimated File Sizes

| File | Estimated Lines | Notes |
|------|----------------|-------|
| `src/ui/html.ts` | 400-500 | CSS ~120 lines, HTML structure ~80 lines, JS logic ~250 lines (includes markdown renderer ~70 lines, state management ~60 lines, rendering ~80 lines, utilities ~40 lines) |
| `src/ui/server.ts` | 60-80 | Server creation, routing, error handling, graceful shutdown |
| `src/commands/ui.ts` | 30-40 | Option validation, server start, browser open |
| `src/cli.ts` (diff) | +5 lines | Import + command registration |

---

## Acceptance Criteria

1. `gitter ui` starts a local web server on port 3000 and opens the browser.
2. `gitter ui --port 8080` uses port 8080 instead.
3. `gitter ui --no-open` starts the server without opening the browser.
4. The web page loads and displays all registered repositories in a list.
5. Clicking a repository shows its full metadata, rendered description, and rendered notes in the detail panel.
6. Text search filters the list by name, path, or remote URL as the user types.
7. Toggle filters for has/missing description and has/missing notes work correctly.
8. Sorting by name, last updated, and path works in both directions.
9. The filtered count updates dynamically in the header.
10. Markdown in descriptions and notes renders correctly (headings, lists, bold, italic, code blocks, inline code, links).
11. `Ctrl+C` in the terminal stops the server gracefully.
12. If port is occupied, the command exits with a clear error.
13. The server binds to `127.0.0.1` only (not `0.0.0.0`).
14. No external frontend resources are loaded (no CDN links, no fetch to external URLs).

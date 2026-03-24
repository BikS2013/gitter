# Codebase Analysis for Tag Feature Integration

## 1. Project Overview

- **Language**: TypeScript (ESM modules, `"type": "module"` in package.json)
- **Runtime**: Node.js
- **Build**: `tsc` for production, `npx tsx` for development
- **CLI framework**: commander.js
- **Interactive prompts**: @inquirer/prompts (with `output: process.stderr`)
- **Styling**: picocolors (terminal colors), cli-table3 (tables)
- **Tests**: Custom scripts in `test_scripts/`, run via `npx tsx`, no test framework

### Directory Layout

```
src/
  cli.ts              # Entry point - Commander program with 12 commands
  types.ts            # All interfaces: RegistryEntry, Registry, Remote, etc.
  registry.ts         # CRUD operations on ~/.gitter/registry.json
  git.ts              # Git CLI wrappers (execFileSync)
  ai-config.ts        # AI provider config loading
  ai-client.ts        # Claude API client factory
  repo-content.ts     # Content collector for AI analysis
  commands/
    scan.ts           # Register/update repo from CWD
    list.ts           # Table of all repos
    search.ts         # Search by name/path/URL
    go.ts             # Output path for shell cd
    info.ts           # Detailed repo metadata display
    remove.ts         # Remove from registry
    init.ts           # Print shell function
    describe.ts       # AI-powered descriptions
    rename.ts         # Rename repo in registry
    notes.ts          # Add/edit user notes
    remember-claude.ts # Save Claude session IDs
    ui.ts             # Launch web UI server
  ui/
    html.ts           # Single-page HTML app (template literal, no deps)
    server.ts         # HTTP server (Node.js built-in, no Express)
test_scripts/         # 6 test files, 62 total tests
```

## 2. Module Map

### `src/types.ts` - Data Model

Key interface for the tag feature:

```typescript
interface RegistryEntry {
  repoName: string;
  localPath: string;          // unique key
  remotes: Remote[];
  remoteBranches: string[];
  localBranches: string[];
  currentBranch: string;
  lastUpdated: string;        // ISO 8601
  description?: RepoDescription;
  notes?: string;
  claudeSessions?: ClaudeSession[];
  // NEW: tags?: string[]     <-- to be added here
}
```

### `src/registry.ts` - Registry CRUD

Functions: `loadRegistry`, `saveRegistry`, `addOrUpdate`, `findByPath`, `removeByPath`, `searchEntries`, `ensureRegistryExists`, `getRegistryDir`, `getRegistryPath`.

- **Atomic writes**: `saveRegistry` writes to a temp file then renames.
- **`addOrUpdate`**: Replaces the entire entry by `localPath` index. This means the caller must ensure optional fields (description, notes, tags) are carried forward.
- **`searchEntries`**: Searches `repoName`, `localPath`, and remote URLs. Currently does NOT search tags (out of scope per spec, but relevant for future).

### `src/cli.ts` - Command Registration

Uses Commander. Each command is registered with `.command()`, `.description()`, `.option()`, `.action()`. The tag command will follow this exact pattern. Currently 12 commands registered.

### `src/commands/scan.ts` - Field Preservation Pattern

Critical for FR-07. The scan command explicitly preserves optional fields:

```typescript
if (existing?.description) metadata.description = existing.description;
if (existing?.notes) metadata.notes = existing.notes;
if (existing?.claudeSessions) metadata.claudeSessions = existing.claudeSessions;
// NEW: if (existing?.tags) metadata.tags = existing.tags;  <-- must add
```

### `src/commands/info.ts` - Display Pattern

Displays optional fields in dedicated sections. Tags should follow the same pattern, placed between "Last Updated" and "Description" sections (or wherever appropriate). Uses `pc.bold()` for labels, `pc.cyan()` / `pc.green()` for values.

### `src/commands/notes.ts` - Command Handler Pattern

Reference implementation for a command that mutates a single optional field:
1. `resolveEntry(query)` - resolves target from query string or CWD
2. Load registry, find entry by path, mutate the field, save registry
3. Uses `@inquirer/prompts` with `{ output: process.stderr }` for interactive selection
4. Uses `confirm()` before destructive operations

### `src/ui/server.ts` - HTTP API Pattern

Currently has two routes:
- `GET /` - serves HTML page via `getHtmlPage()`
- `GET /api/registry` - returns full registry JSON

Pattern for adding new endpoints: the server uses a simple `if/else if` chain on `req.url`. For POST endpoints, the request body must be manually parsed from the stream (no Express body parser). New tag endpoints needed:
- `POST /api/tags/add`
- `POST /api/tags/remove`
- `POST /api/tags/eliminate`
- `GET /api/tags`

### `src/ui/html.ts` - Web UI Patterns

Single exported function `getHtmlPage()` returns a complete HTML string (template literal). Key patterns:

**State management** (line 244):
```javascript
const state = {
  repos: [], filtered: [], selected: null,
  searchQuery: '', sortField: 'repoName', sortDir: 'asc',
  filters: { hasDesc: false, noDesc: false, hasNotes: false, noNotes: false }
  // NEW: add selectedTags: [] or similar
};
```

**Filter buttons** (lines 219-223): Toggle buttons in the header with `data-filter` attributes and `.filter-btn` class. Tag filters need a different UI approach (dynamic tag list, not hardcoded buttons).

**`applyFilters()` function** (line 347): Chains filters: text search first, then toggle filters (AND logic between filter categories), then sort. Tag filtering should be added as another filter stage here.

**`renderList()` function** (line 387): Renders repo cards. Each card shows `repoName`, `localPath`, `currentBranch`, and indicators for description/notes. Tags should render as badges in the `.repo-meta` div.

**`renderDetail()` function** (line 422): Shows full detail for selected repo. Tags should appear here with add/remove controls.

**Data fetching**: `fetchRegistry()` calls `GET /api/registry`. Tag mutations will need separate `fetch()` calls to the new POST endpoints, followed by a `fetchRegistry()` to refresh.

## 3. Conventions

### Coding Patterns
- **No config fallbacks**: Missing config throws exceptions (exception: `maxTokens` defaults to 4096)
- **stdout/stderr discipline**: Interactive output to stderr; only machine-parseable output to stdout
- **Entry resolution**: Commands that target a repo use the `resolveEntry` pattern: accept optional query, fall back to CWD detection, prompt on ambiguity
- **Registry mutation**: Load -> find -> mutate in place -> save (atomic)
- **Error handling**: `process.stderr.write()` + `process.exit(1)` for user-facing errors

### Testing
- Tests in `test_scripts/`, run with `npx tsx test_scripts/test-*.ts`
- No framework; manual assertions with console output
- New test file needed: `test_scripts/test-tags.ts`

## 4. Integration Points

### Files That Must Be Modified

| File | Change | Details |
|------|--------|---------|
| `src/types.ts` | Add `tags?: string[]` to `RegistryEntry` | FR-01 |
| `src/cli.ts` | Register new `tag` command | FR-02 through FR-06 |
| `src/commands/scan.ts` | Preserve `tags` across re-scans | FR-07: add `if (existing?.tags) metadata.tags = existing.tags;` |
| `src/commands/info.ts` | Display tags in output | FR-08: add tags section |
| `src/ui/server.ts` | Add 4 API endpoints | FR-14: POST add/remove/eliminate, GET tags |
| `src/ui/html.ts` | Tag display, filtering, add/remove UI | FR-09 through FR-13 |

### Files That Must Be Created

| File | Purpose |
|------|---------|
| `src/commands/tag.ts` | CLI tag command handler (add, remove, list, list-all, eliminate) |
| `test_scripts/test-tags.ts` | Tag feature tests |

### Patterns the New Code Must Follow

1. **Command handler**: Follow `notes.ts` pattern -- `resolveEntry()` for repo resolution, `loadRegistry()`/`saveRegistry()` for mutations, `confirm()` for destructive ops, stderr for prompts
2. **CLI registration**: Follow the Commander pattern in `cli.ts` with `.command()`, `.option()`, `.action()`
3. **Server endpoints**: Extend the `if/else if` chain in `server.ts`. For POST endpoints, parse JSON body from request stream. Return JSON responses with appropriate status codes
4. **UI state**: Add tag-related state (e.g., `selectedTags: []`) to the `state` object. Add tag filter logic to `applyFilters()`. Render tag badges in `renderList()` and `renderDetail()`
5. **Tag validation** (FR-15): Implement as a utility function -- trim whitespace, reject empty/whitespace-only, enforce 50-char max, reject commas
6. **Case-insensitive dedup**: When adding tags, compare case-insensitively against existing tags to prevent duplicates
7. **Scan preservation**: Add one line in `scan.ts` following the existing pattern for `description`, `notes`, and `claudeSessions`

### Key Symbol References

- `RegistryEntry` interface: `src/types.ts`, line 17
- `addOrUpdate()`: `src/registry.ts`, line 106
- `saveRegistry()`: `src/registry.ts`, line 77
- `loadRegistry()`: `src/registry.ts`, line 48
- `findByPath()`: `src/registry.ts`, line 99
- `searchEntries()`: `src/registry.ts`, line 128
- `scanCommand()` preservation block: `src/commands/scan.ts`, lines 29-37
- `infoCommand()` display sections: `src/commands/info.ts`, lines 92-134
- `startServer()` route chain: `src/ui/server.ts`, lines 6-24
- `state` object: `src/ui/html.ts`, line 244
- `applyFilters()`: `src/ui/html.ts`, line 347
- `renderList()` card markup: `src/ui/html.ts`, line 399
- Filter button markup: `src/ui/html.ts`, lines 219-223

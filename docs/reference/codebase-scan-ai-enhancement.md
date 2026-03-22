# Codebase Scan: gitter CLI -- AI Enhancement Integration Points

## Document Info

| Field | Value |
|-------|-------|
| Project | gitter |
| Purpose | Architecture scan to guide AI repo-description feature integration |
| Date | 2026-03-22 |
| Based On | Refined request: `refined-request-ai-repo-descriptions.md` |

---

## 1. Project Structure

```
gitter/
  package.json            # ESM ("type": "module"), bin -> dist/cli.js
  tsconfig.json           # target ES2022, module Node16, rootDir src/, outDir dist/
  src/
    cli.ts                # Commander program setup, command registration, entry point
    types.ts              # Core interfaces: Remote, RegistryEntry, Registry
    git.ts                # Git command wrappers (execFileSync-based)
    registry.ts           # Registry CRUD with atomic file writes
    commands/
      scan.ts             # Scan CWD git repo and register/update in registry
      list.ts             # List all registered repos in a table
      search.ts           # Search repos by query, display table
      go.ts               # Resolve query to path, print to stdout for shell cd
      info.ts             # Show detailed repo metadata
      remove.ts           # Remove repo from registry with confirmation
      init.ts             # Print shell function for `gitter go` integration
  dist/                   # Compiled output (committed)
  docs/
    design/               # Design documents
    reference/            # Reference material
  test_scripts/           # Test scripts
```

---

## 2. Dependencies

### Production

| Package | Version | Usage |
|---------|---------|-------|
| `commander` | ^14.0.3 | CLI framework (program, subcommands, options) |
| `picocolors` | ^1.1.1 | Terminal color output (bold, green, red, cyan, yellow) |
| `cli-table3` | ^0.6.5 | Formatted table output (list, search commands) |
| `@inquirer/prompts` | ^8.3.2 | Interactive select and confirm prompts |

### Dev

| Package | Version | Usage |
|---------|---------|-------|
| `typescript` | ^5.9.3 | Compiler |
| `tsx` | ^4.21.0 | Dev runner (`npm run dev`) |
| `@types/node` | ^25.5.0 | Node type definitions |

### New Dependencies Required for AI Feature

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Claude API client (Anthropic, Azure, Vertex) |
| `dotenv` | Load `.env` files for config resolution |

---

## 3. Core Data Model (`src/types.ts`)

### Current Interfaces

```typescript
interface Remote {
  name: string;       // e.g., "origin"
  fetchUrl: string;
  pushUrl: string;
}

interface RegistryEntry {
  repoName: string;        // basename of repo root directory
  localPath: string;       // absolute path (unique identifier)
  remotes: Remote[];
  remoteBranches: string[];
  localBranches: string[];
  currentBranch: string;
  lastUpdated: string;     // ISO 8601
}

interface Registry {
  version: number;         // currently 1
  repositories: RegistryEntry[];
}
```

### Extension Required

Add to `types.ts`:

```typescript
interface RepoDescription {
  businessDescription: string;
  technicalDescription: string;
  generatedAt: string;      // ISO 8601
  generatedBy: string;      // model identifier
  instructions?: string;    // user instructions used
}
```

Then add `description?: RepoDescription` to `RegistryEntry`.

**Impact**: The field is optional, so existing registries are backward-compatible. No version bump needed. `loadRegistry()` and `saveRegistry()` require no changes since they serialize/deserialize the full object via `JSON.stringify`/`JSON.parse`.

---

## 4. Registry Module (`src/registry.ts`)

### Key Functions

| Function | Signature | Role |
|----------|-----------|------|
| `getRegistryDir()` | `() => string` | Returns `~/.gitter/`, throws if `HOME` unset |
| `getRegistryPath()` | `() => string` | Returns `~/.gitter/registry.json` |
| `ensureRegistryExists()` | `() => void` | Creates dir and empty registry if needed |
| `loadRegistry()` | `() => Registry` | Reads + parses JSON, validates schema |
| `saveRegistry(registry)` | `(Registry) => void` | Atomic write via tmp file + rename |
| `findByPath(registry, localPath)` | `(...) => RegistryEntry \| undefined` | Exact match by path |
| `addOrUpdate(registry, entry)` | `(...) => Registry` | Upsert by localPath |
| `removeByPath(registry, localPath)` | `(...) => Registry` | Filter out by localPath |
| `searchEntries(registry, query)` | `(...) => RegistryEntry[]` | Case-insensitive partial match on repoName, localPath, remote URLs |

### Integration Notes

- `getRegistryDir()` returns `~/.gitter/` -- the same directory where `config.json` for AI settings will live.
- `addOrUpdate()` replaces the entire `RegistryEntry` object by `localPath`. The `describe` command must load, mutate the `description` field on the found entry, and then save. It should NOT call `addOrUpdate` with a new entry object (which would wipe branch metadata). Instead, directly modify the entry in `registry.repositories` and call `saveRegistry()`.
- `searchEntries()` is the shared query-resolution function used by `info`, `go`, `search`, and `remove`. The `describe` command should use the same function for consistency.

---

## 5. Git Module (`src/git.ts`)

### Key Functions

| Function | Purpose |
|----------|---------|
| `git(args, cwd?)` | Execute git command, return trimmed stdout. Timeout: 10s. Throws on ENOENT, ETIMEDOUT, or non-zero exit. |
| `isInsideGitRepo(cwd?)` | Boolean check via `rev-parse --is-inside-work-tree` |
| `getRepoRoot(cwd?)` | Absolute repo root via `rev-parse --show-toplevel` |
| `getRemotes(cwd?)` | Parse `git remote -v` into `Remote[]` |
| `getLocalBranches(cwd?)` | Local branch names via `git branch --list` |
| `getRemoteBranches(cwd?)` | Remote-tracking branches via `git branch -r` |
| `getCurrentBranch(cwd?)` | Current branch via `rev-parse --abbrev-ref HEAD` |
| `collectRepoMetadata(cwd?)` | Aggregates all above into a `RegistryEntry` |

### Integration Notes for `repo-content.ts`

The new `repo-content.ts` module will need to call `git()` directly for `git ls-tree -r --name-only HEAD`. The `git()` function is already exported and supports `cwd` parameter. The 10-second timeout should be sufficient for file-tree listing but may need consideration for very large repos.

---

## 6. CLI Entry Point (`src/cli.ts`)

### Structure

- Shebang line (`#!/usr/bin/env node`)
- Commander `program` setup with name, version, description
- Seven subcommands registered via `.command()...action()`
- Default action: if CWD is a git repo, run `scan`; otherwise, show help
- Global uncaught exception handler: writes to stderr and exits with code 1

### Import Pattern

All imports use ESM with `.js` extensions (required by Node16 module resolution):

```typescript
import { scanCommand } from './commands/scan.js';
```

### Registration Pattern for New Command

```typescript
import { describeCommand } from './commands/describe.js';

program
  .command('describe [query]')
  .description('Generate or show AI-powered repository description')
  .option('--instructions <text>', 'Additional instructions for the AI')
  .option('--show', 'Show stored description without regenerating')
  .option('--business-lines <n>', 'Target line count for business description', '20')
  .option('--technical-lines <n>', 'Target line count for technical description', '20')
  .action(describeCommand);
```

---

## 7. Command Handler Patterns

### Common Resolution Pattern (info, go, remove)

All commands that resolve a query to a single entry follow this pattern:

1. `loadRegistry()` -- load registry
2. `searchEntries(registry, query)` -- find matches
3. 0 matches: `process.stderr.write(...)` + `process.exit(1)`
4. 1 match: use directly
5. N matches: `select()` from `@inquirer/prompts` with `{ output: process.stderr }`
6. Operate on selected entry

The `describe` command must follow this same pattern but also handle the "no query, use CWD" case (similar to `scan` which checks `isInsideGitRepo()` and uses `getRepoRoot()`).

### Output Conventions

| Stream | Usage |
|--------|-------|
| `stdout` | Data output (console.log, tables, paths for shell capture) |
| `stderr` | Errors, interactive prompts, informational messages |

### Error Handling

- **No try/catch in commands** -- errors propagate to the global `uncaughtException` handler in `cli.ts`
- **Throws use `new Error(message)`** -- plain Error class, no custom error types
- **No fallback values** -- missing config or invalid state always throws
- **Exit codes**: 0 for success, 1 for errors

---

## 8. info Command Analysis (`src/commands/info.ts`)

This is the command that will be extended to show descriptions (FR-14).

### Current Output Sections

1. Repository Name (bold label)
2. Local Path (with red `[MISSING]` tag if path doesn't exist)
3. Remotes (name in cyan, fetch/push URLs)
4. Local Branches (current branch in green with `*`)
5. Remote Branches
6. Current Branch (green)
7. Last Updated

### Extension Point

After the "Last Updated" line (line 90), add:

```typescript
// Description section
if (entry.description) {
  console.log(pc.bold('--- Description ---'));
  console.log(`${pc.bold('Business Description:')}`);
  console.log(entry.description.businessDescription);
  console.log(`${pc.bold('Technical Description:')}`);
  console.log(entry.description.technicalDescription);
  console.log(`${pc.bold('Description Generated:')} ${entry.description.generatedAt}`);
} else {
  console.log(`${pc.bold('Description:')} (none -- run 'gitter describe' to generate)`);
}
```

---

## 9. New Modules Required

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| AI Config | `src/ai-config.ts` | Load AI config from env vars, `.env`, `~/.gitter/config.json` with priority resolution | `dotenv`, `fs`, `registry.ts` (for `getRegistryDir`) |
| AI Client | `src/ai-client.ts` | Factory to create appropriate Claude SDK client based on provider | `@anthropic-ai/sdk`, `ai-config.ts` |
| Repo Content | `src/repo-content.ts` | Collect file tree, README, manifests, source snippets from a repo | `git.ts`, `fs` |
| Describe Command | `src/commands/describe.ts` | Command handler for `gitter describe [query]` | All of the above + `registry.ts`, `types.ts` |

---

## 10. Integration Summary

### What Changes in Existing Files

| File | Change | Scope |
|------|--------|-------|
| `src/types.ts` | Add `RepoDescription` interface; add `description?: RepoDescription` to `RegistryEntry` | 2 new types, 1 field addition |
| `src/cli.ts` | Import and register `describeCommand` | ~5 lines added |
| `src/commands/info.ts` | Display description section at end of output | ~15 lines added after line 90 |

### What Does NOT Change

| File | Reason |
|------|--------|
| `src/registry.ts` | `loadRegistry`/`saveRegistry` handle arbitrary JSON structure; no schema migration needed |
| `src/git.ts` | No changes needed; `git()` function is reused as-is by `repo-content.ts` |
| `src/commands/scan.ts` | Scan does not interact with descriptions |
| `src/commands/go.ts` | No description display |
| `src/commands/search.ts` | No description display |
| `src/commands/list.ts` | No description display |
| `src/commands/remove.ts` | Removing an entry removes its description automatically (it's part of the entry) |
| `src/commands/init.ts` | Shell function unchanged |

### Critical Design Constraints

1. **No config fallbacks**: Missing AI config must throw, never substitute defaults. The only CLI defaults are `--business-lines 20` and `--technical-lines 20`, which are UX defaults for optional command parameters, not config settings.
2. **ESM imports**: All imports must use `.js` extensions (`import { foo } from './ai-config.js'`).
3. **Atomic writes**: Registry saves use tmp file + rename (already handled by `saveRegistry`).
4. **stderr for prompts/errors**: Interactive prompts pass `{ output: process.stderr }`.
5. **Direct entry mutation**: To update only the `description` field, find the entry in `registry.repositories`, mutate it in place, and call `saveRegistry(registry)`. Do not use `addOrUpdate()` as that replaces the full entry.

---

## 11. TypeScript Configuration

| Setting | Value | Relevance |
|---------|-------|-----------|
| `target` | ES2022 | Top-level await supported |
| `module` | Node16 | ESM with `.js` import extensions required |
| `moduleResolution` | Node16 | Matches module setting |
| `strict` | true | All strict checks enabled |
| `outDir` | dist | Compiled JS goes to `dist/` |
| `rootDir` | src | Source in `src/` |
| `declaration` | true | `.d.ts` files emitted |

---

## 12. Build and Run

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `dev` | `tsx src/cli.ts` | Run directly without compilation |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `start` | `node dist/cli.js` | Run compiled version |

After adding new files, run `npm run build` to compile. The `dist/` directory appears to be committed to the repository.

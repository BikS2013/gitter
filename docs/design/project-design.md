# Gitter CLI Tool - Technical Design

## Document Info

| Field | Value |
|-------|-------|
| Project | gitter |
| Version | 1.0.0 |
| Date | 2026-03-22 |
| Status | Design Complete |
| Based On | plan-001-gitter-cli-tool.md, investigation-gitter-cli-tool.md, refined-request-gitter-repo-registry.md |

---

## 1. System Architecture

### 1.1 Component Diagram

```
+------------------------------------------------------------------+
|                         USER SHELL (zsh/bash)                     |
|                                                                   |
|  gitter() {           <-- shell function (installed via init)     |
|    if "go" -> capture stdout -> cd "$target"                      |
|    else    -> passthrough to binary                               |
|  }                                                                |
+---------|--------------------------------------------------------+
          |
          v
+------------------------------------------------------------------+
|                      CLI ENTRY POINT (src/cli.ts)                 |
|                                                                   |
|  #!/usr/bin/env node                                              |
|  Commander program definition                                     |
|  Default action: is git repo? -> scan : show help                 |
|                                                                   |
|  Subcommands:                                                     |
|    scan | list | search | go | info | remove | init               |
+---------|--------------------------------------------------------+
          |
          v
+------------------------------------------------------------------+
|                   COMMAND HANDLERS (src/commands/*.ts)             |
|                                                                   |
|  scan.ts -----> git.collectRepoMetadata() + registry.addOrUpdate()|
|  list.ts -----> registry.loadRegistry() + cli-table3 formatting   |
|  search.ts ---> registry.searchEntries() + cli-table3 formatting  |
|  go.ts -------> registry.searchEntries() + inquirer select        |
|  info.ts -----> registry.searchEntries() + detailed formatting    |
|  remove.ts ---> registry.removeByPath() + inquirer confirm        |
|  init.ts -----> prints shell function to stdout                   |
+--------|-----------------------------|---------------------------+
         |                             |
         v                             v
+-------------------------+  +---------------------------+
|  GIT MODULE             |  |  REGISTRY MODULE          |
|  (src/git.ts)           |  |  (src/registry.ts)        |
|                         |  |                           |
|  git()                  |  |  getRegistryDir()         |
|  isInsideGitRepo()      |  |  getRegistryPath()        |
|  getRepoRoot()          |  |  ensureRegistryExists()   |
|  getRemotes()           |  |  loadRegistry()           |
|  getLocalBranches()     |  |  saveRegistry()           |
|  getRemoteBranches()    |  |  findByPath()             |
|  getCurrentBranch()     |  |  addOrUpdate()            |
|  collectRepoMetadata()  |  |  removeByPath()           |
|                         |  |  searchEntries()          |
+--------+----------------+  +------------+--------------+
         |                               |
         v                               v
+-------------------------+  +---------------------------+
|  child_process          |  |  fs (Node.js built-in)    |
|  (Node.js built-in)     |  |                           |
|  execFileSync('git'..)  |  |  readFileSync / writeFile |
+-------------------------+  |  renameSync (atomic)      |
                             |  mkdirSync / existsSync   |
                             +---------------------------+
                                         |
                                         v
                             +---------------------------+
                             |  ~/.gitter/registry.json  |
                             +---------------------------+
```

### 1.2 Data Flow: `gitter scan`

```
CWD --> git.isInsideGitRepo()
          |
          |--> false: stderr "Not a git repository", exit(1)
          |
          |--> true: git.getRepoRoot()
                       |
                       v
                git.collectRepoMetadata(repoRoot)
                  |  git remote -v
                  |  git branch --list
                  |  git branch -r
                  |  git rev-parse --abbrev-ref HEAD
                  |
                  v
                RegistryEntry object
                       |
                       v
                registry.loadRegistry()
                       |
                       v
                registry.addOrUpdate(registry, entry)
                       |
                       v
                registry.saveRegistry(registry)  [atomic write]
                       |
                       v
                Print confirmation to stdout
```

### 1.3 Data Flow: `gitter go <query>`

```
query --> registry.loadRegistry()
            |
            v
          registry.searchEntries(registry, query)
            |
            |--> 0 matches: stderr "No match", exit(1)
            |
            |--> 1 match: stdout <- entry.localPath
            |
            |--> N matches: inquirer.select() via stderr
                               |
                               v
                             stdout <- selected.localPath
                               |
                               v
                         Shell function captures stdout
                               |
                               v
                         cd "$target"
```

**Critical**: `gitter go` writes ONLY the path to stdout. All prompts, messages, and errors go to stderr. This separation enables the shell function to work correctly.

---

## 2. Data Models

### 2.1 Type Definitions (`src/types.ts`)

```typescript
/**
 * Represents a single git remote with its fetch and push URLs.
 * A remote may have different fetch and push URLs (e.g., when using
 * different protocols for read vs write).
 */
export interface Remote {
  /** Remote name (e.g., "origin", "upstream") */
  name: string;
  /** URL used for fetching (from `git remote -v` fetch line) */
  fetchUrl: string;
  /** URL used for pushing (from `git remote -v` push line) */
  pushUrl: string;
}

/**
 * Represents a single git repository registered in the gitter registry.
 * The localPath serves as the unique identifier (primary key).
 */
export interface RegistryEntry {
  /** Directory name of the repository root */
  repoName: string;
  /** Absolute filesystem path to the repository root */
  localPath: string;
  /** All configured remotes with their URLs */
  remotes: Remote[];
  /** Remote-tracking branches (e.g., ["origin/main", "origin/develop"]) */
  remoteBranches: string[];
  /** Local branch names (e.g., ["main", "develop", "feature/xyz"]) */
  localBranches: string[];
  /** Currently checked-out branch, or "HEAD" if detached */
  currentBranch: string;
  /** ISO 8601 timestamp of last scan (e.g., "2026-03-22T14:30:00.000Z") */
  lastUpdated: string;
}

/**
 * Top-level registry structure stored in ~/.gitter/registry.json.
 * The version field supports future schema migrations.
 */
export interface Registry {
  /** Schema version number. Current version: 1 */
  version: number;
  /** All registered repositories */
  repositories: RegistryEntry[];
}
```

### 2.2 Registry JSON Example

```json
{
  "version": 1,
  "repositories": [
    {
      "repoName": "gitter",
      "localPath": "/Users/giorgosmarinos/aiwork/coding-platform/macbook-desktop/gitter",
      "remotes": [
        {
          "name": "origin",
          "fetchUrl": "git@github.com:user/gitter.git",
          "pushUrl": "git@github.com:user/gitter.git"
        }
      ],
      "remoteBranches": ["origin/main", "origin/develop"],
      "localBranches": ["main", "develop"],
      "currentBranch": "main",
      "lastUpdated": "2026-03-22T14:30:00.000Z"
    }
  ]
}
```

### 2.3 Registry File Location

| Item | Path |
|------|------|
| Registry directory | `~/.gitter/` |
| Registry file | `~/.gitter/registry.json` |
| Temp file pattern | `~/.gitter/.tmp-<random-hex>` |

The `~` is resolved from `process.env.HOME`. If `HOME` is not set, the tool throws an error immediately -- no fallback to `os.homedir()` or any default value.

---

## 3. Module Design

### 3.1 `src/types.ts`

Contains all TypeScript interfaces as defined in Section 2.1. No logic, no imports. Pure type declarations exported for use by all other modules.

**Exports**: `Remote`, `RegistryEntry`, `Registry`

---

### 3.2 `src/git.ts` -- Git Command Utilities

This module wraps all git CLI interactions. It uses `execFileSync` (not `execSync`) to avoid shell injection vulnerabilities.

```typescript
import { execFileSync } from 'child_process';
import { basename } from 'path';
import type { Remote, RegistryEntry } from './types.js';

/**
 * Execute a git command and return trimmed stdout.
 * Throws on non-zero exit code.
 *
 * @param args - Git command arguments (e.g., ['rev-parse', '--show-toplevel'])
 * @param cwd  - Working directory for the command (defaults to process.cwd())
 * @returns Trimmed stdout string
 * @throws Error if git command fails (non-zero exit, timeout, git not found)
 */
export function git(args: string[], cwd?: string): string;

/**
 * Check if the given directory is inside a git work tree.
 *
 * @param cwd - Directory to check (defaults to process.cwd())
 * @returns true if inside a git repo, false otherwise
 */
export function isInsideGitRepo(cwd?: string): boolean;

/**
 * Get the absolute path to the repository root.
 *
 * @param cwd - Directory within the repo (defaults to process.cwd())
 * @returns Absolute path to repo root
 * @throws Error if not inside a git repository
 */
export function getRepoRoot(cwd?: string): string;

/**
 * Parse `git remote -v` output into an array of Remote objects.
 * Groups fetch and push URLs by remote name.
 *
 * @param cwd - Repository directory
 * @returns Array of Remote objects (may be empty if no remotes configured)
 */
export function getRemotes(cwd?: string): Remote[];

/**
 * Get all local branch names from `git branch --list`.
 * Strips the leading "* " or "  " prefix from each line.
 *
 * @param cwd - Repository directory
 * @returns Array of local branch name strings
 */
export function getLocalBranches(cwd?: string): string[];

/**
 * Get all remote-tracking branch names from `git branch -r`.
 * Filters out "-> " alias lines (e.g., "origin/HEAD -> origin/main").
 *
 * @param cwd - Repository directory
 * @returns Array of remote branch strings (e.g., ["origin/main", "origin/develop"])
 */
export function getRemoteBranches(cwd?: string): string[];

/**
 * Get the currently checked-out branch name.
 * Returns "HEAD" if in detached HEAD state.
 *
 * @param cwd - Repository directory
 * @returns Branch name string or "HEAD"
 */
export function getCurrentBranch(cwd?: string): string;

/**
 * Collect all repository metadata into a RegistryEntry.
 * Orchestrates all git commands and assembles the result.
 *
 * @param cwd - Directory within the repo (defaults to process.cwd())
 * @returns Complete RegistryEntry with all metadata and current ISO timestamp
 * @throws Error if not inside a git repository
 */
export function collectRepoMetadata(cwd?: string): RegistryEntry;
```

#### Implementation Notes for `git()`

```typescript
export function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf-8',
    timeout: 10_000,       // 10 second timeout
    stdio: ['pipe', 'pipe', 'pipe'],  // capture stderr too
  }).trim();
}
```

#### Implementation Notes for `getRemotes()`

The `git remote -v` output format is:
```
origin  git@github.com:user/repo.git (fetch)
origin  git@github.com:user/repo.git (push)
upstream  https://github.com/other/repo.git (fetch)
upstream  https://github.com/other/repo.git (push)
```

Parsing algorithm:
1. Split output by newlines, filter empty lines
2. For each line: split by whitespace -> `[name, url, type]`
3. `type` is `"(fetch)"` or `"(push)"`
4. Group by remote name using a `Map<string, Partial<Remote>>`
5. Convert map to `Remote[]` array

#### Implementation Notes for `getLocalBranches()`

The `git branch --list` output format is:
```
* main
  develop
  feature/xyz
```

Parsing: split by newlines, trim, strip leading `* ` or `  `, filter empty strings.

#### Implementation Notes for `getRemoteBranches()`

The `git branch -r` output format is:
```
  origin/HEAD -> origin/main
  origin/main
  origin/develop
```

Parsing: split by newlines, trim, filter lines containing ` -> `, filter empty strings.

#### Implementation Notes for `getCurrentBranch()`

```typescript
export function getCurrentBranch(cwd?: string): string {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return branch;  // Returns "HEAD" when detached
}
```

#### Implementation Notes for `collectRepoMetadata()`

```typescript
export function collectRepoMetadata(cwd?: string): RegistryEntry {
  const repoRoot = getRepoRoot(cwd);
  return {
    repoName: basename(repoRoot),
    localPath: repoRoot,
    remotes: getRemotes(repoRoot),
    remoteBranches: getRemoteBranches(repoRoot),
    localBranches: getLocalBranches(repoRoot),
    currentBranch: getCurrentBranch(repoRoot),
    lastUpdated: new Date().toISOString(),
  };
}
```

---

### 3.3 `src/registry.ts` -- Registry File I/O and CRUD

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import type { Registry, RegistryEntry } from './types.js';

/** Current registry schema version */
const REGISTRY_VERSION = 1;

/**
 * Get the registry directory path (~/.gitter/).
 * Throws if HOME environment variable is not set.
 *
 * @returns Absolute path to ~/.gitter/
 * @throws Error with clear message if HOME is not set
 */
export function getRegistryDir(): string;

/**
 * Get the registry file path (~/.gitter/registry.json).
 *
 * @returns Absolute path to registry file
 * @throws Error if HOME is not set (via getRegistryDir)
 */
export function getRegistryPath(): string;

/**
 * Ensure the registry directory and file exist.
 * Creates ~/.gitter/ directory if missing.
 * Creates registry.json with empty registry if missing.
 * Does NOT overwrite an existing registry file.
 */
export function ensureRegistryExists(): void;

/**
 * Load and parse the registry from disk.
 * Calls ensureRegistryExists() first.
 * Validates that the parsed JSON conforms to the Registry interface.
 *
 * @returns Parsed Registry object
 * @throws Error if JSON is malformed or schema is invalid
 */
export function loadRegistry(): Registry;

/**
 * Save the registry to disk using atomic write.
 * Writes to a temp file in the same directory, then renames.
 * JSON is formatted with 2-space indentation for readability.
 *
 * @param registry - The Registry object to persist
 */
export function saveRegistry(registry: Registry): void;

/**
 * Find a registry entry by its absolute local path.
 *
 * @param registry - The Registry to search
 * @param localPath - Absolute path to match
 * @returns The matching RegistryEntry or undefined
 */
export function findByPath(registry: Registry, localPath: string): RegistryEntry | undefined;

/**
 * Add a new entry or update an existing one.
 * Uses localPath as the unique key.
 * If an entry with the same localPath exists, it is replaced entirely.
 * If no entry exists, the new entry is appended.
 * Returns the modified registry (mutates in place).
 *
 * @param registry - The Registry to modify
 * @param entry - The RegistryEntry to add or update
 * @returns The modified Registry
 */
export function addOrUpdate(registry: Registry, entry: RegistryEntry): Registry;

/**
 * Remove an entry by its absolute local path.
 * Returns the modified registry (mutates in place).
 * If no entry matches, the registry is unchanged.
 *
 * @param registry - The Registry to modify
 * @param localPath - Absolute path of the entry to remove
 * @returns The modified Registry
 */
export function removeByPath(registry: Registry, localPath: string): Registry;

/**
 * Search registry entries by a query string.
 * Performs case-insensitive partial matching against:
 *   - repoName
 *   - localPath
 *   - All remote fetchUrl and pushUrl values
 *
 * @param registry - The Registry to search
 * @param query - The search string
 * @returns Array of matching RegistryEntry objects (may be empty)
 */
export function searchEntries(registry: Registry, query: string): RegistryEntry[];
```

#### Implementation Notes for `getRegistryDir()`

```typescript
export function getRegistryDir(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error(
      'HOME environment variable is not set. Cannot determine registry location. ' +
      'Please set the HOME environment variable and try again.'
    );
  }
  return join(home, '.gitter');
}
```

**No fallback**: Per project rules, there must be no fallback to `os.homedir()`, `process.env.USERPROFILE`, or any default value.

#### Implementation Notes for Atomic Write

```typescript
export function saveRegistry(registry: Registry): void {
  const filePath = getRegistryPath();
  const data = JSON.stringify(registry, null, 2) + '\n';
  const dir = dirname(filePath);
  const tmpFile = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);

  writeFileSync(tmpFile, data, 'utf-8');
  renameSync(tmpFile, filePath);  // atomic on POSIX
}
```

#### Implementation Notes for `ensureRegistryExists()`

```typescript
export function ensureRegistryExists(): void {
  const dir = getRegistryDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = getRegistryPath();
  if (!existsSync(filePath)) {
    const empty: Registry = { version: REGISTRY_VERSION, repositories: [] };
    saveRegistry(empty);
  }
}
```

#### Implementation Notes for `searchEntries()`

```typescript
export function searchEntries(registry: Registry, query: string): RegistryEntry[] {
  const q = query.toLowerCase();
  return registry.repositories.filter(entry => {
    // Match against repo name
    if (entry.repoName.toLowerCase().includes(q)) return true;
    // Match against local path
    if (entry.localPath.toLowerCase().includes(q)) return true;
    // Match against all remote URLs
    for (const remote of entry.remotes) {
      if (remote.fetchUrl.toLowerCase().includes(q)) return true;
      if (remote.pushUrl.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}
```

---

### 3.4 Command Handlers (`src/commands/*.ts`)

Each command is a separate module exporting a single `async` handler function. The handler is registered with Commander in `src/cli.ts`.

#### 3.4.1 `src/commands/scan.ts`

```typescript
/**
 * Handler for `gitter scan` command.
 * Also invoked as the default action when no subcommand is given and CWD is a git repo.
 *
 * Behavior:
 * 1. Check if CWD is inside a git repo -> if not, stderr + exit(1)
 * 2. Collect metadata via collectRepoMetadata()
 * 3. Load registry, addOrUpdate, save registry
 * 4. Print confirmation to stdout: repo name, path, remote count, branch count
 *
 * Output (stdout): Confirmation message with scan results
 * Errors (stderr): "Not inside a git repository" + exit code 1
 */
export async function scanCommand(): Promise<void>;
```

#### 3.4.2 `src/commands/list.ts`

```typescript
/**
 * Handler for `gitter list` command.
 *
 * Behavior:
 * 1. Load registry
 * 2. If empty -> print "No repositories registered." and return
 * 3. Build cli-table3 table with columns:
 *    | Repo Name | Local Path | Remotes | Last Updated |
 * 4. For each entry, check existsSync(localPath):
 *    - If missing, prepend "[MISSING] " to repo name (in red)
 * 5. Print table to stdout
 *
 * Output (stdout): Formatted table of all registered repos
 */
export async function listCommand(): Promise<void>;
```

#### 3.4.3 `src/commands/search.ts`

```typescript
/**
 * Handler for `gitter search <query>` command.
 *
 * @param query - Search string (required positional argument)
 *
 * Behavior:
 * 1. Load registry
 * 2. Call searchEntries(registry, query)
 * 3. If no matches -> print "No repositories match query: <query>" to stdout
 * 4. If matches -> display in same table format as list
 *
 * Output (stdout): Filtered table or "no matches" message
 */
export async function searchCommand(query: string): Promise<void>;
```

#### 3.4.4 `src/commands/go.ts`

```typescript
/**
 * Handler for `gitter go <query>` command.
 * CRITICAL: This command must maintain strict stdout/stderr discipline.
 *
 * @param query - Search string (required positional argument)
 *
 * Behavior:
 * 1. Load registry
 * 2. Call searchEntries(registry, query)
 * 3. If 0 matches:
 *    - stderr: "No repositories match query: <query>"
 *    - exit(1)
 * 4. If 1 match:
 *    - Verify existsSync(match.localPath)
 *    - If path missing: stderr error + exit(1)
 *    - stdout: match.localPath (ONLY this, nothing else)
 * 5. If N matches:
 *    - Use @inquirer/prompts select() -- prompts render to stderr
 *    - Verify existsSync(selected.localPath)
 *    - If path missing: stderr error + exit(1)
 *    - stdout: selected.localPath (ONLY this, nothing else)
 *
 * Output (stdout): ONLY the absolute path, one line, no trailing content
 * Output (stderr): Interactive prompts, error messages, informational text
 */
export async function goCommand(query: string): Promise<void>;
```

**Inquirer stderr redirection**: `@inquirer/prompts` by default renders to stdout. For the `go` command, the `select` prompt must use `output: process.stderr` in its configuration so that the interactive UI does not pollute the path output on stdout.

```typescript
import { select } from '@inquirer/prompts';
import { createWriteStream } from 'fs';

const selectedPath = await select({
  message: 'Multiple repositories matched. Select one:',
  choices: matches.map(entry => ({
    name: `${entry.repoName} (${entry.localPath})`,
    value: entry.localPath,
    description: `Last updated: ${entry.lastUpdated}`,
  })),
}, {
  output: process.stderr,  // CRITICAL: render prompts to stderr
});

// Only the path goes to stdout
process.stdout.write(selectedPath + '\n');
```

#### 3.4.5 `src/commands/info.ts`

```typescript
/**
 * Handler for `gitter info <query>` command.
 *
 * @param query - Search string (required positional argument)
 *
 * Behavior:
 * 1. Load registry, search for matches
 * 2. If 0 matches -> print "No repositories match" + exit(1)
 * 3. If N matches -> interactive select (prompts to stderr)
 * 4. Display full metadata for the selected entry:
 *    - Repository Name
 *    - Local Path (with [MISSING] warning if path doesn't exist)
 *    - Remotes (name, fetch URL, push URL for each)
 *    - Local Branches (with * marking current branch)
 *    - Remote Branches
 *    - Current Branch
 *    - Last Updated
 * 5. Use picocolors for section headers (bold) and values
 *
 * Output (stdout): Formatted detailed repository information
 */
export async function infoCommand(query: string): Promise<void>;
```

#### 3.4.6 `src/commands/remove.ts`

```typescript
/**
 * Handler for `gitter remove <query>` command.
 *
 * @param query - Search string (required positional argument)
 *
 * Behavior:
 * 1. Load registry, search for matches
 * 2. If 0 matches -> print "No repositories match" + exit(1)
 * 3. If N matches -> interactive select to choose which to remove
 * 4. Confirm removal with user (y/n via @inquirer/prompts confirm)
 * 5. If confirmed: removeByPath(), saveRegistry(), print confirmation
 * 6. If cancelled: print "Removal cancelled"
 *
 * Output (stdout): Confirmation or cancellation message
 */
export async function removeCommand(query: string): Promise<void>;
```

#### 3.4.7 `src/commands/init.ts`

```typescript
/**
 * Handler for `gitter init` command.
 *
 * Behavior:
 * 1. Print the shell function wrapper to stdout
 * 2. Print installation instructions to stderr
 *
 * The shell function is printed to stdout so users can do:
 *   gitter init >> ~/.zshrc
 * or
 *   eval "$(gitter init)"
 *
 * Output (stdout): The shell function code
 * Output (stderr): Installation instructions
 */
export async function initCommand(): Promise<void>;
```

---

### 3.5 `src/cli.ts` -- Commander Program Setup

```typescript
#!/usr/bin/env node

import { program } from 'commander';
import { scanCommand } from './commands/scan.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { goCommand } from './commands/go.js';
import { infoCommand } from './commands/info.js';
import { removeCommand } from './commands/remove.js';
import { initCommand } from './commands/init.js';
import { isInsideGitRepo } from './git.js';

program
  .name('gitter')
  .version('1.0.0')
  .description('Git repository registry - track, search, and navigate your local repos');

program
  .command('scan')
  .description('Scan current directory and register/update the git repository')
  .action(scanCommand);

program
  .command('list')
  .description('List all registered repositories')
  .action(listCommand);

program
  .command('search <query>')
  .description('Search repositories by name, path, or remote URL')
  .action(searchCommand);

program
  .command('go <query>')
  .description('Navigate to a matching repository (use with shell function)')
  .action(goCommand);

program
  .command('info <query>')
  .description('Show detailed information about a repository')
  .action(infoCommand);

program
  .command('remove <query>')
  .description('Remove a repository from the registry')
  .action(removeCommand);

program
  .command('init')
  .description('Print shell function for directory navigation integration')
  .action(initCommand);

// Default action: no subcommand provided
program.action(() => {
  if (isInsideGitRepo()) {
    scanCommand();
  } else {
    program.help();
  }
});

program.parse();
```

---

## 4. File Structure

```
gitter/
|-- package.json
|-- tsconfig.json
|-- src/
|   |-- cli.ts                  # Entry point with Commander setup + default action
|   |-- types.ts                # All TypeScript interfaces (Remote, RegistryEntry, Registry)
|   |-- git.ts                  # Git command wrappers and metadata collection
|   |-- registry.ts             # Registry JSON file I/O, CRUD, search
|   |-- commands/
|       |-- scan.ts             # gitter scan
|       |-- list.ts             # gitter list
|       |-- search.ts           # gitter search <query>
|       |-- go.ts               # gitter go <query>
|       |-- info.ts             # gitter info <query>
|       |-- remove.ts           # gitter remove <query>
|       |-- init.ts             # gitter init (print shell function)
|-- dist/                       # Compiled JS output (generated, not committed)
|-- node_modules/               # Dependencies (generated, not committed)
|-- test_scripts/               # Test scripts
|-- docs/
|   |-- design/
|   |   |-- project-design.md          # This document
|   |   |-- plan-001-gitter-cli-tool.md
|   |   |-- configuration-guide.md     # (future)
|   |   |-- project-functions.md       # Functional requirements
|   |-- reference/
|       |-- refined-request-gitter-repo-registry.md
|       |-- investigation-gitter-cli-tool.md
|-- Issues - Pending Items.md
```

Runtime artifacts (not part of project tree):
```
~/.gitter/
|-- registry.json               # The persistent registry
```

---

## 5. Error Handling Strategy

### 5.1 Principles

1. **No fallback values**: Per project rules, missing configuration (HOME, etc.) always throws an exception. Never substitute with defaults.
2. **Clear error messages**: Every thrown error must include what went wrong and what the user can do to fix it.
3. **stderr for errors**: All error messages go to `process.stderr`.
4. **Exit codes**: `0` for success, `1` for all errors.

### 5.2 Error Scenarios

| Scenario | Behavior | Exit Code |
|----------|----------|:---------:|
| HOME not set | Throw: `"HOME environment variable is not set..."` | 1 |
| Not inside a git repo (for scan) | stderr: `"Not inside a git repository"` | 1 |
| Git not installed / not in PATH | Throw from `execFileSync` with `ENOENT` -> stderr: `"git command not found..."` | 1 |
| Git command fails (non-zero exit) | stderr: `"Git command failed: <command> <stderr output>"` | 1 |
| Git command timeout (>10s) | stderr: `"Git command timed out"` | 1 |
| Registry JSON malformed | Throw: `"Registry file is corrupted..."` | 1 |
| No search matches (go, info) | stderr: `"No repositories match query: <query>"` | 1 |
| No search matches (search) | stdout: `"No repositories match query: <query>"` | 0 |
| Selected path does not exist (go) | stderr: `"Repository path no longer exists: <path>"` | 1 |
| Registry file missing | Auto-create empty registry (not an error) | N/A |
| Registry directory missing | Auto-create `~/.gitter/` directory (not an error) | N/A |
| User cancels interactive prompt | stderr: `"Operation cancelled"` | 1 |
| Atomic write fails (disk full, permissions) | Throw from `writeFileSync` / `renameSync` | 1 |

### 5.3 Error Wrapping in `git()`

```typescript
export function git(args: string[], cwd?: string): string {
  try {
    return execFileSync('git', args, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: unknown) {
    const err = error as { code?: string; stderr?: string; status?: number };
    if (err.code === 'ENOENT') {
      throw new Error(
        'git command not found. Please install git and ensure it is in your PATH.'
      );
    }
    if (err.code === 'ETIMEDOUT') {
      throw new Error(
        `Git command timed out: git ${args.join(' ')}`
      );
    }
    throw new Error(
      `Git command failed: git ${args.join(' ')}\n${err.stderr ?? 'Unknown error'}`
    );
  }
}
```

### 5.4 Top-Level Error Handler in `src/cli.ts`

Each command handler should catch errors and format them for the user. Unhandled exceptions are caught at the top level:

```typescript
process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
```

---

## 6. Shell Function Integration Design

### 6.1 The Shell Function

Output by `gitter init` to stdout:

```bash
# Gitter shell integration
# Add this to your ~/.zshrc or ~/.bashrc, or run: eval "$(gitter init)"
gitter() {
  if [ "$1" = "go" ]; then
    shift
    local target
    target=$(command gitter go "$@" 2>/dev/null)
    local exit_code=$?
    if [ $exit_code -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then
      cd "$target" || return 1
      echo "Changed directory to: $target" >&2
    else
      # Re-run to show interactive prompts and errors (not silenced)
      target=$(command gitter go "$@")
      exit_code=$?
      if [ $exit_code -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then
        cd "$target" || return 1
        echo "Changed directory to: $target" >&2
      else
        return $exit_code
      fi
    fi
  else
    command gitter "$@"
  fi
}
```

**Note on the two-pass approach**: The first attempt silences stderr (`2>/dev/null`) to check if there is exactly one match (non-interactive case). If it fails (because interactive selection is needed, or there was an error), the second attempt allows stderr through so the user sees prompts and error messages. This avoids suppressing interactive prompts.

**Alternative simpler shell function** (recommended for v1):

```bash
# Gitter shell integration
# Add this to your ~/.zshrc or ~/.bashrc, or run: eval "$(gitter init)"
gitter() {
  if [ "$1" = "go" ]; then
    shift
    local target
    target=$(command gitter go "$@")
    local exit_code=$?
    if [ $exit_code -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then
      cd "$target" || return 1
    else
      return $exit_code
    fi
  else
    command gitter "$@"
  fi
}
```

This simpler version works because `@inquirer/prompts` is configured to render to stderr (via `output: process.stderr`), so interactive prompts are visible even when stdout is captured by the `$(...)` subshell.

### 6.2 stdout vs stderr Discipline

The entire shell integration depends on strict output separation in the `go` command:

| Output Channel | Content |
|----------------|---------|
| **stdout** | ONLY the absolute path to the selected repository (one line, no decoration) |
| **stderr** | Interactive prompts (inquirer select), error messages, informational messages |

This is enforced by:
1. Using `process.stdout.write(path + '\n')` for the path
2. Using `console.error()` or `process.stderr.write()` for everything else
3. Configuring `@inquirer/prompts` with `output: process.stderr`

### 6.3 Installation Instructions

Output by `gitter init` to stderr:

```
# To enable the gitter shell function, add the following to your shell config:
#
#   For zsh:  echo 'eval "$(command gitter init)"' >> ~/.zshrc
#   For bash: echo 'eval "$(command gitter init)"' >> ~/.bashrc
#
# Then restart your shell or run:
#   source ~/.zshrc   (or source ~/.bashrc)
#
# After installation, use `gitter go <name>` to navigate to repositories.
```

---

## 7. Key Algorithms

### 7.1 Registry Search (Case-Insensitive Partial Match)

```
FUNCTION searchEntries(registry, query):
    q = query.toLowerCase()
    results = []

    FOR EACH entry IN registry.repositories:
        matched = FALSE

        // Check repo name
        IF entry.repoName.toLowerCase().includes(q):
            matched = TRUE

        // Check local path
        ELSE IF entry.localPath.toLowerCase().includes(q):
            matched = TRUE

        // Check all remote URLs
        ELSE:
            FOR EACH remote IN entry.remotes:
                IF remote.fetchUrl.toLowerCase().includes(q):
                    matched = TRUE; BREAK
                IF remote.pushUrl.toLowerCase().includes(q):
                    matched = TRUE; BREAK

        IF matched:
            results.push(entry)

    RETURN results
```

**Complexity**: O(N * M) where N = number of registry entries, M = average number of remotes per entry. For expected registry sizes (<1000 entries), this is negligible.

### 7.2 Atomic Write (Write-Temp-Then-Rename)

```
FUNCTION atomicWrite(filePath, data):
    dir = dirname(filePath)
    tmpFile = join(dir, ".tmp-" + randomHex(6))

    TRY:
        writeFileSync(tmpFile, data, 'utf-8')
        renameSync(tmpFile, filePath)     // atomic on POSIX filesystems
    CATCH error:
        // Attempt cleanup of temp file
        TRY: unlinkSync(tmpFile)
        CATCH: // ignore cleanup failure
        THROW error
```

**Why this works**: On POSIX systems (macOS, Linux), `rename()` is an atomic operation. The file at `filePath` is either the old version or the new version -- never a partial write. If the process crashes after `writeFileSync` but before `renameSync`, the temp file is left behind (harmless, cleaned up on next write via the random name).

### 7.3 Git Remote Parsing

```
FUNCTION parseRemotes(gitRemoteOutput):
    IF output is empty:
        RETURN []

    remoteMap = new Map<string, {name, fetchUrl?, pushUrl?}>()
    lines = output.split('\n').filter(non-empty)

    FOR EACH line IN lines:
        // Line format: "origin\tgit@github.com:user/repo.git (fetch)"
        parts = line.split(/\s+/)
        name = parts[0]
        url  = parts[1]
        type = parts[2]    // "(fetch)" or "(push)"

        IF NOT remoteMap.has(name):
            remoteMap.set(name, { name, fetchUrl: '', pushUrl: '' })

        entry = remoteMap.get(name)
        IF type == "(fetch)":
            entry.fetchUrl = url
        ELSE IF type == "(push)":
            entry.pushUrl = url

    RETURN Array.from(remoteMap.values()) as Remote[]
```

### 7.4 Default Action Logic

```
FUNCTION defaultAction():
    IF isInsideGitRepo():
        scanCommand()        // Auto-scan current repo
    ELSE:
        program.help()       // Show help text
```

This makes `gitter` (with no arguments) context-aware: inside a git repo it performs a scan; outside, it shows usage help.

### 7.5 Stale Entry Detection

Used in `list` and `go` commands:

```
FUNCTION isEntryStale(entry):
    RETURN NOT existsSync(entry.localPath)
```

In `list`: stale entries are shown with `[MISSING]` prefix in red.
In `go`: if the selected entry is stale, print error to stderr and exit(1).

---

## 8. Implementation Units for Parallel Coding

The codebase is designed so that multiple agents can work on different units simultaneously after Phase 1 (scaffolding) is complete. Below are the independent units and their interface contracts.

### 8.1 Unit Map

```
+-----------+     +-----------+     +------------------+
| Unit A    |     | Unit B    |     | Unit C           |
| types.ts  |<----| git.ts    |     | registry.ts      |
|           |<----|           |     |                  |
|           |<----|-----------|-----|                  |
+-----------+     +-----------+     +------------------+
      ^                ^                    ^
      |                |                    |
      +--------+-------+----+---------+-----+
               |            |         |
          +----+----+  +----+----+  +-+--------+
          | Unit D  |  | Unit E  |  | Unit F   |
          | scan.ts |  | go.ts   |  | list.ts  |
          | (+ info)|  | init.ts |  | search.ts|
          |         |  |         |  | remove.ts|
          +---------+  +---------+  +----------+
```

### 8.2 Unit Definitions

#### Unit A: Type Definitions (`src/types.ts`)

- **Scope**: `Remote`, `RegistryEntry`, `Registry` interfaces
- **Dependencies**: None
- **Must complete first**: All other units import from this
- **Effort**: Minimal (copy from Section 2.1)
- **Agent instructions**: Create exactly the interfaces specified in Section 2.1. No logic, no imports other than type exports.

#### Unit B: Git Module (`src/git.ts`)

- **Scope**: All git command wrappers and `collectRepoMetadata()`
- **Dependencies**: Unit A (`types.ts` for `Remote`, `RegistryEntry`)
- **Independent of**: Unit C (registry module)
- **Interface contract**: Must export all functions with signatures from Section 3.2
- **Testing**: Can be tested independently by running inside any git repository
- **Agent instructions**: Implement all functions from Section 3.2. Use `execFileSync` from `child_process`. Follow error handling from Section 5.3. Parse git output per Section 7.3.

#### Unit C: Registry Module (`src/registry.ts`)

- **Scope**: All registry file I/O and CRUD operations
- **Dependencies**: Unit A (`types.ts` for `Registry`, `RegistryEntry`)
- **Independent of**: Unit B (git module)
- **Interface contract**: Must export all functions with signatures from Section 3.3
- **Testing**: Can be tested independently with mock RegistryEntry data (no git repo needed)
- **Agent instructions**: Implement all functions from Section 3.3. Use atomic writes per Section 7.2. Search algorithm per Section 7.1. Throw on missing HOME per Section 5.2.

#### Unit D: Scan + Info Commands (`src/commands/scan.ts`, `src/commands/info.ts`)

- **Scope**: The `scan` and `info` command handlers
- **Dependencies**: Units A, B, C
- **Independent of**: Units E, F
- **Interface contract**: Export `scanCommand()` and `infoCommand(query)` as async functions
- **Agent instructions**: Implement per Section 3.4.1 and 3.4.5. Use `picocolors` for colored output. Use `cli-table3` for info display if desired.

#### Unit E: Go + Init Commands (`src/commands/go.ts`, `src/commands/init.ts`)

- **Scope**: The `go` command handler and `init` shell function printer
- **Dependencies**: Units A, C (go needs registry search); no git dependency
- **Independent of**: Units D, F
- **Interface contract**: Export `goCommand(query)` and `initCommand()` as async functions
- **Critical requirement**: stdout/stderr discipline as specified in Section 3.4.4 and Section 6
- **Agent instructions**: Implement per Section 3.4.4 and 3.4.7. Configure `@inquirer/prompts` with `output: process.stderr`. Shell function per Section 6.1 (simpler version). Test that `gitter go <name> 2>/dev/null` outputs ONLY the path.

#### Unit F: List + Search + Remove Commands (`src/commands/list.ts`, `src/commands/search.ts`, `src/commands/remove.ts`)

- **Scope**: The `list`, `search`, and `remove` command handlers
- **Dependencies**: Units A, C (registry operations only; no git dependency)
- **Independent of**: Units D, E
- **Interface contract**: Export `listCommand()`, `searchCommand(query)`, `removeCommand(query)` as async functions
- **Agent instructions**: Implement per Sections 3.4.2, 3.4.3, 3.4.6. Use `cli-table3` for table output. Use `picocolors` for coloring. Stale detection per Section 7.5. Use `@inquirer/prompts` for interactive selection in remove.

#### Unit G: CLI Entry Point (`src/cli.ts`)

- **Scope**: Commander program setup, wiring all commands, default action
- **Dependencies**: All command units (D, E, F) and Unit B (for `isInsideGitRepo`)
- **Must be done last** (or started with stubs and finalized after all commands are ready)
- **Agent instructions**: Implement per Section 3.5. Register all commands with Commander. Implement default action per Section 7.4. Add uncaught exception handler per Section 5.4.

### 8.3 Parallel Execution Plan

```
Phase 1: Project Scaffolding (single agent)
    |
    v
Unit A: types.ts (single agent, fast)
    |
    +---> Unit B: git.ts        (Agent 1) ---|
    |                                        |
    +---> Unit C: registry.ts   (Agent 2) ---|
                                             |
              +------------------------------+
              |
    +--> Unit D: scan + info    (Agent 1) ---|
    |                                        |
    +--> Unit E: go + init      (Agent 2) ---|
    |                                        |
    +--> Unit F: list+search+rm (Agent 3) ---|
                                             |
              +------------------------------+
              |
              v
    Unit G: cli.ts (single agent, wiring)
              |
              v
    Phase 4: Build + Link + Test
```

**Maximum parallelism**: 3 agents (during command implementation phase)
**Minimum agents needed**: 1 (sequential execution through all units)

### 8.4 Interface Contracts Between Units

| Producer | Consumer | Contract |
|----------|----------|----------|
| `types.ts` | All modules | Export `Remote`, `RegistryEntry`, `Registry` interfaces exactly as specified |
| `git.ts` | `scan.ts` | `isInsideGitRepo(cwd?): boolean` and `collectRepoMetadata(cwd?): RegistryEntry` |
| `git.ts` | `cli.ts` | `isInsideGitRepo(cwd?): boolean` (for default action) |
| `registry.ts` | All commands | `loadRegistry(): Registry` and `saveRegistry(registry): void` |
| `registry.ts` | `scan.ts` | `addOrUpdate(registry, entry): Registry` |
| `registry.ts` | `go.ts`, `search.ts`, `info.ts`, `remove.ts` | `searchEntries(registry, query): RegistryEntry[]` |
| `registry.ts` | `remove.ts` | `removeByPath(registry, path): Registry` |
| Each command | `cli.ts` | Export a single async function matching the handler signature |

---

## 9. Technology Stack Summary

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | Latest LTS |
| Module System | ESM (`"type": "module"`) | -- |
| CLI Framework | commander.js | 14.x |
| Interactive Prompts | @inquirer/prompts | 8.x |
| Terminal Colors | picocolors | 1.x |
| Table Output | cli-table3 | 0.6.x |
| Git Interaction | child_process (built-in) | -- |
| File I/O | fs (built-in) | -- |
| Dev Runner | tsx | 4.x |
| Compiler | tsc (TypeScript) | 5.x |

**Production dependencies**: 4
**Dev dependencies**: 3

---

## 10. AI-Powered Repository Description Feature

### 10.1 Feature Overview

The `gitter describe` command uses the Anthropic Claude SDK to analyze a registered git repository's contents and generate structured descriptions. Each description consists of two sections -- a business description (for stakeholders) and a technical description (for developers). Descriptions are stored persistently in the registry and can be displayed on demand or as part of `gitter info`.

The feature supports three Claude API providers: Anthropic (direct), Azure AI Foundry, and Google Vertex AI. Configuration follows a priority-based resolution system (environment variables > `.env` file > `~/.gitter/config.json`) with no fallback values permitted.

**Reference Documents**:
- Requirements: `docs/reference/refined-request-ai-repo-descriptions.md`
- Implementation Plan: `docs/design/plan-002-ai-descriptions.md`
- SDK Investigation: `docs/reference/investigation-ai-integration.md`

---

### 10.2 Updated Component Diagram

```
+------------------------------------------------------------------+
|                         USER SHELL (zsh/bash)                     |
|                                                                   |
|  gitter() {           <-- shell function (installed via init)     |
|    if "go" -> capture stdout -> cd "$target"                      |
|    else    -> passthrough to binary                               |
|  }                                                                |
+---------|--------------------------------------------------------+
          |
          v
+------------------------------------------------------------------+
|                      CLI ENTRY POINT (src/cli.ts)                 |
|                                                                   |
|  #!/usr/bin/env node                                              |
|  Commander program definition                                     |
|  Default action: is git repo? -> scan : show help                 |
|                                                                   |
|  Subcommands:                                                     |
|    scan | list | search | go | info | remove | init | describe    |
+---------|--------------------------------------------------------+
          |
          v
+------------------------------------------------------------------+
|                   COMMAND HANDLERS (src/commands/*.ts)             |
|                                                                   |
|  scan.ts -----> git.collectRepoMetadata() + registry.addOrUpdate()|
|  list.ts -----> registry.loadRegistry() + cli-table3 formatting   |
|  search.ts ---> registry.searchEntries() + cli-table3 formatting  |
|  go.ts -------> registry.searchEntries() + inquirer select        |
|  info.ts -----> registry.searchEntries() + detailed formatting    |
|  remove.ts ---> registry.removeByPath() + inquirer confirm        |
|  init.ts -----> prints shell function to stdout                   |
|  describe.ts -> ai-config + ai-client + repo-content + registry   |
+--------|-----------------------------|---------------------------+
         |                             |
         v                             v
+-------------------------+  +---------------------------+
|  GIT MODULE             |  |  REGISTRY MODULE          |
|  (src/git.ts)           |  |  (src/registry.ts)        |
|                         |  |                           |
|  git()                  |  |  getRegistryDir()         |
|  isInsideGitRepo()      |  |  getRegistryPath()        |
|  getRepoRoot()          |  |  ensureRegistryExists()   |
|  getRemotes()           |  |  loadRegistry()           |
|  getLocalBranches()     |  |  saveRegistry()           |
|  getRemoteBranches()    |  |  findByPath()             |
|  getCurrentBranch()     |  |  addOrUpdate()            |
|  collectRepoMetadata()  |  |  removeByPath()           |
|                         |  |  searchEntries()          |
+--------+----------------+  +------------+--------------+
         |                               |
         v                               v
+-------------------------+  +---------------------------+
|  child_process          |  |  fs (Node.js built-in)    |
|  (Node.js built-in)     |  |                           |
|  execFileSync('git'..)  |  |  readFileSync / writeFile |
+-------------------------+  |  renameSync (atomic)      |
                             |  mkdirSync / existsSync   |
                             +---------------------------+
                                         |
                                         v
                             +---------------------------+
                             |  ~/.gitter/registry.json  |
                             |  ~/.gitter/config.json    |
                             +---------------------------+

+------------------------------------------------------------------+
|                   AI MODULES (new for describe feature)           |
|                                                                   |
|  src/ai-config.ts -----> Config loading with priority resolution  |
|  src/ai-client.ts -----> Client factory + messages.create wrapper |
|  src/repo-content.ts --> Repo content collection and formatting   |
+--------|---------------------------------------------------------+
         |
         v
+------------------------------------------------------------------+
|  EXTERNAL SDK PACKAGES                                            |
|                                                                   |
|  @anthropic-ai/sdk -----------> Direct Anthropic API              |
|  @anthropic-ai/foundry-sdk ---> Azure AI Foundry (Claude on Azure)|
|  @anthropic-ai/vertex-sdk -----> Google Vertex AI                 |
+------------------------------------------------------------------+
```

---

### 10.3 Data Flow: `gitter describe myproject`

```
query --> registry.searchEntries()
            |
            |--> 0 matches: stderr "No match", exit(1)
            |--> 1 match: use that entry
            |--> N matches: inquirer.select() via stderr
            |
            v
          resolve to single RegistryEntry
            |
            v
          Validate: existsSync(entry.localPath)?
            |--> no: stderr "Repository path no longer exists", exit(1)
            |
            v
          repo-content.collectRepoContent(entry.localPath)
            |  git ls-tree -r --name-only HEAD (file tree)
            |  Read README.md (first 200 lines)
            |  Read package.json / Cargo.toml / etc. (full)
            |  Read CLAUDE.md, .cursor/rules (first 100 lines each)
            |  Read src/main.*, src/index.* etc. (first 100 lines each)
            |  Read .github/workflows/*.yml (first 50 lines each, max 3)
            |
            v
          repo-content.formatRepoContentForPrompt(content)
            |  Apply token budget (~30K tokens / ~120KB)
            |  Log content size to stderr
            |
            v
          ai-config.loadAIConfig()
            |  Priority: env vars > .env > config.json
            |  Validate required fields per provider
            |  Throw on missing values (no fallbacks)
            |
            v
          ai-client.createAIClient(config)
            |  Factory: Anthropic | AnthropicFoundry | AnthropicVertex
            |
            v
          Build system prompt (with line count targets)
            |
            v
          Build user message
            +--> include existing description if present
            +--> include user --instructions if provided
            +--> include formatted repo content
            |
            v
          ai-client.generateDescription(client, config, system, user)
            |  client.messages.create({ model, max_tokens, system, messages })
            |  Check stop_reason for truncation warning
            |
            v
          Parse response -> split on "## Technical Description"
            |  Extract businessDescription (strip heading)
            |  Extract technicalDescription (strip heading)
            |
            v
          Build RepoDescription object
            |  { businessDescription, technicalDescription,
            |    generatedAt: ISO timestamp, generatedBy: model name,
            |    instructions?: user instructions }
            |
            v
          Update registry entry directly (NOT via addOrUpdate)
            |  registry = loadRegistry()
            |  entry.description = description
            |  saveRegistry(registry)
            |
            v
          Display formatted description to terminal
```

---

### 10.4 New Type Definitions (additions to `src/types.ts`)

The following types are added to the existing `src/types.ts` module. The `RegistryEntry` interface is extended with an optional `description` field. The registry schema version remains `1` since the new field is optional and fully backward-compatible.

```typescript
/**
 * AI-generated description of a repository.
 * Stored as part of a RegistryEntry in the registry.
 */
export interface RepoDescription {
  /** Business-oriented description in markdown format */
  businessDescription: string;
  /** Technical description in markdown format */
  technicalDescription: string;
  /** ISO 8601 timestamp of when this description was generated */
  generatedAt: string;
  /** The AI model identifier used to generate this description */
  generatedBy: string;
  /** Custom user instructions that were used during generation (if any) */
  instructions?: string;
}

/**
 * Identifies which Claude API provider to use.
 * Each provider requires different configuration and uses a different SDK package.
 */
export type AIProvider = 'anthropic' | 'azure' | 'vertex';

/**
 * Configuration for the AI client.
 * Loaded from environment variables, .env file, or ~/.gitter/config.json
 * with priority resolution (env > .env > config file).
 */
export interface AIConfig {
  /** Which Claude provider to use */
  provider: AIProvider;
  /** Claude model identifier (format varies by provider) */
  model: string;
  /** Maximum tokens for the AI response */
  maxTokens: number;
  /** Anthropic direct API configuration */
  anthropic?: {
    apiKey: string;
  };
  /** Azure AI Foundry configuration */
  azure?: {
    apiKey: string;
    /** Azure resource hostname (e.g., "my-resource.azure.anthropic.com") */
    resource: string;
  };
  /** Google Vertex AI configuration */
  vertex?: {
    projectId: string;
    region: string;
  };
}
```

**Extension to existing `RegistryEntry`**:

```typescript
export interface RegistryEntry {
  // ... all existing fields unchanged ...

  /** AI-generated description of the repository (optional, populated by describe command) */
  description?: RepoDescription;
}
```

**Impact on Existing Code**:
- `loadRegistry()` and `saveRegistry()` require no changes -- they serialize/deserialize the full object graph via `JSON.parse`/`JSON.stringify`.
- `addOrUpdate()` replaces the full entry by `localPath`. Since `collectRepoMetadata()` does not produce a `description` field, re-scanning would lose the description. This is mitigated in `scan.ts` (see Section 10.10.3).
- No registry version bump is needed since the field is optional.

---

### 10.5 Module Design: `src/ai-config.ts`

**Purpose**: Load and validate AI configuration with three-tier priority resolution.

#### Configuration Priority (highest to lowest)

1. **Environment variables** -- shell-set vars take highest precedence
2. **`.env` file in `~/.gitter/`** -- loaded via `dotenv.config({ path })` which does NOT override existing env vars
3. **`~/.gitter/config.json`** -- JSON config file, lowest priority

#### Environment Variable Mapping

| Config Field | Environment Variable | Config JSON Path | Required When |
|-------------|---------------------|-----------------|---------------|
| `provider` | `GITTER_AI_PROVIDER` | `ai.provider` | Always |
| `model` | `GITTER_AI_MODEL` | `ai.model` | Always |
| `maxTokens` | `GITTER_AI_MAX_TOKENS` | `ai.maxTokens` | Always |
| `anthropic.apiKey` | `ANTHROPIC_API_KEY` | `ai.anthropic.apiKey` | provider = anthropic |
| `azure.apiKey` | `ANTHROPIC_FOUNDRY_API_KEY` | `ai.azure.apiKey` | provider = azure |
| `azure.resource` | `ANTHROPIC_FOUNDRY_RESOURCE` | `ai.azure.resource` | provider = azure |
| `vertex.projectId` | `ANTHROPIC_VERTEX_PROJECT_ID` | `ai.vertex.projectId` | provider = vertex |
| `vertex.region` | `CLOUD_ML_REGION` | `ai.vertex.region` | provider = vertex |

Note: The Azure and Vertex environment variable names are aligned with the SDK defaults so that users who already have these set for other tools get automatic interoperability.

#### Exported Function: `loadAIConfig(): AIConfig`

```typescript
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getRegistryDir } from './registry.js';
import type { AIConfig, AIProvider } from './types.js';

let configFileCache: Record<string, unknown> | null | undefined = undefined;

/**
 * Load .env file from ~/.gitter/ directory.
 * Called once; dotenv does NOT override existing env vars.
 */
function loadDotEnv(): void {
  const envPath = join(getRegistryDir(), '.env');
  dotenv.config({ path: envPath });
}

/**
 * Load and cache the config file from ~/.gitter/config.json.
 * Returns null if the file does not exist.
 * Throws if the file is malformed JSON.
 */
function loadConfigFile(): Record<string, unknown> | null {
  if (configFileCache !== undefined) return configFileCache;

  const configPath = join(getRegistryDir(), 'config.json');
  if (!existsSync(configPath)) {
    configFileCache = null;
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    configFileCache = JSON.parse(raw) as Record<string, unknown>;
    return configFileCache;
  } catch {
    throw new Error(`Config file is corrupted: ${configPath}`);
  }
}

/**
 * Resolve a configuration value from the priority chain.
 * Priority: env var (includes .env) > config.json
 */
function resolve(envVar: string, configPath: string[]): string | undefined {
  // Priority 1: Environment variable (already includes .env values via dotenv)
  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue !== '') return envValue;

  // Priority 2: Config file
  const config = loadConfigFile();
  if (config) {
    let value: unknown = config;
    for (const key of configPath) {
      value = (value as Record<string, unknown>)?.[key];
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }

  return undefined;
}

/**
 * Throw a standardized error for missing configuration.
 */
function throwMissing(envVar: string, configPath: string, description: string): never {
  throw new Error(
    `${envVar} is not set. Configure via:\n` +
    `  - Environment variable: export ${envVar}=<value>\n` +
    `  - Config file: set "${configPath}" in ~/.gitter/config.json\n` +
    `  - .env file: add ${envVar}=<value> to ~/.gitter/.env`
  );
}

/**
 * Load and validate AI configuration from environment variables,
 * .env file (in ~/.gitter/), and ~/.gitter/config.json.
 *
 * Throws on any missing required configuration. No fallback values.
 */
export function loadAIConfig(): AIConfig {
  loadDotEnv();

  const provider = resolve('GITTER_AI_PROVIDER', ['ai', 'provider']);
  if (!provider) {
    throwMissing('GITTER_AI_PROVIDER', 'ai.provider', 'AI provider');
  }

  const validProviders: AIProvider[] = ['anthropic', 'azure', 'vertex'];
  if (!validProviders.includes(provider as AIProvider)) {
    throw new Error(
      `Unknown AI provider: '${provider}'. Must be one of: anthropic, azure, vertex`
    );
  }

  const model = resolve('GITTER_AI_MODEL', ['ai', 'model']);
  if (!model) {
    throwMissing('GITTER_AI_MODEL', 'ai.model', 'AI model');
  }

  const maxTokensStr = resolve('GITTER_AI_MAX_TOKENS', ['ai', 'maxTokens']);
  if (!maxTokensStr) {
    throwMissing('GITTER_AI_MAX_TOKENS', 'ai.maxTokens', 'Max tokens');
  }
  const maxTokens = parseInt(maxTokensStr, 10);
  if (isNaN(maxTokens) || maxTokens <= 0) {
    throw new Error(
      `Invalid GITTER_AI_MAX_TOKENS value: '${maxTokensStr}'. Must be a positive integer.`
    );
  }

  const config: AIConfig = {
    provider: provider as AIProvider,
    model,
    maxTokens,
  };

  // Validate and attach provider-specific config
  switch (config.provider) {
    case 'anthropic': {
      const apiKey = resolve('ANTHROPIC_API_KEY', ['ai', 'anthropic', 'apiKey']);
      if (!apiKey) {
        throwMissing('ANTHROPIC_API_KEY', 'ai.anthropic.apiKey', 'Anthropic API key');
      }
      config.anthropic = { apiKey };
      break;
    }

    case 'azure': {
      const apiKey = resolve('ANTHROPIC_FOUNDRY_API_KEY', ['ai', 'azure', 'apiKey']);
      if (!apiKey) {
        throwMissing('ANTHROPIC_FOUNDRY_API_KEY', 'ai.azure.apiKey',
          'Azure Foundry API key');
      }
      const resource = resolve('ANTHROPIC_FOUNDRY_RESOURCE', ['ai', 'azure', 'resource']);
      if (!resource) {
        throwMissing('ANTHROPIC_FOUNDRY_RESOURCE', 'ai.azure.resource',
          'Azure Foundry resource hostname');
      }
      config.azure = { apiKey, resource };
      break;
    }

    case 'vertex': {
      const projectId = resolve('ANTHROPIC_VERTEX_PROJECT_ID',
        ['ai', 'vertex', 'projectId']);
      if (!projectId) {
        throwMissing('ANTHROPIC_VERTEX_PROJECT_ID', 'ai.vertex.projectId',
          'GCP project ID');
      }
      const region = resolve('CLOUD_ML_REGION', ['ai', 'vertex', 'region']);
      if (!region) {
        throwMissing('CLOUD_ML_REGION', 'ai.vertex.region', 'GCP region');
      }
      config.vertex = { projectId, region };
      break;
    }
  }

  return config;
}
```

**Key Design Decisions**:
- The `.env` file is loaded from `~/.gitter/.env`, NOT from CWD. This keeps all gitter configuration in one location.
- Config file is cached for the duration of the process (read once via `loadConfigFile()`).
- The `resolve()` helper abstracts the two-tier lookup so each field follows the same pattern.
- Provider validation happens before provider-specific field resolution, so the error message is clear.

---

### 10.6 Module Design: `src/ai-client.ts`

**Purpose**: Factory function creating the appropriate Claude SDK client based on provider config, plus a wrapper for `messages.create()` with error handling.

#### Imports and Type Definitions

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type { AIConfig } from './types.js';

/**
 * Union type of all supported Claude client instances.
 * All share the identical messages.create() API surface.
 */
type AIClient = Anthropic | AnthropicFoundry | AnthropicVertex;
```

#### Exported Function: `createAIClient(config: AIConfig): AIClient`

```typescript
/**
 * Factory function that creates the appropriate Claude SDK client
 * based on the provider specified in the AI configuration.
 *
 * @param config - Validated AI configuration (from loadAIConfig)
 * @returns A client instance with the messages.create() API
 * @throws Error if provider is unknown
 */
export function createAIClient(config: AIConfig): AIClient {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({
        apiKey: config.anthropic!.apiKey,
      });

    case 'azure':
      return new AnthropicFoundry({
        apiKey: config.azure!.apiKey,
        resource: config.azure!.resource,
      });

    case 'vertex':
      return new AnthropicVertex({
        projectId: config.vertex!.projectId,
        region: config.vertex!.region,
      });

    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
```

The non-null assertions (`!`) are safe because `loadAIConfig()` validates that provider-specific fields are present and throws on missing values before returning.

#### Exported Function: `generateDescription(client, config, systemPrompt, userMessage): Promise<string>`

```typescript
/**
 * Call the Claude API to generate a description and return the raw text response.
 *
 * @param client - The AI client instance (from createAIClient)
 * @param config - The AI configuration (for model and maxTokens)
 * @param systemPrompt - The system prompt instructing the AI
 * @param userMessage - The user message containing repo content
 * @returns The raw text response from Claude
 * @throws Error with user-friendly message on API failures
 */
export async function generateDescription(
  client: AIClient,
  config: AIConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text content from response blocks
    const textContent = response.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { type: string; text: string }) => block.text)
      .join('\n');

    if (!textContent) {
      throw new Error('Failed to parse AI response. Please try again.');
    }

    // Warn if response was truncated
    if (response.stop_reason === 'max_tokens') {
      process.stderr.write(
        'Warning: AI response was truncated due to max_tokens limit. ' +
        'Consider increasing GITTER_AI_MAX_TOKENS.\n'
      );
    }

    return textContent;
  } catch (error: unknown) {
    // Re-throw our own errors (e.g., empty response)
    if (error instanceof Error && error.message.startsWith('Failed to parse')) {
      throw error;
    }

    const err = error as { status?: number; message?: string; code?: string };

    if (err.status === 401 || err.status === 403) {
      throw new Error(
        'Authentication failed for Claude API. Check your API key/credentials.'
      );
    }
    if (err.status === 429) {
      throw new Error('Rate limited by Claude API. Please try again later.');
    }
    if (err.status === 500 || err.status === 503) {
      throw new Error('Claude API is temporarily unavailable. Please try again later.');
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      throw new Error(`Failed to connect to Claude API: ${err.message}`);
    }

    throw new Error(`Claude API error: ${err.message ?? 'Unknown error'}`);
  }
}
```

#### System Prompt Design

The system prompt is constructed in the `describe` command handler (Section 10.9) with interpolated line count targets:

```
You are a technical writer analyzing a software repository. Your task is to produce
two descriptions of the repository:

1. BUSINESS DESCRIPTION (~{businessLines} lines): Explain the purpose, use cases,
   target audience, and value proposition of the project. Write for a non-technical
   stakeholder or decision-maker. Focus on what problem the project solves and why
   it matters.

2. TECHNICAL DESCRIPTION (~{technicalLines} lines): Explain the architecture,
   technology stack, design patterns, and technical approach. Write for a developer
   or technical lead evaluating the project. Focus on how the project works and what
   makes it technically interesting or sound.

Output format: Use markdown. Start the business description with "## Business Description"
and the technical description with "## Technical Description". Do not include any other
top-level headings or preamble.
```

#### Refinement Prompt Design

When an existing description is present, the user message includes it in a delimited block:

```
=== EXISTING DESCRIPTION (use as starting point, refine as instructed) ===
## Business Description
{existingBusinessDescription}

## Technical Description
{existingTechnicalDescription}
=== END EXISTING DESCRIPTION ===
```

Combined with the `--instructions` option:

```
=== ADDITIONAL INSTRUCTIONS ===
{userInstructions}
=== END ADDITIONAL INSTRUCTIONS ===
```

This enables iterative refinement: the AI reads both the existing description and the user's instructions, producing an updated version each time.

---

### 10.7 Module Design: `src/repo-content.ts`

**Purpose**: Collect repository content for Claude analysis with token budget management.

#### Exported Interface: `RepoContent`

```typescript
export interface RepoContent {
  /** git ls-tree output (truncated at 500 lines) */
  fileTree: string;
  /** README content (first 200 lines) or null if no README found */
  readme: string | null;
  /** Project manifest (package.json, Cargo.toml, etc.) or null */
  manifest: string | null;
  /** Project documentation files (CLAUDE.md, .cursor/rules) -- first 100 lines each */
  projectDocs: string[];
  /** Key source file excerpts (src/main.*, src/index.*, etc.) -- first 100 lines each */
  sourceSnippets: string[];
  /** CI/CD config excerpts (.github/workflows/*.yml) -- first 50 lines each, max 3 */
  ciConfigs: string[];
}
```

#### Exported Function: `collectRepoContent(repoPath: string): RepoContent`

**Implementation Steps**:

1. **File Tree** (Priority 1 -- Required):
   - Call `git(['ls-tree', '-r', '--name-only', 'HEAD'], repoPath)` using the existing `git()` function from `src/git.ts`.
   - Truncate to first 500 lines. If truncated, append: `\n... ({remaining} more files)`.
   - If the git command fails (e.g., empty repo with no commits), set to `"(no commits yet)"`.

2. **README** (Priority 1 -- Required if exists):
   - Search for files in order: `README.md`, `README`, `README.rst`, `readme.md`.
   - Read first 200 lines of the first match found.
   - If none found, set to `null`.

3. **Manifest** (Priority 1 -- Required if exists):
   - Search for files in order: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `composer.json`, `Gemfile`.
   - Read the full content of the first match found.
   - If none found, set to `null`.

4. **Project Docs** (Priority 2 -- Optional):
   - Check for: `CLAUDE.md`, `.cursor/rules`.
   - Read first 100 lines of each that exists.
   - Collect into `projectDocs` array (may be empty).

5. **Source Snippets** (Priority 2 -- Optional):
   - Use the file tree output to find entry point files matching patterns: `src/main.*`, `src/index.*`, `src/app.*`, `src/lib.*`, `main.*`, `index.*`, `app.*`.
   - Read first 100 lines of each match.
   - Collect into `sourceSnippets` array (may be empty).

6. **CI Configs** (Priority 3 -- Optional):
   - Check for `.github/workflows/` directory.
   - If it exists, list YAML files and read first 50 lines of up to 3 files.
   - Collect into `ciConfigs` array (may be empty).

#### Internal Helper: `readFileHead()`

```typescript
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { git } from './git.js';

function readFileHead(repoPath: string, relativePath: string, maxLines: number): string | null {
  const fullPath = join(repoPath, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (truncated at ${maxLines} lines)`;
    }
    return content;
  } catch {
    return null; // Silently skip unreadable files (binary, permissions, etc.)
  }
}
```

#### Exported Function: `formatRepoContentForPrompt(content: RepoContent): string`

```typescript
/**
 * Format collected repo content into a single string for the Claude user message.
 * Each section is delimited with labeled separators.
 */
export function formatRepoContentForPrompt(content: RepoContent): string {
  const sections: string[] = [];

  sections.push('--- FILE TREE ---');
  sections.push(content.fileTree);

  if (content.readme) {
    sections.push('\n--- README ---');
    sections.push(content.readme);
  }

  if (content.manifest) {
    sections.push('\n--- PROJECT MANIFEST ---');
    sections.push(content.manifest);
  }

  for (const doc of content.projectDocs) {
    sections.push('\n--- PROJECT DOCUMENTATION ---');
    sections.push(doc);
  }

  for (const snippet of content.sourceSnippets) {
    sections.push('\n--- SOURCE FILE ---');
    sections.push(snippet);
  }

  for (const ci of content.ciConfigs) {
    sections.push('\n--- CI/CD CONFIG ---');
    sections.push(ci);
  }

  return sections.join('\n');
}
```

#### Token Budget Management

**Target**: Total prompt content under ~30,000 tokens (~120KB of text, using the 4 chars/token approximation).

After collecting all content, calculate total byte size of the formatted output. If it exceeds 120,000 bytes, apply progressive truncation:

1. Remove CI configs (Priority 3) until under budget.
2. Remove source snippets (Priority 2) until under budget.
3. Remove project docs (Priority 2) until under budget.
4. Truncate README to 100 lines (instead of 200).
5. Truncate file tree to 250 lines (instead of 500).

Log to stderr: `"Content size: ~{sizeKB}KB (~{estimatedTokens} tokens)"`.

If content was truncated to fit budget, log warning to stderr: `"Warning: Repository content was truncated to fit within the token budget."`.

```typescript
const TOKEN_BUDGET_BYTES = 120_000;

/**
 * Apply progressive truncation to fit content within the token budget.
 * Modifies the content object in place and reformats.
 * Returns the formatted string.
 */
export function applyTokenBudget(content: RepoContent): string {
  let formatted = formatRepoContentForPrompt(content);
  let truncated = false;

  // Step 1: Remove CI configs
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.ciConfigs.length > 0) {
    content.ciConfigs = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 2: Remove source snippets
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.sourceSnippets.length > 0) {
    content.sourceSnippets = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 3: Remove project docs
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.projectDocs.length > 0) {
    content.projectDocs = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 4 & 5: Further truncation of README and file tree if still over budget
  // (re-read with smaller limits and re-format)

  const sizeKB = Math.round(Buffer.byteLength(formatted, 'utf-8') / 1024);
  const estimatedTokens = Math.round(Buffer.byteLength(formatted, 'utf-8') / 4);
  process.stderr.write(`Content size: ~${sizeKB}KB (~${estimatedTokens} tokens)\n`);

  if (truncated) {
    process.stderr.write('Warning: Repository content was truncated to fit within the token budget.\n');
  }

  return formatted;
}
```

---

### 10.8 Response Parsing

The Claude response is expected to contain two markdown sections. Parsing splits on the `## Technical Description` heading:

```typescript
/**
 * Parse the Claude response into business and technical description sections.
 * Expects the response to contain "## Business Description" and "## Technical Description" headings.
 *
 * @param responseText - Raw text response from Claude
 * @returns Parsed business and technical descriptions (headings stripped)
 * @throws Error if the "## Technical Description" heading is not found
 */
function parseDescription(responseText: string): { business: string; technical: string } {
  const techIndex = responseText.indexOf('## Technical Description');
  if (techIndex === -1) {
    throw new Error(
      'Failed to parse AI response: missing "## Technical Description" heading'
    );
  }

  const businessSection = responseText.substring(0, techIndex).trim();
  const technicalSection = responseText.substring(techIndex).trim();

  const business = businessSection.replace(/^## Business Description\s*/i, '').trim();
  const technical = technicalSection.replace(/^## Technical Description\s*/i, '').trim();

  return { business, technical };
}
```

---

### 10.9 Module Design: `src/commands/describe.ts`

**Purpose**: The main `gitter describe` command handler.

#### Options Interface

```typescript
interface DescribeOptions {
  show?: boolean;
  instructions?: string;
  businessLines?: string;   // Commander passes as string
  technicalLines?: string;  // Commander passes as string
}
```

#### Exported Function: `describeCommand(query: string | undefined, options: DescribeOptions): Promise<void>`

**`--show` Path**:

1. Resolve the target repository entry (see "Query Resolution" below).
2. If entry has `description` field:
   - Print formatted output with bold headers using `picocolors`:
     - `"Business Description:"` + content
     - `"Technical Description:"` + content
     - `"Description Generated:"` + timestamp
     - `"Generated By:"` + model name
     - `"Instructions Used:"` + instructions (if any)
3. If entry has NO `description` field:
   - Print: `"No description available for {repoName}. Run 'gitter describe' to generate one."`
   - Exit(0) -- informational, not an error.

**Generation Path**:

1. Resolve target repository entry.
2. Validate `existsSync(entry.localPath)`. If not, throw: `"Repository path no longer exists: {localPath}"`.
3. Call `loadAIConfig()` from `ai-config.ts`.
4. Call `createAIClient(config)` from `ai-client.ts`.
5. Call `collectRepoContent(entry.localPath)` from `repo-content.ts`.
6. Call `applyTokenBudget(content)` to get the formatted, budget-constrained string.
7. Build system prompt with interpolated `businessLines` and `technicalLines` values.
8. Build user message containing:
   - Repository name and path
   - Existing description (if present in registry)
   - User instructions (if `--instructions` provided)
   - Formatted repo content
9. Print progress to stderr: `"Generating description for {repoName}..."`.
10. Call `generateDescription(client, config, systemPrompt, userMessage)`.
11. Parse response via `parseDescription(responseText)`.
12. Build `RepoDescription` object with parsed content, timestamp, model name, and instructions.
13. **Store in registry** -- Critical: do NOT use `addOrUpdate()` which would replace the entire entry and lose branch metadata. Instead:
    ```typescript
    const registry = loadRegistry();
    const registryEntry = findByPath(registry, entry.localPath);
    if (registryEntry) {
      registryEntry.description = description;
      saveRegistry(registry);
    }
    ```
14. Display the generated description (same format as `--show` path).

#### Query Resolution Logic

**Mode A: Query provided** (`gitter describe myproject`):
1. Load registry.
2. Call `searchEntries(registry, query)`.
3. 0 matches: stderr `"No repositories match query: {query}"` + `process.exit(1)`.
4. 1 match: use that entry.
5. N matches: interactive select via stderr using `@inquirer/prompts` (same pattern as `info`, `go`).

**Mode B: No query** (`gitter describe` from within a registered repo):
1. Check `isInsideGitRepo()`. If false: stderr error + exit(1).
2. Get `getRepoRoot()` to get the repo root path.
3. Load registry.
4. Call `findByPath(registry, repoRoot)`.
5. If no match: stderr `"Current repository is not registered. Run 'gitter scan' first."` + exit(1).
6. Use the found entry.

---

### 10.10 Modifications to Existing Files

#### 10.10.1 `src/types.ts`

Add the `RepoDescription`, `AIProvider`, and `AIConfig` interfaces as specified in Section 10.4. Extend `RegistryEntry` with the optional `description?: RepoDescription` field.

**Lines changed**: ~45 new lines added after the existing `Registry` interface.

#### 10.10.2 `src/commands/info.ts`

Add a description display section at the end of the info output, after the `Last Updated` line (currently line 90).

**Code to add** (after `console.log(pc.bold('Last Updated:')...)`):

```typescript
// Description section
console.log();
if (entry.description) {
  console.log(pc.bold('--- Description ---'));
  console.log(`${pc.bold('Business Description:')}`);
  console.log(entry.description.businessDescription);
  console.log();
  console.log(`${pc.bold('Technical Description:')}`);
  console.log(entry.description.technicalDescription);
  console.log(`${pc.bold('Description Generated:')} ${entry.description.generatedAt}`);
  console.log(`${pc.bold('Generated By:')} ${entry.description.generatedBy}`);
  if (entry.description.instructions) {
    console.log(`${pc.bold('Instructions Used:')} ${entry.description.instructions}`);
  }
} else {
  console.log(`${pc.bold('Description:')} (none -- run 'gitter describe' to generate)`);
}
```

**Lines changed**: ~15 new lines inserted before the function's closing brace.

#### 10.10.3 `src/commands/scan.ts`

Preserve the `description` field across re-scans. After calling `collectRepoMetadata()` and before calling `addOrUpdate()`, carry over the existing description.

**Current code** (lines 22-29):
```typescript
const metadata = collectRepoMetadata();
const registry = loadRegistry();

const existing = findByPath(registry, metadata.localPath);
const isUpdate = existing !== undefined;

addOrUpdate(registry, metadata);
saveRegistry(registry);
```

**Modified code**:
```typescript
const metadata = collectRepoMetadata();
const registry = loadRegistry();

const existing = findByPath(registry, metadata.localPath);
const isUpdate = existing !== undefined;

// Preserve existing description across re-scans
if (existing?.description) {
  metadata.description = existing.description;
}

addOrUpdate(registry, metadata);
saveRegistry(registry);
```

**Lines changed**: +4 lines (the `if` block).

Note: `findByPath` is already imported in `scan.ts` (line 3 of the current file).

#### 10.10.4 `src/cli.ts`

Import and register the describe command.

**Import to add** (after line 7):
```typescript
import { describeCommand } from './commands/describe.js';
```

**Command registration** (add after the `init` command registration, before the default action):
```typescript
program
  .command('describe [query]')
  .description('Generate or show AI-powered repository description')
  .option('--instructions <text>', 'Additional instructions for the AI')
  .option('--show', 'Show stored description without regenerating')
  .option('--business-lines <n>', 'Target line count for business description', '20')
  .option('--technical-lines <n>', 'Target line count for technical description', '20')
  .action(describeCommand);
```

**Lines changed**: +8 lines.

Note: Commander passes options as the last argument when positional args are optional (`[query]`). The `describeCommand` function signature `(query: string | undefined, options: DescribeOptions)` handles this correctly.

---

### 10.11 Error Handling Summary

| Scenario | Message | Exit Code |
|----------|---------|:---------:|
| No AI provider configured | `"GITTER_AI_PROVIDER is not set. Configure via: ..."` | 1 |
| Missing API key for provider | `"ANTHROPIC_API_KEY is not set. Configure via: ..."` | 1 |
| AI model not configured | `"GITTER_AI_MODEL is not set. Configure via: ..."` | 1 |
| Max tokens not configured | `"GITTER_AI_MAX_TOKENS is not set. Configure via: ..."` | 1 |
| Unknown provider value | `"Unknown AI provider: '<value>'. Must be one of: anthropic, azure, vertex"` | 1 |
| Config file malformed JSON | `"Config file is corrupted: ~/.gitter/config.json"` | 1 |
| Invalid maxTokens value | `"Invalid GITTER_AI_MAX_TOKENS value: '<value>'. Must be a positive integer."` | 1 |
| Claude API auth failure (401/403) | `"Authentication failed for Claude API. Check your API key/credentials."` | 1 |
| Claude API rate limit (429) | `"Rate limited by Claude API. Please try again later."` | 1 |
| Claude API unavailable (500/503) | `"Claude API is temporarily unavailable. Please try again later."` | 1 |
| Claude API network error | `"Failed to connect to Claude API: <details>"` | 1 |
| Empty AI response | `"Failed to parse AI response. Please try again."` | 1 |
| Response missing heading | `"Failed to parse AI response: missing '## Technical Description' heading"` | 1 |
| Repo path does not exist | `"Repository path no longer exists: <path>"` | 1 |
| Not inside git repo (no query) | `"Not inside a git repository. Provide a repo name or run from within a registered git repository."` | 1 |
| Repo not registered (no query) | `"Current repository is not registered. Run 'gitter scan' first."` | 1 |
| No search matches | `"No repositories match query: <query>"` | 1 |
| `--show` with no description | `"No description available for <name>. Run 'gitter describe' to generate one."` | 0 |
| Truncated response (max_tokens) | Warning to stderr (not an error, continues) | N/A |

---

### 10.12 Implementation Units for Parallel Coding

The AI description feature can be broken into independent implementation units that can be built by separate agents without file conflicts.

#### 10.12.1 Unit Map

```
+-----------+
| Unit H    |     (prerequisite: extend types.ts with RepoDescription, AIConfig)
| types.ts  |
| extension |
+-----------+
      |
      +---> Unit I: ai-config.ts       (Agent 1) --- independent
      |
      +---> Unit J: repo-content.ts    (Agent 2) --- independent (uses git.ts)
      |
      +---> Unit K: ai-client.ts       (Agent 3) --- independent
      |
      +---------------------------------------------+
                                                     |
                                               Unit L: describe.ts
                                               (depends on I, J, K)
                                                     |
                                               Unit M: integrations
                                               (info.ts, scan.ts, cli.ts)
```

#### 10.12.2 Unit Definitions

**Unit H: Type Extensions** (`src/types.ts`)
- **Scope**: Add `RepoDescription`, `AIProvider`, `AIConfig` interfaces; extend `RegistryEntry`
- **Dependencies**: None
- **Must complete first**: All AI-related units import these types
- **Effort**: Minimal (~45 lines)
- **File conflicts**: Modifies `src/types.ts` -- must be done before other units start

**Unit I: AI Configuration** (`src/ai-config.ts`)
- **Scope**: `loadAIConfig()`, priority resolution, validation
- **Dependencies**: Unit H (for `AIConfig`, `AIProvider` types), `registry.ts` (for `getRegistryDir()`)
- **Independent of**: Units J, K
- **File**: New file `src/ai-config.ts` -- no conflicts with other agents
- **Testable independently**: Set env vars and call `loadAIConfig()`, verify returned config object

**Unit J: Repository Content Collector** (`src/repo-content.ts`)
- **Scope**: `collectRepoContent()`, `formatRepoContentForPrompt()`, `applyTokenBudget()`
- **Dependencies**: `git.ts` (for `git()` function) -- already exists, no modifications needed
- **Independent of**: Units I, K (no AI config or client dependency)
- **File**: New file `src/repo-content.ts` -- no conflicts with other agents
- **Testable independently**: Point at any git repository and verify collected content

**Unit K: AI Client Factory** (`src/ai-client.ts`)
- **Scope**: `createAIClient()`, `generateDescription()`
- **Dependencies**: Unit H (for `AIConfig` type), npm packages (`@anthropic-ai/sdk`, `@anthropic-ai/foundry-sdk`, `@anthropic-ai/vertex-sdk`)
- **Independent of**: Units I, J
- **File**: New file `src/ai-client.ts` -- no conflicts with other agents
- **Testable independently**: Create client with valid config, make a simple test API call

**Unit L: Describe Command** (`src/commands/describe.ts`)
- **Scope**: `describeCommand()` handler, `parseDescription()` helper
- **Dependencies**: Units H, I, J, K -- all must be complete
- **File**: New file `src/commands/describe.ts` -- no conflicts with other agents
- **Cannot start until**: Units I, J, K are complete (or interfaces are agreed and stubbed)

**Unit M: Existing File Integrations** (`src/commands/info.ts`, `src/commands/scan.ts`, `src/cli.ts`)
- **Scope**: Add description display to info, preserve description in scan, register describe command in CLI
- **Dependencies**: Units H (types), L (describe command export)
- **Files modified**: Three existing files -- low risk of conflict if done as a single unit
- **Can run in parallel with Unit L**: The info.ts and scan.ts changes depend only on Unit H (types), not on Unit L

#### 10.12.3 Parallel Execution Plan

```
Phase 1: Prerequisites (single agent)
  npm install @anthropic-ai/sdk @anthropic-ai/foundry-sdk @anthropic-ai/vertex-sdk dotenv
  Unit H: extend types.ts
    |
    +---> Unit I: ai-config.ts         (Agent 1)
    |
    +---> Unit J: repo-content.ts      (Agent 2)
    |
    +---> Unit K: ai-client.ts         (Agent 3)
    |
    +---> Unit M-partial: info.ts +    (Agent 4) -- only needs types
    |     scan.ts changes
    |
    +------ wait for I, J, K ----------+
                                       |
                                 Unit L: describe.ts  (single agent)
                                       |
                                 Unit M-final: cli.ts wiring
                                       |
                                 Build + Test
```

**Maximum parallelism**: 4 agents (Units I, J, K, and M-partial can all run simultaneously)
**Minimum agents needed**: 1 (sequential execution)

#### 10.12.4 Interface Contracts Between New Units

| Producer | Consumer | Contract |
|----------|----------|----------|
| `types.ts` | All AI modules | Export `RepoDescription`, `AIProvider`, `AIConfig` interfaces |
| `ai-config.ts` | `describe.ts` | `loadAIConfig(): AIConfig` -- throws on missing config |
| `ai-client.ts` | `describe.ts` | `createAIClient(config: AIConfig): AIClient` |
| `ai-client.ts` | `describe.ts` | `generateDescription(client, config, system, user): Promise<string>` |
| `repo-content.ts` | `describe.ts` | `collectRepoContent(repoPath: string): RepoContent` |
| `repo-content.ts` | `describe.ts` | `applyTokenBudget(content: RepoContent): string` |
| `describe.ts` | `cli.ts` | `describeCommand(query?: string, options?: DescribeOptions): Promise<void>` |

---

### 10.13 Configuration Guide Summary

#### Config File Schema: `~/.gitter/config.json`

This file is NOT auto-created. Users create it manually if they prefer file-based configuration over environment variables.

```json
{
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 4096,
    "anthropic": {
      "apiKey": "sk-ant-..."
    },
    "azure": {
      "apiKey": "...",
      "resource": "my-resource.azure.anthropic.com"
    },
    "vertex": {
      "projectId": "my-gcp-project",
      "region": "us-east5"
    }
  }
}
```

#### Configuration Options and Priority

| Priority | Source | Description |
|:--------:|--------|-------------|
| 1 (highest) | Environment variables | Shell-set vars, always take precedence |
| 2 | `.env` file in `~/.gitter/` | Loaded via dotenv; does NOT override shell env vars |
| 3 (lowest) | `~/.gitter/config.json` | JSON config file |

If a required configuration value is not found in any source, the tool throws a clear error listing all three configuration methods. No fallback or default values are permitted for any configuration setting.

#### Provider-Specific Configuration

| Provider | Required Config | Auth Method | Model Name Format |
|----------|----------------|-------------|-------------------|
| `anthropic` | `provider`, `model`, `maxTokens`, `anthropic.apiKey` | API key | `claude-sonnet-4-20250514` (dash format) |
| `azure` | `provider`, `model`, `maxTokens`, `azure.apiKey`, `azure.resource` | API key | `claude-sonnet-4-20250514` (dash format) |
| `vertex` | `provider`, `model`, `maxTokens`, `vertex.projectId`, `vertex.region` | Google ADC (no API key) | `claude-sonnet-4@20250514` (@ format) |

**Vertex AI Model Name Format**: Vertex uses `@` separator (e.g., `claude-sonnet-4@20250514`), while Anthropic and Azure use `-` (e.g., `claude-sonnet-4-20250514`). Users must configure the correct format for their provider.

**Vertex AI Authentication**: Uses Google Application Default Credentials (ADC). Requires one of:
- `gcloud auth application-default login` run locally
- `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to a service account key file
- Running on GCP with an attached service account

#### API Key Expiration Tracking (Optional Enhancement)

An optional `GITTER_AI_KEY_EXPIRY` parameter (or `ai.keyExpiry` in config.json) can capture the API key expiration date in ISO 8601 format. When set, the tool logs a warning to stderr if the key expires within 7 days:
```
Warning: Your AI API key expires on 2026-04-15. Please renew it before expiration.
```

This is deferred to a future version but the config schema accommodates it.

#### Minimal `.env` Examples

**Anthropic Direct**:
```env
GITTER_AI_PROVIDER=anthropic
GITTER_AI_MODEL=claude-sonnet-4-20250514
GITTER_AI_MAX_TOKENS=4096
ANTHROPIC_API_KEY=sk-ant-...
```

**Azure AI Foundry**:
```env
GITTER_AI_PROVIDER=azure
GITTER_AI_MODEL=claude-sonnet-4-20250514
GITTER_AI_MAX_TOKENS=4096
ANTHROPIC_FOUNDRY_API_KEY=your-azure-key
ANTHROPIC_FOUNDRY_RESOURCE=my-resource.azure.anthropic.com
```

**Google Vertex AI**:
```env
GITTER_AI_PROVIDER=vertex
GITTER_AI_MODEL=claude-sonnet-4@20250514
GITTER_AI_MAX_TOKENS=4096
ANTHROPIC_VERTEX_PROJECT_ID=my-gcp-project
CLOUD_ML_REGION=us-east5
```

---

### 10.14 New Dependencies

| Package | Purpose | Type |
|---------|---------|------|
| `@anthropic-ai/sdk` | Direct Anthropic Claude API client | Production |
| `@anthropic-ai/foundry-sdk` | Azure AI Foundry (Claude on Azure) client | Production |
| `@anthropic-ai/vertex-sdk` | Google Vertex AI client | Production |
| `dotenv` | Load `.env` files for configuration resolution | Production |

**Install command**:
```bash
npm install @anthropic-ai/sdk @anthropic-ai/foundry-sdk @anthropic-ai/vertex-sdk dotenv
```

---

### 10.15 Updated File Structure

```
gitter/
|-- package.json
|-- tsconfig.json
|-- src/
|   |-- cli.ts                  # Entry point -- add describe command registration
|   |-- types.ts                # Add RepoDescription, AIProvider, AIConfig interfaces
|   |-- git.ts                  # Unchanged (reused by repo-content.ts)
|   |-- registry.ts             # Unchanged (handles arbitrary JSON transparently)
|   |-- ai-config.ts            # NEW: Config loading with priority resolution
|   |-- ai-client.ts            # NEW: Client factory + messages.create wrapper
|   |-- repo-content.ts         # NEW: Repo content collection and formatting
|   |-- commands/
|       |-- scan.ts             # Modified: preserve description across re-scans
|       |-- list.ts             # Unchanged
|       |-- search.ts           # Unchanged
|       |-- go.ts               # Unchanged
|       |-- info.ts             # Modified: add description display section
|       |-- remove.ts           # Unchanged (removing entry removes description)
|       |-- init.ts             # Unchanged
|       |-- describe.ts         # NEW: gitter describe command handler
|-- dist/
|-- node_modules/
|-- test_scripts/
|-- docs/
|   |-- design/
|   |   |-- project-design.md
|   |   |-- plan-002-ai-descriptions.md
|   |   |-- configuration-guide.md
|   |   |-- project-functions.md
|   |-- reference/
|       |-- refined-request-ai-repo-descriptions.md
|       |-- investigation-ai-integration.md
|-- Issues - Pending Items.md
```

Runtime artifacts:
```
~/.gitter/
|-- registry.json               # Persistent registry (now with optional description fields)
|-- config.json                 # Optional AI configuration file (user-created)
|-- .env                        # Optional environment variable file (user-created)
```

---

### 10.16 Updated Technology Stack

| Component | Technology | Version | Status |
|-----------|-----------|---------|--------|
| Language | TypeScript | 5.x | Existing |
| Runtime | Node.js | Latest LTS | Existing |
| Module System | ESM (`"type": "module"`) | -- | Existing |
| CLI Framework | commander.js | 14.x | Existing |
| Interactive Prompts | @inquirer/prompts | 8.x | Existing |
| Terminal Colors | picocolors | 1.x | Existing |
| Table Output | cli-table3 | 0.6.x | Existing |
| Git Interaction | child_process (built-in) | -- | Existing |
| File I/O | fs (built-in) | -- | Existing |
| Dev Runner | tsx | 4.x | Existing |
| Compiler | tsc (TypeScript) | 5.x | Existing |
| AI Client (Direct) | @anthropic-ai/sdk | latest | **New** |
| AI Client (Azure) | @anthropic-ai/foundry-sdk | latest | **New** |
| AI Client (Vertex) | @anthropic-ai/vertex-sdk | latest | **New** |
| Env File Loading | dotenv | latest | **New** |

**Production dependencies**: 8 (4 existing + 4 new)
**Dev dependencies**: 3 (unchanged)

---

### 10.17 Files Changed Summary

#### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/ai-config.ts` | Configuration loading with three-tier priority resolution | ~120 |
| `src/ai-client.ts` | Client factory + `messages.create()` wrapper with error handling | ~90 |
| `src/repo-content.ts` | Repository content collection, formatting, and budget management | ~150 |
| `src/commands/describe.ts` | `gitter describe` command handler | ~180 |

#### Modified Files

| File | Change | Est. Lines Changed |
|------|--------|-------------------|
| `src/types.ts` | Add `RepoDescription`, `AIProvider`, `AIConfig` interfaces; extend `RegistryEntry` | +45 |
| `src/commands/info.ts` | Add description display section at end of output | +15 |
| `src/commands/scan.ts` | Preserve `description` field across re-scans | +4 |
| `src/cli.ts` | Import + register `describe` command | +8 |
| `package.json` | New dependencies (auto-updated by npm install) | auto |

#### Unchanged Files

| File | Reason |
|------|--------|
| `src/registry.ts` | Handles arbitrary JSON transparently; `description` field serializes/deserializes without changes |
| `src/git.ts` | Reused as-is; `git()` function called from `repo-content.ts` |
| `src/commands/go.ts` | No description interaction |
| `src/commands/search.ts` | No description interaction |
| `src/commands/list.ts` | No description interaction |
| `src/commands/remove.ts` | Removing an entry removes its description automatically |
| `src/commands/init.ts` | Shell function unchanged |

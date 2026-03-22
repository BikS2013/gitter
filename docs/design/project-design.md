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

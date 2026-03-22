# Gitter - Functional Requirements and Feature Descriptions

## Overview

Gitter is a TypeScript CLI tool that maintains a persistent registry of local git repositories. It enables scanning, listing, searching, navigating to, inspecting, and removing repositories from the registry.

---

## Functional Requirements

### FR-1: Registry Storage

**Description**: The tool must maintain a JSON registry file at `~/.gitter/registry.json`. The `~/.gitter/` directory and file must be created automatically on first use. The registry must not use any fallback or default location -- if the HOME environment variable cannot be determined, the tool must raise an error.

**Registry Schema**:
- `version` (number): Schema version for future migrations
- `repositories` (array): List of `RegistryEntry` objects

**RegistryEntry Fields**:
- `repoName` (string): Name of the repository root directory
- `localPath` (string): Absolute path to the repository root
- `remotes` (array of Remote): Configured remotes
- `remoteBranches` (string[]): Remote-tracking branch names (e.g., "origin/main")
- `localBranches` (string[]): Local branch names
- `currentBranch` (string): Currently checked-out branch or HEAD detached state
- `lastUpdated` (string): ISO 8601 timestamp of last scan

**Remote Fields**:
- `name` (string): Remote name (e.g., "origin")
- `fetchUrl` (string): Fetch URL
- `pushUrl` (string): Push URL

---

### FR-2: Auto-Detect Git Repository

**Description**: When invoked, the tool must detect whether the current working directory is inside a git repository by locating the `.git` directory or file, walking up the directory tree. If CWD is inside a git repo, it must resolve to the repository root.

**Behavior**:
- Uses `git rev-parse --is-inside-work-tree` to check
- Uses `git rev-parse --show-toplevel` to resolve the root
- Works from any subdirectory within a repo

---

### FR-3: Register / Update Repository (scan command)

**Description**: When the tool is run inside a git repository (via `gitter scan` or `gitter` with no arguments), it must collect and store all repository metadata as defined in FR-1.

**Command**: `gitter scan`

**Behavior**:
- Collects all metadata via git CLI commands
- Creates or updates the registry entry
- Prints confirmation with repo name, path, remote count, and branch count
- If not inside a git repo, prints error to stderr and exits with code 1

---

### FR-4: Duplicate / Re-registration Handling

**Description**: If a repository with the same local path already exists in the registry, the tool must update the existing entry rather than creating a duplicate. The local absolute path serves as the unique identifier for each registry entry.

---

### FR-5: List Registered Repositories (list command)

**Description**: Display all registered repositories in a formatted table.

**Command**: `gitter list`

**Table Columns**: Repo Name, Local Path, Remotes (count), Last Updated

**Behavior**:
- If registry is empty, prints "No repositories registered"
- Repositories whose local path no longer exists on disk are marked as "[MISSING]"
- Uses cli-table3 for formatted output
- Uses picocolors for status coloring

---

### FR-6: Search / Filter Repositories (search command)

**Description**: Filter registered repositories by matching a query against the repo name, local path, and remote URLs.

**Command**: `gitter search <query>`

**Behavior**:
- Case-insensitive matching
- Partial match support (substring)
- Matches against repo name, local path, and all remote URLs
- Results displayed in same table format as `list`
- If no matches, prints "No repositories match query: <query>"

---

### FR-7: Navigate to Repository (go command)

**Description**: Search the registry and output the path to the matched repository so the user can navigate to it.

**Command**: `gitter go <query>`

**Behavior**:
- If exactly one match: print ONLY the localPath to stdout
- If multiple matches: present interactive selection via @inquirer/prompts (prompts to stderr), print selected path to stdout
- If no match: print error to stderr, exit with code 1
- If selected path does not exist on disk: print error to stderr, exit with code 1
- CRITICAL: strict stdout/stderr separation -- only the path goes to stdout

**Shell Integration**: Requires a shell function wrapper (provided by `gitter init`) to perform the actual `cd` in the parent shell. The shell function:
- Intercepts `gitter go` calls
- Captures stdout (the path)
- Runs `cd` to change directory
- Passes all other commands through to the gitter binary

---

### FR-8: Remove Repository from Registry (remove command)

**Description**: Remove a repository entry from the registry.

**Command**: `gitter remove <query>`

**Behavior**:
- If multiple entries match, prompt user to select which one to remove
- Confirm removal with y/n prompt
- Remove entry, save registry
- Print confirmation message

---

### FR-9: Show Repository Details (info command)

**Description**: Display full metadata of a matched repository.

**Command**: `gitter info <query>`

**Behavior**:
- If multiple matches, use interactive selection
- Displays: repo name, local path, all remotes (name, fetch URL, push URL), all local branches, all remote branches, current branch, last updated timestamp
- Uses picocolors for section headers

---

### FR-10: Scan Current Directory (default action)

**Description**: When `gitter` is invoked with no subcommand while inside a git repo, it must behave as `gitter scan`. If outside a git repo, it must show help.

**Command**: `gitter` (no arguments)

---

### FR-11: Shell Function Setup (init command)

**Description**: Print the shell function wrapper needed for the `go` command to work (changing the parent shell's directory).

**Command**: `gitter init`

**Behavior**:
- Prints a bash/zsh-compatible shell function to stdout
- Prints installation instructions
- Does NOT auto-inject into shell config files

---

## Feature Summary Table

| Feature | Command | Status |
|---------|---------|--------|
| Registry Storage | (internal) | Planned |
| Auto-Detect Git Repo | (internal) | Planned |
| Register/Update Repo | `gitter scan` | Planned |
| Duplicate Handling | (internal) | Planned |
| List Repos | `gitter list` | Planned |
| Search Repos | `gitter search <query>` | Planned |
| Navigate to Repo | `gitter go <query>` | Planned |
| Remove Repo | `gitter remove <query>` | Planned |
| Show Repo Details | `gitter info <query>` | Planned |
| Default Scan | `gitter` (no args) | Planned |
| Shell Function Setup | `gitter init` | Planned |
| Stale Entry Detection | (in list/go) | Planned |

---

## Out of Scope

- Cloning repositories from remote URLs
- Performing git operations (pull, push, commit) on registered repos
- Real-time monitoring of repository changes
- GUI or menu-bar integration
- Remote-only repository tracking (every entry must have a local path)
- Bulk scan (`gitter scan-all <directory>`) -- deferred to future version

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|------------|
| 1 | Shell function distribution | Print instructions via `gitter init`; do not auto-inject into shell config |
| 2 | Bulk scan | Deferred to future version |
| 3 | Stale entry detection | Mark missing paths as "[MISSING]" in `gitter list` output |
| 4 | Global install | Support `npm link` for development; document global install path |

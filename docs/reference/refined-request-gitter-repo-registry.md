# Refined Request: Gitter - Git Repository Registry CLI Tool

## Original Request

> I want you to create a command line tool to do the following:
> - it must maintain a registry of local and remote repos
> - when run inside a folder which is a repo it must update the registry regarding the local location and the remotes linked on it and the various branches of the remotes and locals
> - I can call it and ask it to navigate me to the local repository

---

## Objective

Build a TypeScript CLI tool called **gitter** that maintains a persistent registry of git repositories discovered on the local machine. When invoked inside a git repository, it automatically registers (or updates) that repository's metadata -- including its local path, configured remotes (names and URLs), remote-tracking branches, and local branches. The tool also provides a way to search the registry and navigate (change directory) to a registered repository.

---

## Scope

### In Scope

- Persistent JSON-based registry stored at a well-known location (`~/.gitter/registry.json`)
- Auto-detection of whether the current working directory is inside a git repository
- Automatic registration/update of repository metadata when run inside a git repo
- Storage of: local absolute path, list of remotes (name + fetch/push URLs), remote-tracking branches per remote, local branches, current branch, last-updated timestamp
- Search/filter repositories by name, path fragment, or remote URL
- Navigate to a registered repository (output a `cd` command or integrate via shell function)
- Interactive selection when multiple repos match a search query
- List all registered repositories
- Remove a repository from the registry
- Show detailed information about a specific registered repository

### Out of Scope

- Cloning repositories from remote URLs (gitter only tracks repos already present locally)
- Performing git operations (pull, push, commit, etc.) on registered repos
- Monitoring repositories for changes in real-time (updates happen only on explicit invocation)
- GUI or menu-bar integration
- Remote-only repository tracking (every registry entry must have a local path)

---

## Functional Requirements

### FR-1: Registry Storage
The tool must maintain a JSON registry file at `~/.gitter/registry.json`. The `~/.gitter/` directory and file must be created automatically on first use. The registry must not use any fallback or default location -- if the home directory cannot be determined, the tool must raise an error.

### FR-2: Auto-Detect Git Repository
When invoked, the tool must detect whether the current working directory is inside a git repository (by locating the `.git` directory or file, walking up the directory tree). If CWD is inside a git repo, it must resolve to the repository root.

### FR-3: Register / Update Repository
When the tool is run inside a git repository (explicitly via `gitter register` or implicitly via `gitter scan`), it must collect and store the following metadata:
- **repoName**: The name of the repository root directory
- **localPath**: The absolute path to the repository root
- **remotes**: An array of remote entries, each containing:
  - name (e.g., "origin", "upstream")
  - fetchUrl
  - pushUrl
- **remoteBranches**: An array of remote-tracking branch names (e.g., "origin/main", "origin/develop")
- **localBranches**: An array of local branch names
- **currentBranch**: The currently checked-out branch (or HEAD detached state)
- **lastUpdated**: ISO 8601 timestamp of the last scan

### FR-4: Duplicate / Re-registration Handling
If a repository with the same local path already exists in the registry, the tool must update the existing entry rather than creating a duplicate. The tool must use the local absolute path as the unique identifier for each registry entry.

### FR-5: List Registered Repositories
`gitter list` must display all registered repositories in a formatted table or list, showing at minimum: repo name, local path, number of remotes, and last-updated timestamp.

### FR-6: Search / Filter Repositories
`gitter search <query>` must filter registered repositories by matching the query against the repo name, local path, and remote URLs. The search must be case-insensitive and support partial matches.

### FR-7: Navigate to Repository
`gitter go <query>` must search the registry and output the path to the matched repository so the user can navigate to it. The mechanism must work as follows:
- If exactly one repository matches, output its path
- If multiple repositories match, present an interactive selection list
- If no repository matches, display an error message
- The tool must provide a shell function (for bash/zsh) that wraps `gitter go` to perform the actual `cd`. Installation instructions for the shell function must be provided.

### FR-8: Remove Repository from Registry
`gitter remove <query>` must allow removing a repository entry from the registry. If multiple entries match, the user must be prompted to select which one to remove.

### FR-9: Show Repository Details
`gitter info <query>` must display the full metadata of a matched repository, including all remotes with URLs, all local and remote branches, current branch, and last-updated timestamp.

### FR-10: Scan Current Directory
`gitter scan` (or simply `gitter` with no arguments while inside a git repo) must register or update the current repository in the registry and display a confirmation of what was registered/updated.

---

## Technical Constraints

1. **Language**: TypeScript (per project conventions)
2. **Runtime**: Node.js (latest LTS)
3. **Package Manager**: npm (with package.json)
4. **Configuration**: No fallback values for configuration settings. If a required setting (e.g., HOME directory) is unavailable, the tool must raise an exception.
5. **Git Interaction**: Use `git` CLI commands (via child_process) to gather repository information. Do not depend on external git libraries unless strictly necessary.
6. **Registry Format**: JSON file at `~/.gitter/registry.json`
7. **Platform**: macOS primary target (consistent with macbook-desktop project), but avoid platform-specific code where possible
8. **No Database**: Use file-based JSON storage only; no SQLite, no Postgres
9. **CLI Framework**: Use a lightweight CLI framework (e.g., commander, yargs, or similar) for argument parsing
10. **Interactive Selection**: Use a library like inquirer or prompts for interactive selection when multiple results match
11. **Documentation**: Tool must be documented in the parent project's CLAUDE.md using the XML tool format
12. **Test Scripts**: All test scripts must reside in the `test_scripts/` folder

---

## Acceptance Criteria

### AC-1: Registration
Running `gitter scan` inside a git repository with multiple remotes and branches creates a correct registry entry containing all remotes, all local branches, all remote-tracking branches, the current branch, and the local path.

### AC-2: Update on Re-scan
Running `gitter scan` again in the same repository after adding a new branch updates the existing entry (no duplicates) and reflects the new branch.

### AC-3: List
Running `gitter list` after registering multiple repositories displays all of them with correct names and paths.

### AC-4: Search
Running `gitter search <partial-name>` returns only repositories whose name, path, or remote URL matches the query.

### AC-5: Navigation
Running the shell-function wrapper `gitter go <name>` changes the shell's working directory to the matched repository's path.

### AC-6: Removal
Running `gitter remove <name>` removes the repository from the registry, and it no longer appears in `gitter list`.

### AC-7: Non-Git Directory
Running `gitter scan` outside a git repository displays a clear error message and does not modify the registry.

### AC-8: Missing Home Directory
If the HOME environment variable is not set, the tool raises a clear error and does not attempt to create or read the registry.

---

## Open Questions

1. **Shell function distribution**: Should gitter automatically inject the shell function into the user's `.zshrc`/`.bashrc` on first run, or just print the function for manual installation? (Recommendation: print instructions and let the user install manually, to avoid modifying shell config without consent.)

2. **Bulk scan**: Should there be a `gitter scan-all <directory>` command that recursively finds all git repos under a directory and registers them? This could be very useful for initial population of the registry. (Recommendation: include as a future enhancement, not in v1.)

3. **Stale entry detection**: Should `gitter list` warn about repositories whose local path no longer exists on disk? (Recommendation: yes, mark them as "missing" in the output.)

4. **Global install**: Should the tool be installable globally via `npm install -g` or linked via `npm link`? (Recommendation: support `npm link` for development and document the global install path.)

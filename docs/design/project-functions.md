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

### FR-12: Generate AI Repository Description (describe command)

**Description**: Analyze a registered repository using Claude AI and generate a structured description consisting of two sections: a business description and a technical description. The description is stored in the registry entry and can be refined iteratively.

**Command**: `gitter describe [query]`

**Behavior**:
- If `[query]` is omitted and CWD is inside a registered git repo, use the current repo.
- If `[query]` is omitted and CWD is not a registered repo, print error to stderr and exit(1).
- If `[query]` is provided, search the registry (same logic as `info`/`go`):
  - 0 matches: stderr error, exit(1)
  - 1 match: use that entry
  - N matches: interactive select via stderr
- Collect repository content (file tree, README, manifest, source files) from the entry's `localPath`.
- Send collected content to Claude along with the prompt.
- Parse the AI response and store the description in the registry entry.
- Display the generated description to the terminal.

**Options**:

| Option | Type | Description |
|--------|------|-------------|
| `--instructions <text>` | string | Additional user instructions to guide the AI (e.g., "focus on the security aspects") |
| `--show` | flag | Display the stored description without regenerating |
| `--business-lines <n>` | number | Override the default 20-line target for the business description |
| `--technical-lines <n>` | number | Override the default 20-line target for the technical description |

**Default Description Structure**:
- **Business Description** (~20 lines): Purpose, use cases, target audience, value proposition, problem it solves.
- **Technical Description** (~20 lines): Architecture, technology stack, design patterns, technical differentiators, approach.

**Refinement / Iterative Use**:
- When a description already exists, it is included in the prompt context as a starting point.
- User instructions are applied as refinements to the existing description.
- Each generation fully replaces the stored description (no versioning).

---

### FR-13: Display Stored Description (describe --show)

**Description**: Display the stored AI-generated description for a repository without invoking the AI.

**Command**: `gitter describe [query] --show`

**Behavior**:
- Resolve the target repository (same logic as FR-12).
- If the entry has a stored description, render it to the terminal with formatted headers.
- If the entry has no description, print informational message suggesting the user run `gitter describe` and exit(0).

---

### FR-14: Show Description in info Command

**Description**: Extend the existing `info` command to display the stored AI-generated description (if available) as an additional section at the end of the output.

**Command**: `gitter info <query>` (existing command, extended)

**Behavior**:
- After existing metadata output, if the entry has a `description` field:
  - Print a separator line
  - Print "Business Description:" header followed by the business description text
  - Print "Technical Description:" header followed by the technical description text
  - Print "Description Generated:" with the timestamp
- If no description exists, append: "Description: (none -- run 'gitter describe' to generate)"

---

### FR-15: Claude API Configuration

**Description**: Configuration system for the Claude AI integration supporting multiple providers with priority-based resolution.

**Location**: `~/.gitter/config.json` (same directory as registry.json)

**Configuration Priority** (highest to lowest):
1. Environment variables (shell-set)
2. `.env` file in CWD (loaded via dotenv)
3. `~/.gitter/config.json`

**Supported Providers**:

| Provider | SDK Package | Required Config |
|----------|------------|-----------------|
| Anthropic (direct) | `@anthropic-ai/sdk` | `apiKey` |
| Azure AI Foundry | `@anthropic-ai/foundry-sdk` | `apiKey`, `resource` |
| Google Vertex AI | `@anthropic-ai/vertex-sdk` | `projectId`, `region` (uses ADC for auth) |

**Required Configuration**: If any required configuration value is not found in any source, the tool must throw a clear error. No fallback or default values are permitted for API credentials or endpoints.

---

### FR-16: Repository Tagging - Data Model

**Description**: Each `RegistryEntry` gains an optional `tags?: string[]` field for user-assigned categorization tags. Tags are case-insensitive for matching but stored in the case the user provides. No duplicate tags within a single repo (compared case-insensitively). Tags are persisted in `~/.gitter/registry.json` alongside all other entry fields.

**Tag Validation Rules**:
- Tags must be non-empty strings
- Leading/trailing whitespace is trimmed
- Tags containing only whitespace are rejected
- Maximum tag length: 50 characters
- Tags must not contain commas (reserved for potential future CLI shorthand)

---

### FR-17: CLI Tag Management (tag command)

**Description**: A CLI command to add, remove, and list tags on repositories, as well as list all tags globally and eliminate a tag from all repositories.

**Command**: `gitter tag [query]`

**Subcommands / Options**:

| Invocation | Behavior |
|-----------|----------|
| `gitter tag <query>` | List all tags assigned to the matched repository |
| `gitter tag <query> --add <tag1> [tag2 ...]` | Add one or more tags to the matched repository. Duplicates (case-insensitive) are silently skipped. |
| `gitter tag <query> --remove <tag1> [tag2 ...]` | Remove one or more tags from the matched repository. Non-existent tags are silently skipped. |
| `gitter tag --all` | List every distinct tag across all repositories with per-tag repo count |
| `gitter tag --eliminate <tag>` | Remove the specified tag from every repository that has it (with confirmation prompt) |

**Behavior**:
- Repository resolution follows the standard `resolveEntry` pattern (query or CWD detection, interactive selection on ambiguity)
- Registry mutations use load -> find -> mutate -> save (atomic) pattern
- Interactive output goes to stderr; list output goes to stdout
- Confirmation prompt before `--eliminate` using `@inquirer/prompts` with `{ output: process.stderr }`

---

### FR-18: Tag Preservation in Scan

**Description**: When `gitter scan` re-scans and updates a repository entry, existing tags must be carried over to the updated entry. This is consistent with how `description`, `notes`, and `claudeSessions` are preserved.

**Command**: `gitter scan` (existing command, extended)

---

### FR-19: Tag Display in Info Command

**Description**: The `gitter info <query>` command displays the repository's tags when present.

**Command**: `gitter info <query>` (existing command, extended)

**Behavior**:
- Show tags as a comma-separated list after the "Last Updated" line
- When no tags exist, display: "Tags: (none -- run 'gitter tag' to add)"

---

### FR-20: Web UI Tag Display

**Description**: The web UI shows each repository's tags as visual badges/chips in the repository list cards and in the detail view.

**Behavior**:
- Tags appear as styled badges on each repo card in the list view
- Detail view shows all tags with individual remove ("x") buttons
- Detail view includes an input field and button to add new tags to the repo
- Tag mutations via the UI are persisted through API calls and survive page reload

---

### FR-21: Web UI Tag Filtering

**Description**: The web UI provides a tag filter control that lets the user select one or more tags to narrow the repository list.

**Behavior**:
- Available tags appear as clickable chips in the header/toolbar area
- Clicking a tag chip filters the list to show only repos with that tag
- Multiple tags can be selected simultaneously (OR logic: show repos matching ANY selected tag)
- Clearing tag selection shows all repos
- Tag chips display repo count (e.g., "backend (3)")
- Tag filter composes with existing text search and toggle filters (AND logic between filter categories)

---

### FR-22: Web UI Tag Elimination

**Description**: The web UI provides a way to eliminate a tag from all repositories globally.

**Behavior**:
- A confirmation dialog appears before elimination proceeds
- After elimination, the tag disappears from all repo cards and the filter bar
- The change persists (verified by page reload or CLI)

---

### FR-23: Tag API Endpoints

**Description**: The HTTP server exposes REST endpoints to support tag mutations from the web UI.

**Endpoints**:

| Endpoint | Method | Request Body | Response |
|---------|--------|-------------|----------|
| `GET /api/tags` | GET | -- | `{ tags: [{ name: string, count: number }] }` |
| `POST /api/tags/add` | POST | `{ localPath: string, tags: string[] }` | `{ success: true, tags: string[] }` |
| `POST /api/tags/remove` | POST | `{ localPath: string, tags: string[] }` | `{ success: true, tags: string[] }` |
| `POST /api/tags/eliminate` | POST | `{ tag: string }` | `{ success: true, affected: number }` |

**Behavior**:
- Follows existing Node.js built-in HTTP server pattern (no Express)
- POST body parsed manually from request stream
- Tag validation applied on all mutation endpoints
- Error responses: 400 for invalid input, 404 for entry not found, 500 for server errors

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
| AI Repo Description | `gitter describe [query]` | Planned |
| Show Stored Description | `gitter describe --show` | Planned |
| Description in Info | `gitter info` (extended) | Planned |
| AI Configuration | (internal) | Planned |
| Tag Data Model | (internal) | Planned |
| CLI Tag Management | `gitter tag [query]` | Planned |
| Tag Preservation in Scan | `gitter scan` (extended) | Planned |
| Tag Display in Info | `gitter info` (extended) | Planned |
| Web UI Tag Display | (web UI) | Planned |
| Web UI Tag Filtering | (web UI) | Planned |
| Web UI Tag Elimination | (web UI) | Planned |
| Tag API Endpoints | (HTTP server) | Planned |

---

## Out of Scope

- Cloning repositories from remote URLs
- Performing git operations (pull, push, commit) on registered repos
- Real-time monitoring of repository changes
- GUI or menu-bar integration
- Remote-only repository tracking (every entry must have a local path)
- Bulk scan (`gitter scan-all <directory>`) -- deferred to future version
- AI description versioning/history
- Streaming AI API responses
- Dry-run mode for AI content preview
- Custom AI prompt templates in config
- Batch description generation across multiple repos
- AI cost estimation before API call
- Support for non-Claude AI providers (OpenAI, etc.)
- Tag hierarchies or nested tags (tags are flat strings)
- Tag metadata (descriptions, colors, creation dates)
- Auto-tagging or AI-suggested tags
- Tag-based search in the `search` command (future enhancement)
- Tag import/export as a standalone operation
- Tag rename across all repos (future enhancement)

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|------------|
| 1 | Shell function distribution | Print instructions via `gitter init`; do not auto-inject into shell config |
| 2 | Bulk scan | Deferred to future version |
| 3 | Stale entry detection | Mark missing paths as "[MISSING]" in `gitter list` output |
| 4 | Global install | Support `npm link` for development; document global install path |

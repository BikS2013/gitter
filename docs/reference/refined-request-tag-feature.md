# Refined Request: Repository Tagging System

## Objective

Add a tagging system to Gitter that allows users to attach arbitrary text tags to registered repositories, enabling categorization, filtering, and discovery of repos by tag. Tags must be manageable through both the CLI and the web UI, including the ability to globally purge a tag from all repositories at once.

## Scope

### In scope

- A new `tags` property on each `RegistryEntry` storing an array of string tags
- A new CLI command (`gitter tag`) to add, remove, and list tags on a repository
- A CLI sub-command or option to globally eliminate a tag (remove it from every repository that has it)
- Web UI: tag-based filtering of the repository list (select one or more tags to narrow the view)
- Web UI: ability to add tags to a repo directly from the browser interface
- Web UI: ability to remove tags from a repo directly from the browser interface
- Web UI: ability to globally eliminate a tag from all repos via the browser interface
- A corresponding API endpoint in the HTTP server to support UI tag mutations
- The `info` command displays tags when present
- The `scan` command preserves existing tags across re-scans (consistent with how `description`, `notes`, and `claudeSessions` are preserved)
- Tag data is persisted in the existing `~/.gitter/registry.json`

### Out of scope

- Tag hierarchies or nested tags (tags are flat strings)
- Tag metadata (descriptions, colors, creation dates) -- tags are plain strings only
- Auto-tagging or AI-suggested tags
- Tag-based search in the existing `search` command (can be added later)
- Tag import/export as a standalone operation
- Authentication or multi-user concerns for the web UI

## Functional Requirements

1. **FR-01 -- Data model**: Each `RegistryEntry` gains an optional `tags?: string[]` field. Tags are case-insensitive for matching but stored in the case the user provides. No duplicates within a single repo (compared case-insensitively).

2. **FR-02 -- CLI: Add tags**: `gitter tag <query> --add <tag1> [tag2 ...]` adds one or more tags to the matched repository. If a tag already exists on the repo (case-insensitive match), it is silently skipped.

3. **FR-03 -- CLI: Remove tags**: `gitter tag <query> --remove <tag1> [tag2 ...]` removes one or more tags from the matched repository. If a tag does not exist, it is silently skipped.

4. **FR-04 -- CLI: List tags**: `gitter tag <query>` (no flags) lists all tags currently assigned to the matched repository.

5. **FR-05 -- CLI: List all tags globally**: `gitter tag --all` lists every distinct tag across all repositories, along with the count of repos using each tag.

6. **FR-06 -- CLI: Eliminate tag globally**: `gitter tag --eliminate <tag>` removes the specified tag from every repository that has it. The user is prompted for confirmation before proceeding.

7. **FR-07 -- Scan preserves tags**: When `gitter scan` re-scans and updates a repository entry, existing tags are carried over to the updated entry.

8. **FR-08 -- Info displays tags**: The `gitter info <query>` command shows the repo's tags in its output when tags are present.

9. **FR-09 -- UI: Display tags**: The web UI shows each repository's tags as visual badges/chips in the repository list.

10. **FR-10 -- UI: Filter by tag**: The web UI provides a tag filter control (e.g., clickable tag list, dropdown, or filter bar) that lets the user select one or more tags. When tags are selected, only repositories that have at least one of the selected tags are shown.

11. **FR-11 -- UI: Add tag to repo**: The web UI provides a mechanism (e.g., input field, dialog) to add a new tag to a specific repository.

12. **FR-12 -- UI: Remove tag from repo**: The web UI provides a mechanism (e.g., click-to-remove on tag badge) to remove a tag from a specific repository.

13. **FR-13 -- UI: Eliminate tag globally**: The web UI provides a way to eliminate a tag from all repositories (with confirmation).

14. **FR-14 -- API endpoints**: The HTTP server exposes the following endpoints for the UI:
    - `POST /api/tags/add` -- Add tag(s) to a repo (body: `{ localPath, tags[] }`)
    - `POST /api/tags/remove` -- Remove tag(s) from a repo (body: `{ localPath, tags[] }`)
    - `POST /api/tags/eliminate` -- Remove a tag from all repos (body: `{ tag }`)
    - `GET /api/tags` -- List all distinct tags with counts

15. **FR-15 -- Tag validation**: Tags must be non-empty strings. Leading/trailing whitespace is trimmed. Tags containing only whitespace are rejected. Maximum tag length: 50 characters. Tags must not contain commas (commas are reserved as a potential delimiter in future CLI shorthand).

## Technical Constraints

- **Language**: TypeScript (ESM modules), as per project conventions
- **No new dependencies**: Use existing libraries only (commander, picocolors, cli-table3, @inquirer/prompts)
- **Registry pattern**: Follow existing registry mutation patterns -- load, modify, save with atomic writes. Tags are stored directly in the RegistryEntry, not in a separate file
- **stdout/stderr discipline**: Interactive output goes to stderr; only machine-parseable output (if any) goes to stdout
- **Existing test pattern**: Tests go in `test_scripts/` using `npx tsx`, no test framework
- **Atomic writes**: Registry saves must use the existing atomic write mechanism (write to temp file, then rename)
- **Server pattern**: API endpoints follow the existing Node.js built-in HTTP server pattern (no Express). Parse JSON body manually from the request stream
- **UI pattern**: The web UI is a single-page HTML app served as a template literal from `src/ui/html.ts` with no external dependencies

## Acceptance Criteria

1. Running `gitter tag my-repo --add backend typescript` adds both tags to the matched repo; they appear in `gitter tag my-repo` output and in `gitter info my-repo` output.
2. Running `gitter tag my-repo --remove backend` removes the "backend" tag; "typescript" remains.
3. Running `gitter tag --all` lists all distinct tags across all repos with per-tag repo counts.
4. Running `gitter tag --eliminate typescript` (after confirmation) removes "typescript" from every repo that has it. Subsequent `gitter tag --all` no longer shows "typescript".
5. Running `gitter scan` inside a tagged repo does not lose its tags.
6. The web UI displays tags as visual badges on each repo card/row.
7. In the web UI, clicking a tag (or using a filter control) filters the repo list to show only repos with that tag.
8. In the web UI, the user can add a tag to a repo and the change persists (verified by page reload or CLI).
9. In the web UI, the user can remove a tag from a repo and the change persists.
10. In the web UI, the user can eliminate a tag globally and the change persists across all repos.
11. All existing tests continue to pass.
12. New tests in `test_scripts/` verify tag add, remove, list, eliminate, and scan-preservation logic.

## Open Questions

1. **Tag filter logic -- AND vs OR**: When multiple tags are selected in the UI filter, should repos be shown if they match ANY selected tag (OR logic) or ALL selected tags (AND logic)? This specification defaults to OR logic (show repos matching at least one selected tag), but the UI could offer a toggle. Downstream phases should confirm with the user if AND filtering is also desired.

2. **List command integration**: Should `gitter list` show tags in the table output? The table may become wide. A possible approach is to show a truncated tag list or a tag count. This is left for the implementation phase to decide based on readability.

3. **Tag rename**: The raw request does not mention renaming a tag across all repos. This could be a future enhancement but is not included in this specification.

## Original Request

> "I want you to add a 'tag' feature to the gitter tool. That means, that the user must be able to add arbitrary tags to a repo, as a way to 'attach' features to the repo. When on the UI the user must be able to filter repos based on the tags. He must also be able to add or remove tags from a repo through both the CLI and UI. He must also be able to eliminate a tag and remove it from all the repos it is used."

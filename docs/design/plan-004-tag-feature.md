# Plan 004: Repository Tagging System

## Document Info

| Field | Value |
|-------|-------|
| Project | gitter |
| Date | 2026-03-24 |
| Status | Ready for Implementation |
| Based On | refined-request-tag-feature.md, codebase-scan-tag-feature.md |
| Functional Requirements | FR-01 through FR-15 (tag feature) |

---

## Overview

Add a tagging system to Gitter that allows users to attach arbitrary text tags to registered repositories. Tags enable categorization, filtering, and discovery through both the CLI and the web UI, including global tag elimination.

---

## Implementation Units

### Unit 1: Data Model & CLI (Core)

**Dependencies**: None (foundational unit)

**Parallelizable with**: Unit 2 can begin concurrently once the `tags?: string[]` field is added to `RegistryEntry` in types.ts (the very first task of Unit 1). The rest of Unit 1 and Unit 2 can proceed in parallel.

---

#### Phase 1.1: Data Model Extension

**Files to modify**:
- `src/types.ts` (line 17, `RegistryEntry` interface)

**Changes**:
1. Add `tags?: string[]` to the `RegistryEntry` interface, placed after `claudeSessions` field:
   ```typescript
   /** User-assigned tags for categorization */
   tags?: string[];
   ```

**Acceptance Criteria**:
- `RegistryEntry` interface includes `tags?: string[]`
- Existing code compiles without errors (field is optional, no breaking changes)
- `npx tsc --noEmit` passes

---

#### Phase 1.2: Tag Preservation in Scan

**Files to modify**:
- `src/commands/scan.ts` (line 35-37, after `claudeSessions` preservation block)

**Changes**:
1. Add one line following the existing preservation pattern:
   ```typescript
   if (existing?.tags) metadata.tags = existing.tags;
   ```

**Acceptance Criteria**:
- Running `gitter scan` in a repo that already has tags does not lose those tags
- The preservation line follows the exact pattern used for `description`, `notes`, and `claudeSessions`

---

#### Phase 1.3: Tag Command Handler

**Files to create**:
- `src/commands/tag.ts`

**Design**: Follow the `notes.ts` command handler pattern.

**Internal Structure**:

```
tag.ts
  validateTag(tag: string): string          -- trim, reject empty/whitespace/commas, enforce 50-char max
  resolveEntry(query): RegistryEntry        -- same resolveEntry pattern as notes.ts
  hasTagCaseInsensitive(tags, tag): boolean  -- case-insensitive check
  addTagsToEntry(entry, tags[]): void       -- add with case-insensitive dedup
  removeTagsFromEntry(entry, tags[]): void  -- remove with case-insensitive match
  tagCommand(query, options): void          -- main handler
```

**Subcommand Behavior** (determined by options):

| Invocation | Behavior |
|-----------|----------|
| `gitter tag <query>` | List tags for matched repo |
| `gitter tag <query> --add <tags...>` | Add tags to matched repo |
| `gitter tag <query> --remove <tags...>` | Remove tags from matched repo |
| `gitter tag --all` | List all distinct tags globally with repo counts |
| `gitter tag --eliminate <tag>` | Remove tag from all repos (with confirmation) |

**Key Implementation Details**:

1. **Tag validation** (`validateTag`):
   - Trim leading/trailing whitespace
   - Reject empty strings or strings that are all whitespace
   - Reject strings containing commas
   - Reject strings longer than 50 characters
   - Return the trimmed string

2. **Case-insensitive dedup** (`addTagsToEntry`):
   - When adding, compare new tag against existing tags using `.toLowerCase()`
   - If a match exists, skip silently (preserve the existing casing)
   - If no match, append the new tag in the user-provided casing

3. **Case-insensitive removal** (`removeTagsFromEntry`):
   - Filter out tags where `tag.toLowerCase() === target.toLowerCase()`
   - If no match, skip silently

4. **Global elimination** (`--eliminate`):
   - Load registry, iterate all entries
   - For each entry with a matching tag (case-insensitive), remove it
   - Prompt for confirmation using `confirm()` from `@inquirer/prompts` with `{ output: process.stderr }`
   - Show count of affected repos after completion

5. **Global list** (`--all`):
   - Iterate all entries, collect tags into a `Map<string (lowercase), { display: string, count: number }>`
   - Display using `cli-table3` with columns: Tag, Repos
   - Sort alphabetically by tag name

6. **Registry mutation pattern**:
   - Load registry -> find entry by path -> mutate tags array in place -> save registry
   - Use atomic writes via `saveRegistry()`

7. **stdout/stderr discipline**:
   - All interactive output goes to stderr
   - List output goes to stdout (consistent with `list` and `search` commands)

**Acceptance Criteria**:
- `gitter tag my-repo --add backend typescript` adds both tags
- `gitter tag my-repo` lists the tags
- `gitter tag my-repo --remove backend` removes only "backend"
- `gitter tag --all` shows all distinct tags with counts
- `gitter tag --eliminate typescript` (after confirmation) removes from all repos
- Duplicate tags (case-insensitive) are silently skipped
- Invalid tags (empty, >50 chars, containing commas) produce clear error messages
- Tags are persisted in `~/.gitter/registry.json`

---

#### Phase 1.4: CLI Registration

**Files to modify**:
- `src/cli.ts`

**Changes**:
1. Add import: `import { tagCommand } from './commands/tag.js';`
2. Register the command after the `notes` command block (before `ui`):
   ```typescript
   program
     .command('tag [query]')
     .description('Add, remove, or list tags on a repository')
     .option('--add <tags...>', 'Add one or more tags')
     .option('--remove <tags...>', 'Remove one or more tags')
     .option('--all', 'List all tags across all repositories')
     .option('--eliminate <tag>', 'Remove a tag from all repositories')
     .action(tagCommand);
   ```

**Note on Commander `.option()` with variadic values**: Commander supports `<tags...>` syntax for collecting multiple values. This is the correct approach for `--add` and `--remove`.

**Acceptance Criteria**:
- `gitter tag` appears in `gitter --help` output
- All option flags are registered and passed correctly to the handler
- `gitter tag my-repo --add a b c` correctly passes `['a', 'b', 'c']` as the `add` option

---

#### Phase 1.5: Display Tags in Info Command

**Files to modify**:
- `src/commands/info.ts` (between "Last Updated" section and "Description" section, around line 90)

**Changes**:
1. Add a tags section after the "Last Updated" line:
   ```typescript
   // Tags section
   if (entry.tags && entry.tags.length > 0) {
     console.log(`${pc.bold('Tags:')}            ${entry.tags.map(t => pc.cyan(t)).join(', ')}`);
   } else {
     console.log(`${pc.bold('Tags:')}            (none -- run 'gitter tag' to add)`);
   }
   ```

**Acceptance Criteria**:
- `gitter info my-repo` displays tags when they exist
- Tags are shown in cyan, comma-separated
- When no tags exist, a hint message is displayed
- Output placement is consistent with the existing info layout

---

### Unit 2: Web UI (Depends on Unit 1 Data Model Only)

**Dependencies**: Phase 1.1 only (the `tags?: string[]` field in types.ts). Can proceed in parallel with Phases 1.2-1.5.

---

#### Phase 2.1: API Endpoints

**Files to modify**:
- `src/ui/server.ts`

**Changes**: Add four new endpoints to the `if/else if` chain in `createServer`.

**Endpoint Specifications**:

| Endpoint | Method | Body | Response |
|---------|--------|------|----------|
| `GET /api/tags` | GET | -- | `{ tags: [{ name: string, count: number }] }` |
| `POST /api/tags/add` | POST | `{ localPath: string, tags: string[] }` | `{ success: true, tags: string[] }` |
| `POST /api/tags/remove` | POST | `{ localPath: string, tags: string[] }` | `{ success: true, tags: string[] }` |
| `POST /api/tags/eliminate` | POST | `{ tag: string }` | `{ success: true, affected: number }` |

**Implementation Details**:

1. **POST body parsing**: Read request body from stream using the same pattern that must be established for these endpoints:
   ```typescript
   const body = await new Promise<string>((resolve) => {
     let data = '';
     req.on('data', (chunk) => { data += chunk; });
     req.on('end', () => resolve(data));
   });
   const parsed = JSON.parse(body);
   ```

2. **Tag validation**: Replicate the same validation logic from `tag.ts` (trim, reject empty/commas/over 50 chars). Consider extracting validation into a shared utility, or duplicating since the logic is trivial (3-4 lines).

3. **Registry mutation**: Load -> find entry -> mutate -> save (atomic). Same pattern as CLI commands.

4. **Error responses**: Return `{ error: string }` with appropriate HTTP status codes:
   - 400 for invalid input (missing fields, invalid tags)
   - 404 for entry not found
   - 500 for registry load/save failures

5. **CORS**: Not needed (same-origin, served from the same server).

**Acceptance Criteria**:
- `GET /api/tags` returns all distinct tags with counts
- `POST /api/tags/add` adds tags to a repo and returns updated tag list
- `POST /api/tags/remove` removes tags and returns updated tag list
- `POST /api/tags/eliminate` removes a tag from all repos and returns affected count
- Invalid input returns 400 with error message
- Non-existent repo returns 404

---

#### Phase 2.2: UI Tag Display

**Files to modify**:
- `src/ui/html.ts`

**Changes in `renderList()` (card rendering)**:
1. After existing repo-meta indicators (description, notes badges), render tags as badges:
   ```html
   <span class="tag-badge">tagname</span>
   ```
2. Add CSS for `.tag-badge` using the existing `--tag-bg` and `--tag-text` CSS variables (already defined in the stylesheet at lines 30-31).

**Changes in `renderDetail()` (detail panel)**:
1. Add a "Tags" section showing all tags as removable badges (each with an "x" button)
2. Add an input field + "Add" button for adding new tags
3. Wire up click handlers:
   - Clicking "x" on a badge calls `POST /api/tags/remove`
   - Submitting the add form calls `POST /api/tags/add`
   - After each mutation, call `fetchRegistry()` to refresh state

**Acceptance Criteria**:
- Tags appear as visual badges on repo cards in the list view
- Detail view shows all tags with remove ("x") buttons
- Detail view has an input + button to add new tags
- Adding a tag updates the display immediately (after re-fetch)
- Removing a tag updates the display immediately (after re-fetch)

---

#### Phase 2.3: UI Tag Filtering

**Files to modify**:
- `src/ui/html.ts`

**Changes in state object**:
1. Add `selectedTags: []` and `availableTags: []` to the state object (line 244)

**Changes in header/toolbar**:
1. Add a tag filter section below or alongside existing filter buttons
2. Render available tags as clickable chips/pills
3. Clicking a tag toggles it in `selectedTags`
4. Active tags are visually highlighted (e.g., different background color)
5. Include a "Clear tags" action to deselect all tag filters

**Changes in `applyFilters()`**:
1. After existing filter logic, add tag filter stage:
   - If `selectedTags` is empty, no tag filtering (show all)
   - If `selectedTags` has entries, keep only repos that have at least one of the selected tags (OR logic, as specified in the requirements)

**Changes in data fetching**:
1. After `fetchRegistry()`, compute `availableTags` from the loaded data (distinct tags with counts)
2. Alternatively, call `GET /api/tags` to get the tag list (avoids client-side computation)

**Acceptance Criteria**:
- Available tags appear as clickable chips in the header/toolbar area
- Clicking a tag chip filters the list to show only repos with that tag
- Multiple tags can be selected (OR logic: show repos matching ANY selected tag)
- Clearing tag selection shows all repos
- Tag chips show repo count (e.g., "backend (3)")
- Tag filter composes correctly with existing text search and toggle filters

---

#### Phase 2.4: UI Tag Elimination

**Files to modify**:
- `src/ui/html.ts`

**Changes**:
1. Add a "manage tags" or "eliminate" affordance -- either:
   - A small "x" on each tag chip in the filter bar (with confirmation dialog), or
   - A dedicated "Manage Tags" section/modal accessible from the toolbar
2. When the user confirms elimination:
   - Call `POST /api/tags/eliminate` with the tag name
   - On success, call `fetchRegistry()` to refresh
   - Remove the tag from `selectedTags` if it was selected
   - Show a brief success notification or update the tag list

**Acceptance Criteria**:
- User can eliminate a tag globally from the UI
- A confirmation dialog appears before elimination proceeds
- After elimination, the tag disappears from all repo cards and the filter bar
- The change persists (verified by page reload or CLI)

---

### Unit 3: Tests

**Dependencies**: Units 1 and 2 must be complete.

---

#### Phase 3.1: CLI Tag Tests

**Files to create**:
- `test_scripts/test-tags.ts`

**Test Categories and Cases**:

**Tag Validation Tests** (5 tests):
1. Valid tag is accepted and trimmed
2. Empty string is rejected
3. Whitespace-only string is rejected
4. Tag exceeding 50 characters is rejected
5. Tag containing comma is rejected

**Tag Add Tests** (4 tests):
6. Adding a tag to a repo with no existing tags creates the tags array
7. Adding multiple tags in one command adds all of them
8. Adding a duplicate tag (same case) is silently skipped
9. Adding a duplicate tag (different case) is silently skipped (case-insensitive dedup)

**Tag Remove Tests** (3 tests):
10. Removing an existing tag removes it
11. Removing a non-existent tag is silently skipped
12. Removing a tag with different casing works (case-insensitive match)

**Tag List Tests** (2 tests):
13. Listing tags for a repo with tags shows them
14. Listing tags for a repo with no tags shows empty message

**Global List Tests** (2 tests):
15. `--all` lists all distinct tags with correct counts
16. `--all` with no tags in any repo shows empty message

**Global Eliminate Tests** (2 tests):
17. Eliminating a tag removes it from all repos that had it
18. Repos without the eliminated tag are unaffected

**Scan Preservation Tests** (1 test):
19. Running scan on a tagged repo preserves its tags

**Info Display Tests** (2 tests):
20. Info command shows tags when present
21. Info command shows "none" hint when no tags

**Test Pattern**: Follow the existing test pattern in `test_scripts/`:
- No test framework; manual assertions with `console.log`
- Use a temporary registry file to avoid affecting real data
- Each test logs pass/fail with descriptive name
- Summary at the end with total pass/fail count

**Acceptance Criteria**:
- All 21 tests pass when run with `npx tsx test_scripts/test-tags.ts`
- Tests are isolated (use temporary registry, clean up after themselves)
- Test output follows the same format as existing test files

---

## Dependency Graph

```
Phase 1.1 (types.ts)
    |
    +--------+------------------+
    |        |                  |
    v        v                  v
Phase 1.2  Phase 1.3          Phase 2.1 (API endpoints)
(scan)     (tag.ts)            Phase 2.2 (UI display)
    |        |                  |
    v        v                  v
Phase 1.4  Phase 1.5          Phase 2.3 (UI filtering)
(cli.ts)   (info.ts)           |
    |        |                  v
    +--------+            Phase 2.4 (UI elimination)
    |                           |
    +---------------------------+
    |
    v
Phase 3.1 (tests)
```

**Parallelization Opportunities**:
- After Phase 1.1 completes, all remaining phases in Unit 1 (1.2-1.5) and Unit 2 (2.1-2.2) can start in parallel
- Within Unit 1: Phases 1.2, 1.3, 1.4, and 1.5 are independent of each other (though 1.4 imports from 1.3, so 1.3 must finish first)
- Within Unit 2: Phase 2.1 (API) and Phase 2.2 (display) can proceed in parallel; Phase 2.3 depends on 2.2; Phase 2.4 depends on 2.1 and 2.3
- Unit 3 depends on both Units 1 and 2 being complete

---

## Files Summary

### Files to Create

| File | Unit | Phase | Purpose |
|------|------|-------|---------|
| `src/commands/tag.ts` | 1 | 1.3 | CLI tag command handler |
| `test_scripts/test-tags.ts` | 3 | 3.1 | Tag feature test suite |

### Files to Modify

| File | Unit | Phase | Change |
|------|------|-------|--------|
| `src/types.ts` | 1 | 1.1 | Add `tags?: string[]` to `RegistryEntry` |
| `src/commands/scan.ts` | 1 | 1.2 | Add tag preservation line |
| `src/cli.ts` | 1 | 1.4 | Register `tag` command |
| `src/commands/info.ts` | 1 | 1.5 | Display tags section |
| `src/ui/server.ts` | 2 | 2.1 | Add 4 API endpoints |
| `src/ui/html.ts` | 2 | 2.2-2.4 | Tag badges, filtering, add/remove, elimination |

---

## Verification Criteria

### After Unit 1 completion:
1. `npx tsc --noEmit` compiles without errors
2. `gitter tag my-repo --add backend typescript` successfully adds tags
3. `gitter tag my-repo` lists "backend" and "typescript"
4. `gitter tag my-repo --remove backend` removes only "backend"
5. `gitter tag --all` shows "typescript" with count 1
6. `gitter tag --eliminate typescript` (after confirmation) removes it from all repos
7. `gitter info my-repo` shows a Tags line
8. Running `gitter scan` inside a tagged repo preserves tags
9. All existing tests pass: `npx tsx test_scripts/test-registry.ts`, `test-git.ts`, `test-cli.ts`, `test-ai-config.ts`, `test-repo-content.ts`, `test-describe-cli.ts`

### After Unit 2 completion:
10. Starting `gitter ui` and opening the browser shows tag badges on repo cards
11. Clicking a tag in the filter bar narrows the repo list to matching repos
12. In the detail view, adding a tag via the input field persists it (verified by page reload)
13. In the detail view, clicking "x" on a tag badge removes it and persists (verified by reload)
14. Eliminating a tag from the UI removes it from all repos (verified by CLI `gitter tag --all`)
15. API endpoints respond correctly: `GET /api/tags`, `POST /api/tags/add`, `POST /api/tags/remove`, `POST /api/tags/eliminate`

### After Unit 3 completion:
16. `npx tsx test_scripts/test-tags.ts` passes all 21 tests
17. All 6 existing test suites continue to pass (62+ tests total)

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Commander variadic option parsing edge cases | Test `--add` with single and multiple tags; verify Commander handles `<tags...>` correctly |
| Case-insensitive tag matching inconsistency between CLI and UI | Use the same `.toLowerCase()` comparison in both CLI handler and API endpoints |
| HTML template literal size growth (html.ts is already large) | Keep additions modular; use helper functions within the template's JavaScript section |
| Tag filter interaction with existing filters (search, toggles) | Tag filter composes as an AND with other filters (same as existing filter composition pattern) |
| POST body parsing reliability in Node.js HTTP server | Handle JSON parse errors with try/catch and return 400 |

---

## Open Decisions

| # | Decision | Recommendation |
|---|----------|---------------|
| 1 | Tag filter logic: OR vs AND when multiple tags selected | Use OR logic (match ANY selected tag) as specified in requirements. AND can be added later via toggle. |
| 2 | Show tags in `gitter list` table output | Show tag count in list table (e.g., "3 tags") to avoid width issues. Full tag display in `info` only. |
| 3 | Tag validation utility: shared or duplicated | Extract `validateTag()` into a shared utility file (e.g., `src/tag-utils.ts`) if server.ts needs it; otherwise keep in `tag.ts` and duplicate the trivial validation in server.ts. Recommend: keep in `tag.ts` and import from there in server.ts. |
| 4 | UI tag filter placement | Place tag chips in a collapsible row below the existing filter buttons, to avoid overcrowding the header. |

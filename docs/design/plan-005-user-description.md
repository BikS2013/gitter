# Plan 005: User Description Feature

## Overview

Add a user-authored free-text description field (`userDescription`) to each registry entry. Unlike the AI-generated `description` (business + technical), the user description is written entirely by the user via an editor. Its purpose is to help users quickly recognize repositories and improve searchability.

**Reference**: `docs/reference/refined-request-user-description.md`

---

## Implementation Units

### Unit A: Data Model + CLI

**Files**: `src/types.ts`, `src/cli.ts`, `src/commands/scan.ts`, `src/commands/info.ts`, `src/registry.ts`, `src/commands/user-desc.ts` (new)

#### A1: Data Model (`src/types.ts`)

Add `userDescription?: string` to the `RegistryEntry` interface, placed after `notes` and before `claudeSessions` (or after `tags`, following chronological order of addition):

```typescript
export interface RegistryEntry {
  // ... existing fields ...
  /** User-authored description for recognition and search */
  userDescription?: string;
}
```

No registry version bump needed -- the field is optional and backward-compatible.

#### A2: New Command Handler (`src/commands/user-desc.ts`)

Create a new file following the `notes.ts` pattern exactly:

1. Copy the `resolveEntry()` helper from `notes.ts` (same pattern: resolve by query or CWD, interactive select on multiple matches).
2. Define `UserDescCmdOptions` interface with `clear?: boolean` and `show?: boolean`.
3. Implement `userDescCommand(query: string | undefined, options: UserDescCmdOptions)`:

| Action | Trigger | Behavior |
|--------|---------|----------|
| Show | `--show` flag | Display current `userDescription` to stdout. If absent, print informational message. Return without opening editor. |
| Clear | `--clear` flag | Confirm with user, then `delete registryEntry.userDescription`. |
| Add/Edit | Default (no flags) | Open `editor()` from `@inquirer/prompts` with `default: entry.userDescription ?? ''` and `postfix: '.md'`. Save trimmed result. Empty content removes the field. |

Key implementation details:
- Use `@inquirer/prompts` `editor()` with `output: process.stderr` for shell function compatibility.
- Use `@inquirer/prompts` `confirm()` with `output: process.stderr` for `--clear`.
- Registry mutation: `loadRegistry()` -> `findByPath()` -> mutate entry directly -> `saveRegistry()`.
- When editor returns empty content, treat as removal (`delete registryEntry.userDescription`).

#### A3: CLI Registration (`src/cli.ts`)

Register the new command with Commander:

```typescript
import { userDescCommand } from './commands/user-desc.js';

program
  .command('user-desc [query]')
  .description('Add, edit, or view user description for a repository')
  .option('--show', 'Display stored user description without opening editor')
  .option('--clear', 'Remove user description')
  .action(userDescCommand);
```

#### A4: Scan Preservation (`src/commands/scan.ts`)

Add preservation of `userDescription` in the scan command, following the same pattern used for `description`, `notes`, `claudeSessions`, and `tags`:

```typescript
if (existing?.userDescription) {
  metadata.userDescription = existing.userDescription;
}
```

This line goes alongside the existing preservation lines for `description`, `notes`, `claudeSessions`, and `tags`.

#### A5: Info Display (`src/commands/info.ts`)

Add a "User Description" section **above** the existing "Description" section. Insert after the "Last Updated" line and before the current description section:

```typescript
// User Description section
console.log();
if (entry.userDescription) {
  console.log(pc.bold('--- User Description ---'));
  console.log(entry.userDescription);
} else {
  console.log(`${pc.bold('User Description:')} (none -- run 'gitter user-desc' to add)`);
}
```

Display order in `info` output after this change:
1. Repository metadata (name, path, remotes, branches, last updated)
2. **User Description** (new)
3. Description (business + technical, existing)
4. Tags (existing)
5. Claude Sessions (existing)
6. Notes (existing)

#### A6: Search Extension (`src/registry.ts`)

Extend `searchEntries()` to include `userDescription` in case-insensitive partial matching. Add after the existing `localPath` check:

```typescript
if (entry.userDescription?.toLowerCase().includes(q)) return true;
```

---

### Unit B: Web UI

**Files**: `src/ui/html.ts`, `src/ui/server.ts`

#### B1: API Endpoints (`src/ui/server.ts`)

Add two new API endpoints following the existing pattern (same style as notes/tags endpoints):

| Endpoint | Method | Request Body | Response | Behavior |
|----------|--------|-------------|----------|----------|
| `POST /api/user-desc` | POST | `{ localPath: string, userDescription: string }` | `{ success: true }` | Set or update user description for the entry identified by `localPath`. Empty string removes the field. |
| `DELETE /api/user-desc` | DELETE | `{ localPath: string }` | `{ success: true }` | Remove user description from the entry identified by `localPath`. |

Implementation pattern:
- Parse JSON body using existing `parseJsonBody` helper.
- Load registry -> find entry by `localPath` -> mutate -> save registry.
- Return 404 if entry not found, 400 for invalid input.

#### B2: HTML Detail View (`src/ui/html.ts`)

In the detail panel rendering:

1. **Display**: Render `userDescription` above the business description section under a "User Description" heading. When absent, show nothing (no placeholder, to avoid clutter).

2. **Edit capability**: Add a textarea and Save/Clear buttons for editing the user description, following the same interaction pattern as notes or tags:
   - Textarea pre-populated with current `userDescription` (or empty).
   - "Save" button sends `POST /api/user-desc` with the textarea content.
   - "Clear" button (only visible when a description exists) sends `DELETE /api/user-desc`.
   - After successful save/clear, refresh the detail view.

---

### Unit C: Tests

**File**: `test_scripts/test-user-desc.ts`

Create a test script following the existing test patterns (`test-registry.ts`, etc.) using `npx tsx`:

#### Test Cases

1. **Data model**: Verify `userDescription` can be set on a `RegistryEntry` object.
2. **Registry save/load**: Create an entry with `userDescription`, save, load, verify preserved.
3. **Search includes userDescription**: Add entry with `userDescription: "my special project"`, search for "special", verify match.
4. **Search without userDescription**: Add entry without `userDescription`, search for non-matching term, verify no match.
5. **Scan preservation**: Simulate scan re-registration (addOrUpdate with fresh metadata), verify `userDescription` from existing entry must be explicitly preserved (test the scan.ts preservation logic).
6. **CLI --show**: Run `gitter user-desc --show` on an entry with a description, verify output.
7. **CLI --show (none)**: Run `gitter user-desc --show` on an entry without a description, verify informational message.
8. **CLI --clear**: Run `gitter user-desc --clear` on an entry with a description, verify removal.
9. **Empty editor clears**: Verify that saving empty content removes the `userDescription` field.
10. **Info display order**: Verify info output shows user description before business description.

---

## Implementation Order

```
Step 1: A1 (types.ts) -- add field
    |
    v
Step 2: A2 (user-desc.ts) + A6 (registry.ts search) -- can be parallel
    |
    v
Step 3: A3 (cli.ts) + A4 (scan.ts) + A5 (info.ts) -- register and integrate
    |
    v
Step 4: B1 (server.ts) + B2 (html.ts) -- web UI
    |
    v
Step 5: C (tests)
```

Steps 2-3 can be done in a single pass since they are small changes. The entire feature is estimated at ~200 lines of new code plus ~30 lines of modifications to existing files.

---

## Acceptance Criteria Mapping

| AC | Description | Unit |
|----|-------------|------|
| AC-1 | Editor opens for adding user description | A2 |
| AC-2 | Editor pre-populated with existing description | A2 |
| AC-3 | `--clear` removes description after confirmation | A2 |
| AC-4 | `--show` displays stored description | A2 |
| AC-5 | Empty editor clears description | A2 |
| AC-6 | `info` shows user description above business description | A5 |
| AC-7 | Web UI shows user description above business description | B2 |
| AC-8 | `search` matches against user description | A6 |
| AC-9 | `scan` preserves user description | A4 |
| AC-10 | `list` includes user description (truncated) | Deferred (see note) |
| AC-11 | Command documented in CLAUDE.md and --help | A3 + post-impl |

**Note on AC-10**: Adding a `userDescription` column to the `list` table may make it too wide. Following the precedent set by the tag feature (Section 11.14, Decision #2 in project-design.md), this can be deferred to a future enhancement or shown only with `--verbose`.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Code duplication between `notes.ts` and `user-desc.ts` (both have `resolveEntry`) | Accept duplication for now; both are small (~50 lines). A shared `resolveEntry` utility can be extracted in a future refactor. |
| Confusion between `userDescription`, `notes`, and `description` | Clear naming and distinct purposes: `userDescription` = concise recognition text, `notes` = private working notes, `description` = AI-generated analysis. |
| Web UI textarea size for long descriptions | Use a reasonably sized textarea (4-6 rows) with resize capability. |

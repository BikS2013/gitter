# Refined Request: User Description Feature

## Original Request

> "I want you to add a user description feature, in addition to business and technical descriptions, to allow users to make the repository easier to recognize and search. I want to present the user description on top of the business description in UI and CLI modes. I want you to allow the user to add, change or remove the user description through CLI. I want you to give user access to the editor to change the user description."

## Objective

Add a user-authored free-text description field to each registry entry. Unlike the existing `description.businessDescription` and `description.technicalDescription` (which are AI-generated via the `describe` command), the user description is written entirely by the user. Its purpose is to help users quickly recognize repositories and improve searchability across the registry.

## Scope

### In Scope

- New `userDescription` field on `RegistryEntry` (top-level, not nested inside `RepoDescription`)
- New CLI command `gitter user-desc [query]` to add, edit, or remove the user description via an editor
- Display of user description in CLI (`info` command) above the business description
- Display of user description in the web UI above the business description
- Include `userDescription` in the search index (the `searchEntries` function)
- Preserve `userDescription` across re-scans (same pattern as `notes`, `description`, `claudeSessions`, `tags`)
- Display of user description in the `list` command table (truncated if necessary)

### Out of Scope

- AI generation of user descriptions (this is strictly user-authored)
- Changes to the `describe` command behavior
- Changes to the `notes` command (notes and user description are separate features with different purposes: notes are private working notes; user description is a concise summary for recognition and search)

## Functional Requirements

### FR-1: Data Model

Add a new optional field `userDescription?: string` to the `RegistryEntry` interface in `src/types.ts`. This field is:
- Top-level on `RegistryEntry` (alongside `notes`, `tags`, etc.), NOT nested inside `RepoDescription`
- Plain text or markdown string
- Optional (undefined when not set)

Rationale for top-level placement: `RepoDescription` tracks AI-generated content with metadata (`generatedAt`, `generatedBy`). The user description is user-authored and does not need AI provenance metadata.

### FR-2: CLI Command -- `gitter user-desc [query]`

A new command following the same patterns as the existing `notes` command:

| Action | Invocation | Behavior |
|--------|-----------|----------|
| Add/Edit | `gitter user-desc [query]` | Opens `$EDITOR` with current value (or empty). Saves on close. |
| Remove | `gitter user-desc [query] --clear` | Prompts for confirmation, then removes the user description. |
| Show | `gitter user-desc [query] --show` | Displays the current user description to stdout without opening editor. |

Implementation pattern: Reuse the `resolveEntry` pattern from `notes.ts` (resolve by query or CWD, interactive select on multiple matches). Use `@inquirer/prompts` `editor()` with `output: process.stderr` and `postfix: '.md'`.

When the editor returns empty content, treat it as a removal (delete the field), same as the `notes` command pattern.

### FR-3: Display in CLI (`info` command)

In the `info` command output, display the user description in a new section placed **above** the existing description section. Display order:

1. Repository metadata (name, path, remotes, branches, etc.)
2. **User Description** section (new)
3. Description section (business + technical, existing)
4. Tags section (existing)
5. Claude Sessions section (existing)
6. Notes section (existing)

Format:
```
--- User Description ---
<user description text>
```

When absent, display: `User Description: (none -- run 'gitter user-desc' to add)`

### FR-4: Display in Web UI

In the web UI detail panel (`src/ui/html.ts`), render the user description **above** the business description section. When present, display it under a "User Description" heading. When absent, show no placeholder (to avoid clutter in the card view).

### FR-5: Searchability

Extend the `searchEntries` function in `src/registry.ts` to include `userDescription` in its case-insensitive partial match. Add it after the existing `repoName` and `localPath` checks:

```typescript
if (entry.userDescription?.toLowerCase().includes(q)) return true;
```

### FR-6: Preservation Across Re-scans

In the `scan` command (`src/commands/scan.ts`), preserve `userDescription` from the existing entry when re-scanning, following the same pattern used for `description`, `notes`, `claudeSessions`, and `tags`.

### FR-7: Display in `list` Command

In the `list` command table, add the user description as a column (truncated to a reasonable length, e.g., 40 characters) to help users quickly identify repositories at a glance. If this makes the table too wide, it may be shown only when a `--verbose` or `-v` flag is passed.

## Technical Constraints

1. **Editor integration**: Use `@inquirer/prompts` `editor()` (not `$EDITOR` directly) with `output: process.stderr` for shell function compatibility, matching the `notes` command pattern.
2. **No config fallbacks**: Follow the project convention of not substituting missing values with defaults. An absent `userDescription` simply means none has been set.
3. **Atomic registry writes**: All mutations to the registry must go through `loadRegistry()` / `saveRegistry()` with the existing atomic write mechanism.
4. **stdout/stderr discipline**: Interactive prompts write to stderr. Only machine-readable output (like `go` command paths) goes to stdout. The `user-desc` command may use stdout for `--show` output and console.log for success messages.
5. **Scan preservation pattern**: In `scan.ts`, preserve `userDescription` with: `if (existing?.userDescription) { metadata.userDescription = existing.userDescription; }`
6. **Registry mutation pattern**: Mutate the registry entry directly (not via `addOrUpdate`) to avoid overwriting other fields, consistent with how `describe` and `notes` commands work.

## Acceptance Criteria

1. **AC-1**: Running `gitter user-desc` inside a registered repo opens an editor. Saving text and closing the editor stores the user description in the registry.
2. **AC-2**: Running `gitter user-desc` again opens the editor pre-populated with the existing user description, allowing edits.
3. **AC-3**: Running `gitter user-desc --clear` removes the user description from the registry after confirmation.
4. **AC-4**: Running `gitter user-desc --show` displays the stored user description without opening an editor.
5. **AC-5**: Saving an empty editor clears the user description (same as `--clear` but without confirmation).
6. **AC-6**: `gitter info <query>` displays the user description above the business/technical description.
7. **AC-7**: The web UI displays the user description above the business description in the detail panel.
8. **AC-8**: `gitter search <term>` matches against user description content.
9. **AC-9**: Running `gitter scan` on a repo that already has a user description preserves it.
10. **AC-10**: The `gitter list` output includes user description information (full or truncated).
11. **AC-11**: The command is documented in the parent project's `CLAUDE.md` and the `--help` output.

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `userDescription?: string` to `RegistryEntry` |
| `src/commands/user-desc.ts` | New file: command handler (pattern from `notes.ts`) |
| `src/cli.ts` | Register `user-desc` command with Commander |
| `src/commands/info.ts` | Add user description display section above description |
| `src/commands/scan.ts` | Preserve `userDescription` across re-scans |
| `src/registry.ts` | Add `userDescription` to `searchEntries` filter |
| `src/ui/html.ts` | Render user description above business description |
| `src/commands/list.ts` | Add user description column (truncated) |
| `CLAUDE.md` (parent) | Document the new command |
| `CLAUDE.md` (parent project memory) | Update memory with new field |

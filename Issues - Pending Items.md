# Issues - Pending Items

## Pending Items

(none)

---

## Completed Items

### Fixed: Inconsistent stderr redirection for interactive prompts in remove.ts

- **File**: `src/commands/remove.ts`
- **Description**: The `select()` and `confirm()` prompts were not redirecting output to stderr, unlike `go.ts` and `info.ts`. Fixed by adding `{ output: process.stderr }` to both calls.
- **Fixed**: 2026-03-22

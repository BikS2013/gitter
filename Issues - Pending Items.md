# Issues - Pending Items

## Pending Items

### Architectural deviation: ai-client.ts combines client creation, API call, and response parsing

- **File**: `src/ai-client.ts`
- **Spec Reference**: Design Section 10.6 specifies `createAIClient()` and `generateDescription()` as separate exported functions, with `generateDescription()` returning `Promise<string>` (raw text). The implementation makes `createClient()` private, and `generateDescription()` returns `Promise<RepoDescription>` after performing response parsing internally. The response parsing (Section 10.8) was intended to live in `describe.ts`.
- **Impact**: Functional behavior is correct. The deviation reduces modularity (parsing is coupled with API calls) but works end-to-end. Consider refactoring if the parsing logic needs to be reused or tested independently.
- **Severity**: Low (non-breaking, design preference)

---

## Completed Items

### Fixed: Config JSON paths missing `ai.` prefix in ai-config.ts

- **File**: `src/ai-config.ts`
- **Description**: The `resolve()` calls used flat paths like `['provider']`, `['model']`, `['anthropic', 'apiKey']` instead of the spec-mandated `['ai', 'provider']`, `['ai', 'model']`, `['ai', 'anthropic', 'apiKey']` etc. This caused config.json lookups to fail when users structured their config file per the documented schema (`{ "ai": { "provider": "anthropic", ... } }`). The `throwMissing()` error messages were also updated to reference the correct dotted paths (e.g., `ai.provider` instead of `provider`).
- **Fixed**: 2026-03-22

### Fixed: Inconsistent stderr redirection for interactive prompts in remove.ts

- **File**: `src/commands/remove.ts`
- **Description**: The `select()` and `confirm()` prompts were not redirecting output to stderr, unlike `go.ts` and `info.ts`. Fixed by adding `{ output: process.stderr }` to both calls.
- **Fixed**: 2026-03-22

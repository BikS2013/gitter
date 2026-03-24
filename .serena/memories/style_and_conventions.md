# Code Style and Conventions

## TypeScript
- ESM modules (import/export, .js extensions in imports)
- Interfaces over types for data shapes
- JSDoc comments on interfaces and exported functions
- async/await for all command handlers
- No default/fallback config values - throw on missing config

## Patterns
- stdout/stderr discipline: `go` command writes ONLY path to stdout, everything else to stderr
- @inquirer/prompts configured with `output: process.stderr` for shell function compatibility
- Registry uses localPath as unique key (upsert behavior)
- Commands follow pattern: export async function xxxCommand(...): Promise<void>
- scan command preserves optional fields (description, notes, claudeSessions) across re-scans

## Naming
- camelCase for variables, functions, parameters
- PascalCase for interfaces and types
- kebab-case for file names
- Singular table names for databases

## No Test Framework
- Custom test scripts in test_scripts/ using npx tsx
- Tests use process.exit(1) on failure

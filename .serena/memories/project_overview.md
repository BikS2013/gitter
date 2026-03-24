# Gitter Project Overview

## Purpose
TypeScript CLI tool that maintains a persistent registry of local git repositories, enabling scanning, searching, navigating, and managing repos from the terminal. Includes AI-powered descriptions, a web UI, and Claude Code session tracking.

## Tech Stack
- TypeScript, Node.js, ESM modules
- commander.js (CLI), @inquirer/prompts (interactive), picocolors (colors), cli-table3 (tables)
- @anthropic-ai/sdk, @anthropic-ai/foundry-sdk, @anthropic-ai/vertex-sdk (AI)
- dotenv (config loading)
- Build: tsx (dev), tsc (production)

## Project Structure
- `src/cli.ts` - Entry point with Commander program (12 commands)
- `src/types.ts` - All interfaces (Remote, RegistryEntry, Registry, RepoDescription, ClaudeSession, AIConfig, AIProvider)
- `src/git.ts` - Git CLI wrappers using execFileSync
- `src/registry.ts` - JSON registry at ~/.gitter/registry.json with atomic writes
- `src/ai-config.ts` - AI config loading (env vars > .env > config.json)
- `src/ai-client.ts` - Claude API client factory
- `src/repo-content.ts` - Repo content collector for AI analysis
- `src/commands/` - Command handlers (scan, list, search, go, info, remove, init, describe, rename, notes, remember-claude, ui)
- `src/ui/html.ts` - Single-page HTML app (template literal)
- `src/ui/server.ts` - HTTP server (Node.js built-in)
- `test_scripts/` - Custom test scripts
- `docs/design/` - Plans and design docs
- `docs/reference/` - Investigation and research docs

## Registry
- Stored at `~/.gitter/registry.json`
- Uses `localPath` as unique key (upsert behavior)
- Atomic writes via write-to-temp-then-rename

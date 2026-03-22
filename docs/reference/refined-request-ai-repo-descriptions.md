# Refined Request: AI-Powered Repository Descriptions

## Document Info

| Field | Value |
|-------|-------|
| Project | gitter |
| Feature | AI Repository Descriptions |
| Date | 2026-03-22 |
| Status | Refined |
| Based On | Raw user request for Claude SDK integration |

---

## 1. Feature Summary

Enhance the gitter CLI with an AI-powered `describe` command that uses the Anthropic Claude SDK to analyze a registered git repository's contents and generate structured descriptions. The descriptions capture both the business value and technical approach of the project, are stored persistently in the registry, and can be displayed on demand.

---

## 2. Functional Requirements

### FR-12: Generate AI Repository Description (`describe` command)

**Command**: `gitter describe [query]`

**Description**: Analyze a registered repository using Claude AI and generate a structured description consisting of two sections: a business description and a technical description.

**Behavior**:

1. If `[query]` is omitted and CWD is inside a registered git repo, use the current repo.
2. If `[query]` is omitted and CWD is not a registered repo, print error to stderr and exit(1).
3. If `[query]` is provided, search the registry (same logic as `info`/`go`):
   - 0 matches: stderr error, exit(1)
   - 1 match: use that entry
   - N matches: interactive select via stderr
4. Collect repository content (see Section 4: Repo Content Strategy) from the entry's `localPath`.
5. Send the collected content to Claude along with the prompt (see Section 5: Prompt Design).
6. Parse the AI response and store the description in the registry entry.
7. Display the generated description to the terminal.

**Options**:

| Option | Type | Description |
|--------|------|-------------|
| `--instructions <text>` | string | Additional user instructions to guide the AI (e.g., "focus on the security aspects", "emphasize the microservices architecture"). Appended to the system prompt. |
| `--show` | flag | Display the stored description without regenerating. If no description exists, print a message suggesting the user run `gitter describe` first. |
| `--business-lines <n>` | number | Override the default 20-line target for the business description. |
| `--technical-lines <n>` | number | Override the default 20-line target for the technical description. |

**Default Description Structure**:
- **Business Description** (~20 lines): Purpose, use cases, target audience, value proposition, problem it solves.
- **Technical Description** (~20 lines): Architecture, technology stack, design patterns, technical differentiators, approach.

**Refinement / Iterative Use**:
- When a description already exists in the registry for the target repo, the existing description is included in the prompt context sent to Claude.
- This enables scenarios such as:
  - `gitter describe myrepo` -- initial generation
  - `gitter describe myrepo --instructions "expand on the CI/CD pipeline details"` -- refine the existing description
  - `gitter describe myrepo --instructions "make the business description more concise"` -- iterative editing
- The AI is instructed to treat the existing description as a starting point and apply the user's instructions as refinements.
- Each generation fully replaces the stored description (no versioning of old descriptions).

---

### FR-13: Display Stored Description (`describe --show`)

**Command**: `gitter describe [query] --show`

**Description**: Display the stored AI-generated description for a repository without invoking the AI.

**Behavior**:
1. Resolve the target repository (same logic as FR-12 steps 1-3).
2. If the entry has a stored description, render it to the terminal in formatted markdown.
3. If the entry has no description, print: `"No description available for <repoName>. Run 'gitter describe' to generate one."` and exit(0).

**Display Format**:
- Use picocolors for headers (bold).
- Render markdown content as-is to the terminal (the description is stored in markdown format).
- Include a footer showing when the description was last generated.

---

### FR-14: Show Description in `info` Command

**Command**: `gitter info <query>` (existing command, extended)

**Description**: Extend the existing `info` command to display the stored description (if available) as an additional section at the end of the output.

**Behavior**:
- After existing metadata output, if the entry has a `description` field:
  - Print a separator line
  - Print `"Business Description:"` header (bold) followed by the business description text
  - Print `"Technical Description:"` header (bold) followed by the technical description text
  - Print `"Description Generated:"` with the timestamp
- If no description exists, append: `"Description: (none -- run 'gitter describe' to generate)"`

---

## 3. Configuration Requirements

### FR-15: Claude API Configuration

**Location**: `~/.gitter/config.json` (same directory as registry.json)

**Configuration Priority** (highest to lowest):
1. Environment variables
2. `.env` file in CWD (loaded at startup)
3. `~/.gitter/config.json`

If a required configuration value is not found in any source, the tool must throw a clear error explaining what is missing and how to set it. No fallback or default values are permitted for API credentials or endpoints.

**Supported Providers**:

The `@anthropic-ai/sdk` npm package natively supports all three providers through different client classes. The tool must support:

| Provider | SDK Client Class | Required Config |
|----------|-----------------|-----------------|
| Anthropic (direct) | `Anthropic` | `apiKey` |
| Azure (Claude on Azure) | `AnthropicBedrock` or Azure-specific | `azureApiKey`, `azureEndpoint`, `azureApiVersion`, `azureDeployment` |
| Google Vertex AI | `AnthropicVertex` | `gcpProjectId`, `gcpRegion` (uses ADC for auth) |

**Config File Schema** (`~/.gitter/config.json`):

```json
{
  "ai": {
    "provider": "anthropic | azure | vertex",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 4096,
    "anthropic": {
      "apiKey": "sk-ant-..."
    },
    "azure": {
      "apiKey": "...",
      "endpoint": "https://<resource>.openai.azure.com",
      "apiVersion": "2024-06-01",
      "deployment": "claude-sonnet"
    },
    "vertex": {
      "projectId": "my-gcp-project",
      "region": "us-east5"
    }
  }
}
```

**Environment Variable Mapping**:

| Config Key | Environment Variable | Description |
|------------|---------------------|-------------|
| `ai.provider` | `GITTER_AI_PROVIDER` | Which Claude provider to use: `anthropic`, `azure`, or `vertex` |
| `ai.model` | `GITTER_AI_MODEL` | Claude model identifier (e.g., `claude-sonnet-4-20250514`) |
| `ai.maxTokens` | `GITTER_AI_MAX_TOKENS` | Maximum tokens for the AI response |
| `ai.anthropic.apiKey` | `ANTHROPIC_API_KEY` | API key for direct Anthropic access |
| `ai.azure.apiKey` | `AZURE_API_KEY` | API key for Azure Claude deployment |
| `ai.azure.endpoint` | `AZURE_ENDPOINT` | Azure resource endpoint URL |
| `ai.azure.apiVersion` | `AZURE_API_VERSION` | Azure API version string |
| `ai.azure.deployment` | `AZURE_DEPLOYMENT` | Azure deployment name |
| `ai.vertex.projectId` | `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `ai.vertex.region` | `GOOGLE_CLOUD_REGION` | GCP region for Vertex AI |

**Note on `.env` file**: Use the `dotenv` package to load `.env` from CWD before resolving config. Environment variables set in the shell take precedence over `.env` values (standard dotenv behavior).

**Required Config by Provider**:

| Provider | Required Fields |
|----------|----------------|
| `anthropic` | `provider`, `model`, `anthropic.apiKey` |
| `azure` | `provider`, `model`, `azure.apiKey`, `azure.endpoint`, `azure.apiVersion`, `azure.deployment` |
| `vertex` | `provider`, `model`, `vertex.projectId`, `vertex.region` |

**Error Examples** (when config is missing):

```
Error: GITTER_AI_PROVIDER is not set. Configure via:
  - Environment variable: export GITTER_AI_PROVIDER=anthropic
  - Config file: set "ai.provider" in ~/.gitter/config.json
  - .env file: add GITTER_AI_PROVIDER=anthropic to .env in your project directory
```

---

## 4. Repository Content Strategy

### What to Send to Claude

The tool must collect the following from the target repository and include it in the Claude prompt:

| Content | Method | Max Size | Priority |
|---------|--------|----------|----------|
| File tree | `git ls-tree -r --name-only HEAD` | First 500 entries | Required |
| README.md (or README, README.rst) | Read file | First 200 lines | Required if exists |
| package.json / Cargo.toml / pyproject.toml / go.mod / pom.xml | Read file | Full file | Required if exists |
| CLAUDE.md / .cursor/rules | Read file | First 100 lines | Optional if exists |
| Key source files (src/main.*, src/index.*, src/app.*, src/lib.*) | Read file | First 100 lines each | Optional if exists |
| .github/workflows/*.yml | Read file | First 50 lines each, max 3 files | Optional if exists |
| Existing description (if any) | From registry | Full text | Required if exists |

**Token Budget Considerations**:
- Target total prompt size: under 30,000 tokens (approximately 120KB of text).
- The file tree and README provide the most signal; prioritize these.
- If total collected content exceeds 120KB, truncate lower-priority items first.
- The tool should log (to stderr) the approximate size of content being sent.

### Content Collection Implementation

A new module `src/repo-content.ts` should handle content collection:

```typescript
export interface RepoContent {
  fileTree: string;        // git ls-tree output (truncated)
  readme: string | null;   // README content or null
  manifest: string | null; // package.json / Cargo.toml / etc. or null
  projectDocs: string[];   // CLAUDE.md, .cursor/rules, etc.
  sourceSnippets: string[];// Key source file excerpts
  ciConfigs: string[];     // CI/CD config excerpts
}

/**
 * Collect repository content for AI analysis.
 * @param repoPath - Absolute path to the repository root
 * @returns Structured repo content, truncated to fit token budget
 */
export function collectRepoContent(repoPath: string): RepoContent;

/**
 * Format collected content into a single string for the AI prompt.
 * @param content - The collected RepoContent
 * @returns Formatted string suitable for inclusion in a Claude message
 */
export function formatRepoContentForPrompt(content: RepoContent): string;
```

---

## 5. Prompt Design

### System Prompt

```
You are a technical writer analyzing a software repository. Your task is to produce
two descriptions of the repository:

1. BUSINESS DESCRIPTION (~{businessLines} lines): Explain the purpose, use cases,
   target audience, and value proposition of the project. Write for a non-technical
   stakeholder or decision-maker. Focus on what problem the project solves and why
   it matters.

2. TECHNICAL DESCRIPTION (~{technicalLines} lines): Explain the architecture,
   technology stack, design patterns, and technical approach. Write for a developer
   or technical lead evaluating the project. Focus on how the project works and what
   makes it technically interesting or sound.

Output format: Use markdown. Start the business description with "## Business Description"
and the technical description with "## Technical Description". Do not include any other
top-level headings or preamble.
```

### User Message Construction

```
Repository: {repoName}
Path: {localPath}

{if existingDescription}
=== EXISTING DESCRIPTION (use as starting point, refine as instructed) ===
{existingDescription}
=== END EXISTING DESCRIPTION ===
{endif}

{if userInstructions}
=== ADDITIONAL INSTRUCTIONS ===
{userInstructions}
=== END ADDITIONAL INSTRUCTIONS ===
{endif}

=== REPOSITORY CONTENT ===
{formattedRepoContent}
=== END REPOSITORY CONTENT ===
```

---

## 6. Data Model Changes

### RegistryEntry Extension

Add the following optional fields to `RegistryEntry` in `src/types.ts`:

```typescript
export interface RepoDescription {
  /** Business-oriented description in markdown */
  businessDescription: string;
  /** Technical description in markdown */
  technicalDescription: string;
  /** ISO 8601 timestamp of when this description was generated */
  generatedAt: string;
  /** The AI model used to generate this description */
  generatedBy: string;
  /** User instructions that were used (if any) */
  instructions?: string;
}

export interface RegistryEntry {
  // ... existing fields ...

  /** AI-generated description of the repository (optional, populated by describe command) */
  description?: RepoDescription;
}
```

### Registry Schema Version

The registry `version` should remain `1` since the new field is optional and backward-compatible. Existing registries without `description` fields will work without migration.

---

## 7. New Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@anthropic-ai/sdk` | Claude API client (supports Anthropic, Azure, Vertex) | Production dependency |
| `dotenv` | Load `.env` files for configuration | Production dependency |

---

## 8. New Modules

| Module | Purpose |
|--------|---------|
| `src/ai-config.ts` | Load and validate AI configuration from env vars, .env, and config.json |
| `src/ai-client.ts` | Create the appropriate Claude client based on provider config |
| `src/repo-content.ts` | Collect and format repository content for AI analysis |
| `src/commands/describe.ts` | The `describe` command handler |

---

## 9. Error Handling

| Scenario | Behavior | Exit Code |
|----------|----------|:---------:|
| No AI provider configured | Error: "AI provider not configured. Set GITTER_AI_PROVIDER or configure in ~/.gitter/config.json" | 1 |
| Missing API key for selected provider | Error: "API key not found for provider '<provider>'. Set <ENV_VAR> or configure in ~/.gitter/config.json" | 1 |
| AI model not configured | Error: "AI model not configured. Set GITTER_AI_MODEL or configure in ~/.gitter/config.json" | 1 |
| Claude API call fails (network) | Error: "Failed to connect to Claude API: <details>" | 1 |
| Claude API call fails (auth) | Error: "Authentication failed for Claude API. Check your API key/credentials." | 1 |
| Claude API call fails (rate limit) | Error: "Rate limited by Claude API. Please try again later." | 1 |
| Claude response parsing fails | Error: "Failed to parse AI response. Please try again." | 1 |
| Repository path does not exist | Error: "Repository path no longer exists: <path>" | 1 |
| `--show` with no stored description | Info message (not error), exit(0) | 0 |
| Config file is malformed JSON | Error: "Config file is corrupted: ~/.gitter/config.json" | 1 |

---

## 10. Command-Line Interface Integration

### CLI Registration in `src/cli.ts`

```typescript
program
  .command('describe [query]')
  .description('Generate or show AI-powered repository description')
  .option('--instructions <text>', 'Additional instructions for the AI')
  .option('--show', 'Show stored description without regenerating')
  .option('--business-lines <n>', 'Target line count for business description', '20')
  .option('--technical-lines <n>', 'Target line count for technical description', '20')
  .action(describeCommand);
```

### Usage Examples

```bash
# Generate description for current repo (must be inside a registered git repo)
gitter describe

# Generate description for a specific registered repo
gitter describe myproject

# Generate with custom instructions
gitter describe myproject --instructions "focus on the machine learning pipeline"

# Refine an existing description
gitter describe myproject --instructions "make the business description shorter and punchier"

# View stored description
gitter describe myproject --show

# Generate with custom line counts
gitter describe myproject --business-lines 10 --technical-lines 30

# View description via info command
gitter info myproject
```

---

## 11. Architecture Integration

### Updated Component Diagram (additions in bold)

```
+------------------------------------------------------------------+
|                      CLI ENTRY POINT (src/cli.ts)                 |
|                                                                   |
|  Subcommands:                                                     |
|    scan | list | search | go | info | remove | init | **describe**|
+---------|--------------------------------------------------------+
          |
          v
+------------------------------------------------------------------+
|                   COMMAND HANDLERS (src/commands/*.ts)             |
|                                                                   |
|  ... (existing) ...                                               |
|  **describe.ts -> ai-config + ai-client + repo-content + registry |
+--------|-----------------------------|---------------------------+
         |                             |
         v                             v
+-------------------------+  +---------------------------+
|  **AI MODULES**         |  |  REGISTRY MODULE          |
|  (src/ai-config.ts)     |  |  (src/registry.ts)        |
|  (src/ai-client.ts)     |  |  + description storage    |
|  (src/repo-content.ts)  |  |                           |
+--------+----------------+  +---------------------------+
         |
         v
+-------------------------+
|  @anthropic-ai/sdk      |
|  (Claude API)           |
+-------------------------+
```

### Data Flow: `gitter describe myproject`

```
query --> registry.searchEntries()
            |
            v
          resolve to single RegistryEntry
            |
            v
          repo-content.collectRepoContent(entry.localPath)
            |
            v
          ai-config.loadAIConfig()
            |
            v
          ai-client.createClient(config)
            |
            v
          Build prompt (system + user message with repo content)
            |
            +--> include existing description if present
            +--> include user --instructions if provided
            |
            v
          Claude API call (messages.create)
            |
            v
          Parse response -> RepoDescription
            |
            v
          Update RegistryEntry.description
            |
            v
          registry.saveRegistry()
            |
            v
          Display description to terminal
```

---

## 12. Open Questions and Design Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should `describe` require the repo to be already registered? | **Yes**. The repo must be in the registry (scanned first). This ensures we have metadata and a consistent localPath. If the user runs `describe` in an unregistered repo, suggest they run `gitter scan` first. |
| 2 | Should we store description history/versions? | **No** (v1). Each `describe` call replaces the previous description. The `instructions` field records what was last used. If versioning is needed, it can be added later. |
| 3 | Should the `--show` flag work without AI configuration? | **Yes**. `--show` only reads from the registry, no AI call needed. AI config is only validated when actually generating a description. |
| 4 | What default model to use? | No default. The model must be explicitly configured. This avoids unexpected costs if Anthropic changes pricing or model availability. |
| 5 | Should config.json be created automatically? | **No**. The config file is optional. If the user wants file-based config, they create `~/.gitter/config.json` manually. The tool should never auto-create it. |
| 6 | Should `describe` work on repos whose path is [MISSING]? | **No**. The repo content must be readable from disk. If the path is missing, print error and exit(1). |
| 7 | How to handle very large repositories? | Truncate content per the token budget strategy in Section 4. Log a warning to stderr if content was truncated. |
| 8 | Should there be a `--dry-run` to preview what content will be sent? | **Deferred** to a future version. For now, the stderr log of content size provides some visibility. |
| 9 | What about the default line count values (20 lines)? | These are command-line argument defaults, not configuration fallbacks. They are part of the CLI interface definition, not the config system. This is acceptable per the no-fallback-config rule since they are UX defaults for optional parameters, not configuration settings. |
| 10 | Should we support streaming responses? | **Deferred** to a future version. For v1, use a simple blocking API call with a spinner/progress indicator on stderr. |

---

## 13. Out of Scope (v1)

- Description versioning/history
- Dry-run mode to preview content sent to AI
- Streaming API responses
- Custom prompt templates stored in config
- Batch description generation across multiple repos
- Cost estimation before API call
- Caching/rate-limiting of API calls
- Support for non-Claude AI providers (OpenAI, etc.)

---

## 14. Implementation Phases (Suggested)

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| 1 | Add `RepoDescription` type to `types.ts` | None |
| 2 | Implement `src/ai-config.ts` (config loading with priority resolution) | `dotenv` package |
| 3 | Implement `src/ai-client.ts` (multi-provider Claude client factory) | `@anthropic-ai/sdk` package |
| 4 | Implement `src/repo-content.ts` (content collection and formatting) | Existing `git.ts` |
| 5 | Implement `src/commands/describe.ts` (command handler) | Phases 1-4 |
| 6 | Extend `src/commands/info.ts` to show descriptions | Phase 1 |
| 7 | Register `describe` command in `src/cli.ts` | Phase 5 |
| 8 | Update project documentation and configuration guide | All phases |

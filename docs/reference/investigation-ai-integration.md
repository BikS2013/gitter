# Investigation: Claude SDK Multi-Provider Integration for TypeScript CLI

## Document Info

| Field | Value |
|-------|-------|
| Project | gitter |
| Purpose | Technical investigation for AI-powered repo description feature |
| Date | 2026-03-22 |
| Status | Complete |
| Based On | `refined-request-ai-repo-descriptions.md`, `codebase-scan-ai-enhancement.md` |

---

## 1. Anthropic TypeScript SDK -- Package Architecture

### Key Finding: Separate Packages per Provider

The `@anthropic-ai/sdk` ecosystem is split into **four separate npm packages**, each targeting a specific provider. They all share the same `messages.create()` API surface, making them interchangeable at the call site.

| Package | Provider | Import |
|---------|----------|--------|
| `@anthropic-ai/sdk` | Direct Anthropic API | `import Anthropic from '@anthropic-ai/sdk'` |
| `@anthropic-ai/foundry-sdk` | Azure AI Foundry (Claude on Azure) | `import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk'` |
| `@anthropic-ai/vertex-sdk` | Google Vertex AI | `import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'` |
| `@anthropic-ai/bedrock-sdk` | AWS Bedrock | `import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'` |

**Important**: The refined request mentioned `AnthropicBedrock` as a possible Azure client class -- this is incorrect. Azure uses the **Foundry SDK** (`@anthropic-ai/foundry-sdk`), not the Bedrock SDK. The Bedrock SDK is for AWS only.

### Installation

```bash
npm install @anthropic-ai/sdk @anthropic-ai/foundry-sdk @anthropic-ai/vertex-sdk
```

All three packages must be installed as production dependencies. The `@anthropic-ai/bedrock-sdk` (AWS) is **not needed** for our three-provider requirement.

### ESM Compatibility

All packages support ESM imports. Since the gitter project uses `"type": "module"` in `package.json` and `module: "Node16"` in `tsconfig.json`, standard ESM imports work directly:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
```

In the compiled output, these will use `.js` extensions for local imports but npm package imports remain as package specifiers (no `.js` needed).

---

## 2. Provider Client Construction

### 2.1 Direct Anthropic

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'sk-ant-...',  // Required. Defaults to process.env.ANTHROPIC_API_KEY
});
```

**Constructor Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `apiKey` | string | Yes | `process.env.ANTHROPIC_API_KEY` | Anthropic API key |
| `baseURL` | string | No | `https://api.anthropic.com` | API base URL |
| `timeout` | number | No | 600000 (10 min) | Request timeout in ms |
| `maxRetries` | number | No | 2 | Retry attempts on failure |
| `defaultHeaders` | object | No | - | Custom headers for every request |

**Model Name Format**: Standard Anthropic model IDs, e.g.:
- `claude-sonnet-4-20250514`
- `claude-sonnet-4-5-20250929`
- `claude-3-5-sonnet-20241022`

### 2.2 Azure AI Foundry (Claude on Azure)

```typescript
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';

// Option A: API Key authentication
const client = new AnthropicFoundry({
  apiKey: 'your-azure-api-key',  // Defaults to process.env.ANTHROPIC_FOUNDRY_API_KEY
  resource: 'example-resource.azure.anthropic.com',  // Azure resource endpoint
});

// Option B: Microsoft Entra ID (Azure AD) authentication
import { getBearerTokenProvider, DefaultAzureCredential } from '@azure/identity';

const credential = new DefaultAzureCredential();
const scope = 'https://ai.azure.com/.default';
const azureADTokenProvider = getBearerTokenProvider(credential, scope);

const client = new AnthropicFoundry({
  azureADTokenProvider,
  resource: 'example-resource.azure.anthropic.com',
});
```

**Constructor Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `apiKey` | string | Yes (unless using Entra ID) | `process.env.ANTHROPIC_FOUNDRY_API_KEY` | Azure API key |
| `resource` | string | Yes | - | Azure resource hostname (e.g., `my-resource.azure.anthropic.com`) |
| `azureADTokenProvider` | function | No (alternative to apiKey) | - | Microsoft Entra ID token provider |

**Model Name Format**: Standard Anthropic model IDs (same as direct Anthropic):
- `claude-3-5-sonnet-20241022`
- `claude-sonnet-4-20250514`

**Critical Difference from Refined Request**: The refined request specified Azure config fields as `endpoint`, `apiVersion`, and `deployment`. However, the actual Foundry SDK uses a `resource` parameter (hostname only, not a full URL) and does **not** require `apiVersion` or `deployment` as separate parameters. The model is specified in the `messages.create()` call, not in the constructor.

### 2.3 Google Vertex AI

```typescript
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

const client = new AnthropicVertex({
  region: 'us-east5',           // Defaults to process.env.CLOUD_ML_REGION
  projectId: 'my-gcp-project',  // Defaults to process.env.ANTHROPIC_VERTEX_PROJECT_ID
});
```

**Constructor Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectId` | string | Yes | `process.env.ANTHROPIC_VERTEX_PROJECT_ID` | GCP project ID |
| `region` | string | Yes | `process.env.CLOUD_ML_REGION` | GCP region (e.g., `us-east5`, `us-central1`, `europe-west1`) |

**Authentication**: Uses Google Application Default Credentials (ADC) via the `google-auth-library`. No API key needed. The user must have:
- `gcloud auth application-default login` run locally, OR
- `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to a service account key file, OR
- Running on GCP with a service account attached

**Model Name Format**: Vertex AI uses a different naming convention with `@` instead of `-`:
- `claude-3-5-sonnet-v2@20241022` (not `claude-3-5-sonnet-20241022`)
- `claude-sonnet-4@20250514`

This is an important difference -- the `ai-client.ts` factory should document that the model name configured by the user must match the provider's expected format.

---

## 3. Messages API -- Unified Interface

All three provider clients expose the identical `messages.create()` API:

```typescript
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: 'You are a technical writer analyzing a software repository...',
  messages: [
    {
      role: 'user',
      content: 'Repository: my-project\n\n=== REPOSITORY CONTENT ===\n...'
    }
  ],
});
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model identifier (format varies by provider) |
| `max_tokens` | number | Yes | Maximum tokens in the response |
| `system` | string or ContentBlock[] | No | System prompt |
| `messages` | Message[] | Yes | Conversation messages array |

### System Prompt

The system prompt is a **top-level parameter** on `messages.create()`, not a message in the `messages` array:

```typescript
const message = await client.messages.create({
  model: '...',
  max_tokens: 4096,
  system: 'You are a technical writer...',  // <-- system prompt here
  messages: [
    { role: 'user', content: '...' }        // <-- user message only
  ],
});
```

### Response Format

```typescript
interface Message {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];  // Array of content blocks
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Content blocks are typically text:
interface TextBlock {
  type: 'text';
  text: string;
}
```

### Extracting Text from Response

```typescript
const response = await client.messages.create({...});

// The response content is an array of blocks
// For simple text responses, there is typically one text block:
const textContent = response.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('\n');
```

### Non-Streaming (Recommended for v1)

The simple `messages.create()` call returns the full response. No streaming needed for v1. A spinner on stderr can indicate progress while waiting.

---

## 4. Client Factory Design

Based on the investigation, here is the recommended design for `src/ai-client.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

type AIClient = Anthropic | AnthropicFoundry | AnthropicVertex;

export function createAIClient(config: AIConfig): AIClient {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({
        apiKey: config.anthropic.apiKey,
      });

    case 'azure':
      return new AnthropicFoundry({
        apiKey: config.azure.apiKey,
        resource: config.azure.resource,
      });

    case 'vertex':
      return new AnthropicVertex({
        projectId: config.vertex.projectId,
        region: config.vertex.region,
      });

    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
```

### Polymorphic Usage

All three client types share the same `messages.create()` signature, so downstream code does not need to know which provider is active:

```typescript
const client = createAIClient(config);
const response = await client.messages.create({
  model: config.model,
  max_tokens: config.maxTokens,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
});
```

---

## 5. Configuration Management

### 5.1 dotenv for .env Loading

```bash
npm install dotenv
```

```typescript
import dotenv from 'dotenv';

// Load .env from CWD. Does NOT override existing env vars (standard behavior).
dotenv.config();
```

**Behavior**: `dotenv.config()` reads `.env` from the current working directory. If a variable is already set in the shell environment, the `.env` value is ignored. This naturally implements the priority: `env vars > .env`.

### 5.2 Config File at `~/.gitter/config.json`

The `getRegistryDir()` function in `registry.ts` already returns `~/.gitter/`. The config file lives in the same directory:

```typescript
import { getRegistryDir } from './registry.js';
import path from 'node:path';
import fs from 'node:fs';

function loadConfigFile(): Record<string, unknown> | null {
  const configPath = path.join(getRegistryDir(), 'config.json');
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}
```

### 5.3 Priority Resolution

```
1. Environment variables (shell + .env)  -- highest priority
2. ~/.gitter/config.json                 -- lowest priority
```

Implementation approach:

```typescript
function resolve(envVar: string, configPath: string[]): string | undefined {
  // Priority 1: Environment variable (already includes .env via dotenv)
  const envValue = process.env[envVar];
  if (envValue !== undefined) return envValue;

  // Priority 2: Config file
  const config = loadConfigFile();
  if (config) {
    let value: unknown = config;
    for (const key of configPath) {
      value = (value as Record<string, unknown>)?.[key];
    }
    if (typeof value === 'string') return value;
  }

  return undefined;
}
```

### 5.4 Revised Config Schema

Based on investigation findings, the Azure config in `config.json` should be updated to reflect the actual Foundry SDK parameters:

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
      "resource": "my-resource.azure.anthropic.com"
    },
    "vertex": {
      "projectId": "my-gcp-project",
      "region": "us-east5"
    }
  }
}
```

### 5.5 Revised Environment Variable Mapping

| Config Path | Environment Variable | Description |
|-------------|---------------------|-------------|
| `ai.provider` | `GITTER_AI_PROVIDER` | Provider: `anthropic`, `azure`, or `vertex` |
| `ai.model` | `GITTER_AI_MODEL` | Model identifier |
| `ai.maxTokens` | `GITTER_AI_MAX_TOKENS` | Max response tokens |
| `ai.anthropic.apiKey` | `ANTHROPIC_API_KEY` | Direct Anthropic API key |
| `ai.azure.apiKey` | `ANTHROPIC_FOUNDRY_API_KEY` | Azure Foundry API key |
| `ai.azure.resource` | `ANTHROPIC_FOUNDRY_RESOURCE` | Azure resource hostname |
| `ai.vertex.projectId` | `ANTHROPIC_VERTEX_PROJECT_ID` | GCP project ID |
| `ai.vertex.region` | `CLOUD_ML_REGION` | GCP region |

**Note**: The env var names for Azure and Vertex are aligned with the SDK defaults (`ANTHROPIC_FOUNDRY_API_KEY`, `ANTHROPIC_VERTEX_PROJECT_ID`, `CLOUD_ML_REGION`). This means users who set these for other tools will automatically have gitter work without extra configuration.

---

## 6. Repository Content Collection Strategy

### 6.1 What to Collect

| Content | Command / Method | Truncation | Priority |
|---------|-----------------|------------|----------|
| File tree | `git ls-tree -r --name-only HEAD` in repo dir | First 500 lines | P1 -- Required |
| README | Read `README.md`, `README`, or `README.rst` | First 200 lines | P1 -- Required if exists |
| Manifest | Read `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml` | Full file | P1 -- Required if exists |
| Project docs | Read `CLAUDE.md`, `.cursor/rules` | First 100 lines each | P2 -- Optional |
| Entry points | Read `src/main.*`, `src/index.*`, `src/app.*`, `src/lib.*` | First 100 lines each | P2 -- Optional |
| CI configs | Read `.github/workflows/*.yml` | First 50 lines each, max 3 | P3 -- Optional |
| Existing description | From registry entry | Full text | P1 -- Required if exists |

### 6.2 Token Budget

- Target: under 30,000 tokens (~120KB of text)
- 1 token is approximately 4 characters of English text
- If collected content exceeds 120KB, truncate P3 items first, then P2, preserving P1

### 6.3 File Tree Generation

```typescript
import { git } from './git.js';

function getFileTree(repoPath: string): string {
  const output = git(['ls-tree', '-r', '--name-only', 'HEAD'], repoPath);
  const lines = output.split('\n');
  if (lines.length > 500) {
    return lines.slice(0, 500).join('\n') + `\n... (${lines.length - 500} more files)`;
  }
  return output;
}
```

The existing `git()` function in `src/git.ts` supports a `cwd` parameter and has a 10-second timeout, which should be sufficient.

### 6.4 File Reading Helper

```typescript
import fs from 'node:fs';
import path from 'node:path';

function readFileHead(repoPath: string, relativePath: string, maxLines: number): string | null {
  const fullPath = path.join(repoPath, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n') + `\n... (truncated at ${maxLines} lines)`;
  }
  return content;
}
```

### 6.5 Manifest Detection

Check for manifest files in priority order and return the first match:

```typescript
const MANIFEST_FILES = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Gemfile',
];
```

### 6.6 Formatted Output

```typescript
function formatRepoContentForPrompt(content: RepoContent): string {
  const sections: string[] = [];

  sections.push('--- FILE TREE ---');
  sections.push(content.fileTree);

  if (content.readme) {
    sections.push('\n--- README ---');
    sections.push(content.readme);
  }

  if (content.manifest) {
    sections.push('\n--- PROJECT MANIFEST ---');
    sections.push(content.manifest);
  }

  for (const doc of content.projectDocs) {
    sections.push(`\n--- PROJECT DOCUMENTATION ---`);
    sections.push(doc);
  }

  for (const snippet of content.sourceSnippets) {
    sections.push(`\n--- SOURCE FILE ---`);
    sections.push(snippet);
  }

  for (const ci of content.ciConfigs) {
    sections.push(`\n--- CI/CD CONFIG ---`);
    sections.push(ci);
  }

  return sections.join('\n');
}
```

---

## 7. Prompt Engineering

### 7.1 System Prompt

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

### 7.2 User Message Construction

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

### 7.3 Response Parsing

The response will contain two markdown sections. Parse them by splitting on the `## Technical Description` heading:

```typescript
function parseDescription(responseText: string): { business: string; technical: string } {
  const techIndex = responseText.indexOf('## Technical Description');
  if (techIndex === -1) {
    throw new Error('Failed to parse AI response: missing "## Technical Description" heading');
  }

  const businessSection = responseText.substring(0, techIndex).trim();
  const technicalSection = responseText.substring(techIndex).trim();

  // Remove the "## Business Description" heading from the business section
  const business = businessSection
    .replace(/^## Business Description\s*/i, '')
    .trim();

  // Remove the "## Technical Description" heading from the technical section
  const technical = technicalSection
    .replace(/^## Technical Description\s*/i, '')
    .trim();

  return { business, technical };
}
```

### 7.4 Refinement Flow

When an existing description is present, the user message includes it in the `EXISTING DESCRIPTION` block. The AI is instructed to treat it as a starting point. Combined with `--instructions`, this enables iterative refinement:

1. First run: No existing description, no instructions -- generates from scratch
2. Refinement: Existing description included, instructions say "expand on CI/CD details"
3. The AI reads both and produces an updated version

---

## 8. Corrections to Refined Request

The investigation revealed several corrections needed to the refined request:

### 8.1 Azure Provider -- SDK Package Correction

| Aspect | Refined Request Says | Actual |
|--------|---------------------|--------|
| SDK Package | `@anthropic-ai/sdk` (single package for all) | **Separate packages**: `@anthropic-ai/sdk`, `@anthropic-ai/foundry-sdk`, `@anthropic-ai/vertex-sdk` |
| Azure Client Class | `AnthropicBedrock` or "Azure-specific" | **`AnthropicFoundry`** from `@anthropic-ai/foundry-sdk` |
| Azure Config Fields | `apiKey`, `endpoint`, `apiVersion`, `deployment` | **`apiKey`, `resource`** only (resource is a hostname, not full URL) |

### 8.2 Azure Config Simplification

The `apiVersion` and `deployment` fields specified in the refined request are **not used** by the Foundry SDK. The model is specified per-request in `messages.create()`, and the API version is handled internally by the SDK. The config schema should be simplified:

**Before** (refined request):
```json
"azure": {
  "apiKey": "...",
  "endpoint": "https://<resource>.openai.azure.com",
  "apiVersion": "2024-06-01",
  "deployment": "claude-sonnet"
}
```

**After** (corrected):
```json
"azure": {
  "apiKey": "...",
  "resource": "my-resource.azure.anthropic.com"
}
```

### 8.3 Environment Variable Names

| Refined Request | Corrected (SDK Default) | Reason |
|----------------|------------------------|--------|
| `AZURE_API_KEY` | `ANTHROPIC_FOUNDRY_API_KEY` | Matches SDK default env var |
| `AZURE_ENDPOINT` | `ANTHROPIC_FOUNDRY_RESOURCE` | Resource hostname, not endpoint URL |
| `AZURE_API_VERSION` | (removed) | Not needed by Foundry SDK |
| `AZURE_DEPLOYMENT` | (removed) | Model specified per-request |
| `GOOGLE_CLOUD_PROJECT` | `ANTHROPIC_VERTEX_PROJECT_ID` | Matches SDK default env var |
| `GOOGLE_CLOUD_REGION` | `CLOUD_ML_REGION` | Matches SDK default env var |

### 8.4 Vertex AI Model Name Format

Vertex AI uses a different model naming convention: `claude-3-5-sonnet-v2@20241022` (with `@`) instead of `claude-3-5-sonnet-20241022` (with `-`). The user must configure the model name appropriate to their provider. This should be documented in the configuration guide.

---

## 9. Dependencies Summary

### Production Dependencies to Add

| Package | Purpose | Install Command |
|---------|---------|----------------|
| `@anthropic-ai/sdk` | Direct Anthropic client | `npm install @anthropic-ai/sdk` |
| `@anthropic-ai/foundry-sdk` | Azure AI Foundry client | `npm install @anthropic-ai/foundry-sdk` |
| `@anthropic-ai/vertex-sdk` | Google Vertex AI client | `npm install @anthropic-ai/vertex-sdk` |
| `dotenv` | Load `.env` files | `npm install dotenv` |

**Combined install**:
```bash
npm install @anthropic-ai/sdk @anthropic-ai/foundry-sdk @anthropic-ai/vertex-sdk dotenv
```

### Transitive Dependencies of Note

- `@anthropic-ai/vertex-sdk` depends on `google-auth-library` for ADC authentication
- `@anthropic-ai/foundry-sdk` optionally integrates with `@azure/identity` for Entra ID auth (not required if using API key)

---

## 10. Risk Assessment and Recommendations

### 10.1 Low Risk

- **Messages API compatibility**: All three clients share the identical `messages.create()` interface. The factory pattern works cleanly.
- **ESM compatibility**: All SDK packages support ESM imports natively.
- **dotenv integration**: Standard, well-understood pattern.

### 10.2 Medium Risk

- **Model name format per provider**: Vertex AI uses different model name format (`@` vs `-`). The user must configure the correct format. Recommendation: document this clearly in the configuration guide.
- **Vertex AI authentication**: ADC setup can be complex for first-time users. Recommendation: include setup instructions in error messages.

### 10.3 Considerations

- **Azure Entra ID support**: For v1, API key authentication is sufficient. Entra ID support (requiring `@azure/identity` dependency) can be added later if needed.
- **Package size**: Adding three SDK packages increases `node_modules` size. For a CLI tool this is acceptable.
- **Token counting**: The SDK does not provide a token counter. Using a rough estimate of 4 characters per token (120KB = ~30K tokens) is adequate for the budget check.

---

## 11. Implementation Checklist

Based on this investigation, the implementation should:

1. Install four npm packages: `@anthropic-ai/sdk`, `@anthropic-ai/foundry-sdk`, `@anthropic-ai/vertex-sdk`, `dotenv`
2. Create `src/ai-config.ts` with priority-based config resolution (env vars > config file)
3. Create `src/ai-client.ts` with factory returning the correct client class per provider
4. Create `src/repo-content.ts` with content collection and formatting
5. Create `src/commands/describe.ts` with the command handler
6. Update `src/types.ts` with `RepoDescription` interface
7. Update `src/cli.ts` to register the `describe` command
8. Update `src/commands/info.ts` to display descriptions
9. Use the corrected Azure config (Foundry SDK with `resource`, not `endpoint`/`apiVersion`/`deployment`)
10. Use the corrected environment variable names (aligned with SDK defaults)

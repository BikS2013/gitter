# Gitter AI Configuration Guide

## Overview

The `gitter describe` command uses Claude AI to generate repository descriptions. It supports three Claude API providers, each requiring specific configuration. Configuration can be provided through three mechanisms, listed in priority order (highest first):

1. **Environment variables** - Override all other sources
2. **`.env` file** at `~/.gitter/.env` - Loaded automatically via dotenv
3. **Config file** at `~/.gitter/config.json` - JSON configuration

When a value is set in multiple sources, the highest-priority source wins.

## Configuration Variables

### Required (All Providers)

| Variable | Config Key | Purpose | How to Obtain | Options |
|----------|-----------|---------|---------------|---------|
| `GITTER_AI_PROVIDER` | `ai.provider` | Which Claude provider to use | Choose based on your setup | `anthropic`, `azure`, `vertex` |
| `GITTER_AI_MODEL` | `ai.model` | Claude model identifier | See provider-specific model names below | e.g., `claude-sonnet-4-20250514` |

### Optional

| Variable | Config Key | Purpose | Default |
|----------|-----------|---------|---------|
| `GITTER_AI_MAX_TOKENS` | `ai.maxTokens` | Maximum tokens in AI response | `4096` |

### Provider: Anthropic (Direct)

| Variable | Config Key | Purpose | How to Obtain | Recommended Storage |
|----------|-----------|---------|---------------|-------------------|
| `ANTHROPIC_API_KEY` | `ai.anthropic.apiKey` | Anthropic API key | [console.anthropic.com](https://console.anthropic.com/) > API Keys | `.env` file or environment variable. **Never** store in config.json (committed to git) |

**Model name format**: Standard Anthropic IDs, e.g., `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001`

**API key expiration**: Anthropic API keys do not expire, but can be revoked. Consider adding an `GITTER_AI_KEY_EXPIRES` variable to track planned rotation dates.

### Provider: Azure (AI Foundry)

| Variable | Config Key | Purpose | How to Obtain | Recommended Storage |
|----------|-----------|---------|---------------|-------------------|
| `ANTHROPIC_FOUNDRY_API_KEY` | `ai.azure.apiKey` | Azure API key | Azure Portal > AI Foundry resource > Keys and Endpoint | `.env` file or environment variable |
| `ANTHROPIC_FOUNDRY_RESOURCE` | `ai.azure.resource` | Azure resource hostname | Azure Portal > AI Foundry resource > Overview (hostname only, e.g., `my-resource.azure.anthropic.com`) | Config file or environment variable |

**Model name format**: Same as direct Anthropic, e.g., `claude-sonnet-4-20250514`

**API key expiration**: Azure API keys can be regenerated. Track expiry with `GITTER_AI_KEY_EXPIRES`.

### Provider: Google Vertex AI

| Variable | Config Key | Purpose | How to Obtain | Recommended Storage |
|----------|-----------|---------|---------------|-------------------|
| `ANTHROPIC_VERTEX_PROJECT_ID` | `ai.vertex.projectId` | GCP project ID | Google Cloud Console > Project selector | Config file |
| `CLOUD_ML_REGION` | `ai.vertex.region` | GCP region for the model | [Vertex AI regions](https://cloud.google.com/vertex-ai/docs/general/locations) | Config file |

**Authentication**: Vertex AI uses Google Application Default Credentials (ADC). No API key needed. Set up with:
```bash
gcloud auth application-default login
```

**Model name format**: Uses `@` separator, e.g., `claude-sonnet-4@20250514` (NOT `claude-sonnet-4-20250514`)

## Configuration Examples

### Example 1: Direct Anthropic via .env

Create `~/.gitter/.env`:
```env
GITTER_AI_PROVIDER=anthropic
GITTER_AI_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

### Example 2: Azure via config.json

Create `~/.gitter/config.json`:
```json
{
  "ai": {
    "provider": "azure",
    "model": "claude-sonnet-4-20250514",
    "azure": {
      "apiKey": "your-azure-api-key",
      "resource": "my-resource.azure.anthropic.com"
    }
  }
}
```

### Example 3: Vertex AI via config.json + ADC

Create `~/.gitter/config.json`:
```json
{
  "ai": {
    "provider": "vertex",
    "model": "claude-sonnet-4@20250514",
    "vertex": {
      "projectId": "my-gcp-project-id",
      "region": "us-east5"
    }
  }
}
```

Then authenticate:
```bash
gcloud auth application-default login
```

### Example 4: Mixed (config file + env override)

`~/.gitter/config.json`:
```json
{
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Environment:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

## Security Recommendations

- **API keys**: Store in `.env` file or environment variables, never in config.json if the config file might be shared
- **The `~/.gitter/` directory**: Contains sensitive data (API keys in .env). Ensure it has restricted permissions (`chmod 700 ~/.gitter`)
- **Key rotation**: Set a reminder to rotate API keys periodically. Consider tracking expiry dates with `GITTER_AI_KEY_EXPIRES=2026-06-01` in your .env

## Error Messages

If configuration is missing, gitter provides specific error messages:

- Missing provider: `"AI provider is not configured. Set GITTER_AI_PROVIDER environment variable, or add 'provider' to ~/.gitter/config.json, or create ~/.gitter/.env with GITTER_AI_PROVIDER=anthropic|azure|vertex"`
- Missing model: `"AI model is not configured. Set GITTER_AI_MODEL environment variable..."`
- Missing API key: `"Anthropic API key is not configured. Set ANTHROPIC_API_KEY environment variable or add it to ~/.gitter/.env or ~/.gitter/config.json"`

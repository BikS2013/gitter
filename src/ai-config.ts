import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getRegistryDir } from './registry.js';
import type { AIConfig, AIProvider } from './types.js';

/** Default maxTokens value -- exception to the no-fallback rule (sensible default). */
const DEFAULT_MAX_TOKENS = 4096;

let configFileCache: Record<string, unknown> | null | undefined = undefined;

/**
 * Load .env file from ~/.gitter/ directory.
 * Called once; dotenv does NOT override existing env vars.
 */
function loadDotEnv(): void {
  const envPath = join(getRegistryDir(), '.env');
  dotenv.config({ path: envPath });
}

/**
 * Load and cache the config file from ~/.gitter/config.json.
 * Returns null if the file does not exist.
 * Throws if the file is malformed JSON.
 */
function loadConfigFile(): Record<string, unknown> | null {
  if (configFileCache !== undefined) return configFileCache;

  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    configFileCache = null;
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    configFileCache = JSON.parse(raw) as Record<string, unknown>;
    return configFileCache;
  } catch {
    throw new Error(`Config file is corrupted: ${configPath}`);
  }
}

/**
 * Resolve a configuration value from the priority chain.
 * Priority: env var (includes .env values via dotenv) > config.json
 *
 * @param envVar - Environment variable name to check
 * @param configPath - Dot-separated path into the config JSON object
 * @returns The resolved value as a string, or undefined if not found
 */
function resolve(envVar: string, configPath: string[]): string | undefined {
  // Priority 1: Environment variable (already includes .env values via dotenv)
  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue !== '') return envValue;

  // Priority 2: Config file
  const config = loadConfigFile();
  if (config) {
    let value: unknown = config;
    for (const key of configPath) {
      value = (value as Record<string, unknown>)?.[key];
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }

  return undefined;
}

/**
 * Throw a standardized error for missing configuration.
 */
function throwMissing(envVar: string, configPath: string, description: string): never {
  throw new Error(
    `${description} is not configured. ${envVar} is not set. Configure via:\n` +
    `  - Environment variable: export ${envVar}=<value>\n` +
    `  - Config file: set "${configPath}" in ~/.gitter/config.json\n` +
    `  - .env file: add ${envVar}=<value> to ~/.gitter/.env`
  );
}

/**
 * Get the absolute path to the config file (~/.gitter/config.json).
 *
 * @returns Absolute path to the config file
 */
export function getConfigFilePath(): string {
  return join(getRegistryDir(), 'config.json');
}

/**
 * Load and validate AI configuration from environment variables,
 * .env file (in ~/.gitter/), and ~/.gitter/config.json.
 *
 * Three-tier priority resolution: env vars > .env file > config.json.
 *
 * Throws on any missing required configuration (no fallback values),
 * except maxTokens which defaults to 4096 if not specified.
 *
 * @returns Validated AIConfig object
 * @throws Error if required configuration fields are missing or invalid
 */
export function loadAIConfig(): AIConfig {
  loadDotEnv();

  // --- provider (required) ---
  const provider = resolve('GITTER_AI_PROVIDER', ['ai', 'provider']);
  if (!provider) {
    throwMissing('GITTER_AI_PROVIDER', 'ai.provider', 'AI provider');
  }

  const validProviders: AIProvider[] = ['anthropic', 'azure', 'vertex'];
  if (!validProviders.includes(provider as AIProvider)) {
    throw new Error(
      `Unknown AI provider: '${provider}'. Must be one of: ${validProviders.join(', ')}`
    );
  }

  // --- model (required) ---
  const model = resolve('GITTER_AI_MODEL', ['ai', 'model']);
  if (!model) {
    throwMissing('GITTER_AI_MODEL', 'ai.model', 'AI model');
  }

  // --- maxTokens (optional, defaults to 4096) ---
  const maxTokensStr = resolve('GITTER_AI_MAX_TOKENS', ['ai', 'maxTokens']);
  let maxTokens = DEFAULT_MAX_TOKENS;
  if (maxTokensStr) {
    maxTokens = parseInt(maxTokensStr, 10);
    if (isNaN(maxTokens) || maxTokens <= 0) {
      throw new Error(
        `Invalid GITTER_AI_MAX_TOKENS value: '${maxTokensStr}'. Must be a positive integer.`
      );
    }
  }

  const config: AIConfig = {
    provider: provider as AIProvider,
    model,
    maxTokens,
  };

  // Validate and attach provider-specific config
  switch (config.provider) {
    case 'anthropic': {
      const apiKey = resolve('ANTHROPIC_API_KEY', ['ai', 'anthropic', 'apiKey']);
      if (!apiKey) {
        throwMissing('ANTHROPIC_API_KEY', 'ai.anthropic.apiKey', 'Anthropic API key');
      }
      config.anthropic = { apiKey };
      break;
    }

    case 'azure': {
      const apiKey = resolve('ANTHROPIC_FOUNDRY_API_KEY', ['ai', 'azure', 'apiKey']);
      if (!apiKey) {
        throwMissing('ANTHROPIC_FOUNDRY_API_KEY', 'ai.azure.apiKey',
          'Azure Foundry API key');
      }
      const resource = resolve('ANTHROPIC_FOUNDRY_RESOURCE', ['ai', 'azure', 'resource']);
      if (!resource) {
        throwMissing('ANTHROPIC_FOUNDRY_RESOURCE', 'ai.azure.resource',
          'Azure Foundry resource hostname');
      }
      config.azure = { apiKey, resource };
      break;
    }

    case 'vertex': {
      const projectId = resolve('ANTHROPIC_VERTEX_PROJECT_ID',
        ['ai', 'vertex', 'projectId']);
      if (!projectId) {
        throwMissing('ANTHROPIC_VERTEX_PROJECT_ID', 'ai.vertex.projectId',
          'GCP project ID');
      }
      const region = resolve('CLOUD_ML_REGION', ['ai', 'vertex', 'region']);
      if (!region) {
        throwMissing('CLOUD_ML_REGION', 'ai.vertex.region', 'GCP region');
      }
      config.vertex = { projectId, region };
      break;
    }
  }

  return config;
}

/**
 * Represents a single git remote with its fetch and push URLs.
 */
export interface Remote {
  /** Remote name (e.g., "origin", "upstream") */
  name: string;
  /** URL used for fetching */
  fetchUrl: string;
  /** URL used for pushing */
  pushUrl: string;
}

/**
 * Represents a single git repository registered in the gitter registry.
 * The localPath serves as the unique identifier.
 */
export interface RegistryEntry {
  /** Directory name of the repository root */
  repoName: string;
  /** Absolute filesystem path to the repository root */
  localPath: string;
  /** All configured remotes with their URLs */
  remotes: Remote[];
  /** Remote-tracking branches (e.g., ["origin/main", "origin/develop"]) */
  remoteBranches: string[];
  /** Local branch names (e.g., ["main", "develop"]) */
  localBranches: string[];
  /** Currently checked-out branch, or "HEAD" if detached */
  currentBranch: string;
  /** ISO 8601 timestamp of last scan */
  lastUpdated: string;
  /** AI-generated description of the repository (optional, populated by describe command) */
  description?: RepoDescription;
  /** User notes in markdown format (optional, populated by notes command) */
  notes?: string;
  /** User-assigned tags/labels (optional, lowercase, sorted alphabetically) */
  tags?: string[];
}

/**
 * AI-generated description of a repository.
 */
export interface RepoDescription {
  /** Business-oriented description in markdown format */
  businessDescription: string;
  /** Technical description in markdown format */
  technicalDescription: string;
  /** ISO 8601 timestamp of when this description was generated */
  generatedAt: string;
  /** The AI model identifier used to generate this description */
  generatedBy: string;
  /** Custom user instructions used during generation (if any) */
  instructions?: string;
}

/**
 * Identifies which Claude API provider to use.
 */
export type AIProvider = 'anthropic' | 'azure' | 'vertex';

/**
 * Configuration for the AI client.
 */
export interface AIConfig {
  /** Which Claude provider to use */
  provider: AIProvider;
  /** Claude model identifier (format varies by provider) */
  model: string;
  /** Maximum tokens for the AI response */
  maxTokens: number;
  /** Anthropic direct API configuration */
  anthropic?: {
    apiKey: string;
  };
  /** Azure AI Foundry configuration */
  azure?: {
    apiKey: string;
    resource: string;
  };
  /** Google Vertex AI configuration */
  vertex?: {
    projectId: string;
    region: string;
  };
}

/**
 * Top-level registry structure stored in ~/.gitter/registry.json.
 */
export interface Registry {
  /** Schema version number. Current version: 1 */
  version: number;
  /** All registered repositories */
  repositories: RegistryEntry[];
}

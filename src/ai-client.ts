import Anthropic from '@anthropic-ai/sdk';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type { AIConfig, RepoDescription, TagDescription } from './types.js';

/**
 * Options controlling how the AI generates or refines a repository description.
 */
export interface DescribeOptions {
  /** Target number of lines for the business description */
  businessLines: number;
  /** Target number of lines for the technical description */
  technicalLines: number;
  /** Additional user instructions for the AI */
  instructions?: string;
  /** Existing description to refine (refinement mode) */
  existingDescription?: RepoDescription;
}

/**
 * Union type of all supported Claude client instances.
 * All share the identical messages.create() API surface.
 */
type AIClient = Anthropic | AnthropicFoundry | AnthropicVertex;

/**
 * Factory function that creates the appropriate Claude SDK client
 * based on the provider specified in the AI configuration.
 *
 * @param config - Validated AI configuration (from loadAIConfig)
 * @returns A client instance with the messages.create() API
 * @throws Error if provider is unknown
 */
function createClient(config: AIConfig): AIClient {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({
        apiKey: config.anthropic!.apiKey,
      });

    case 'azure':
      return new AnthropicFoundry({
        apiKey: config.azure!.apiKey,
        resource: config.azure!.resource,
      });

    case 'vertex':
      return new AnthropicVertex({
        projectId: config.vertex!.projectId,
        region: config.vertex!.region,
      });

    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

/**
 * Build the system prompt with interpolated line count targets.
 */
function buildSystemPrompt(options: DescribeOptions): string {
  return `You are an expert technical writer analyzing a software repository. Your task is to produce two descriptions:

1. **Business Description** (~${options.businessLines} lines): Explain the purpose, use cases, and value proposition of this project from a business/stakeholder perspective. Focus on what problems it solves, who benefits, and why it matters. Write for a non-technical audience — avoid technical terms like repositories, APIs, frameworks, databases, deployments, etc. Use plain business language that executives and stakeholders would understand.

2. **Technical Description** (~${options.technicalLines} lines): Describe the technical approach, architecture, key technologies, and engineering value. Focus on how it works, design decisions, and technical merits.

Format your response as markdown with exactly these two sections:

## Business Description
[business description here]

## Technical Description
[technical description here]`;
}

/**
 * Build the user message depending on whether this is an initial generation
 * or a refinement of an existing description.
 */
function buildUserMessage(repoContent: string, options: DescribeOptions): string {
  if (options.existingDescription) {
    return `Here is the repository content and an existing description. Please refine the description based on the additional instructions.

=== EXISTING BUSINESS DESCRIPTION ===
${options.existingDescription.businessDescription}

=== EXISTING TECHNICAL DESCRIPTION ===
${options.existingDescription.technicalDescription}

=== REFINEMENT INSTRUCTIONS ===
${options.instructions ?? ''}

=== REPOSITORY CONTENT ===
${repoContent}`;
  }

  let message = 'Analyze this repository and produce business and technical descriptions.\n\n';

  if (options.instructions) {
    message += `=== ADDITIONAL INSTRUCTIONS ===\n${options.instructions}\n\n`;
  }

  message += `=== REPOSITORY CONTENT ===\n${repoContent}`;

  return message;
}

/**
 * Parse the AI response text into separate business and technical descriptions.
 * Splits on the "## Technical Description" heading.
 */
function parseResponse(text: string): { businessDescription: string; technicalDescription: string } {
  const marker = '## Technical Description';
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(
      'Failed to parse AI response: missing "## Technical Description" heading. Please try again.'
    );
  }

  // Extract business description: everything between "## Business Description" and "## Technical Description"
  let businessPart = text.substring(0, markerIndex);
  const businessHeading = '## Business Description';
  const businessHeadingIndex = businessPart.indexOf(businessHeading);
  if (businessHeadingIndex !== -1) {
    businessPart = businessPart.substring(businessHeadingIndex + businessHeading.length);
  }

  // Extract technical description: everything after "## Technical Description"
  let technicalPart = text.substring(markerIndex + marker.length);

  return {
    businessDescription: businessPart.trim(),
    technicalDescription: technicalPart.trim(),
  };
}

/**
 * Generate (or refine) a repository description using the Claude API.
 *
 * @param config - Validated AI configuration
 * @param repoContent - Collected repository content string
 * @param options - Description generation options
 * @returns A RepoDescription with parsed business and technical descriptions
 * @throws Error with user-friendly message on API failures
 */
export async function generateDescription(
  config: AIConfig,
  repoContent: string,
  options: DescribeOptions,
): Promise<RepoDescription> {
  const client = createClient(config);
  const systemPrompt = buildSystemPrompt(options);
  const userMessage = buildUserMessage(repoContent, options);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text content from response blocks
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => 'text' in block ? block.text : '')
      .join('\n');

    if (!textContent) {
      throw new Error('Failed to parse AI response: empty response. Please try again.');
    }

    // Warn if response was truncated
    if (response.stop_reason === 'max_tokens') {
      process.stderr.write(
        'Warning: AI response was truncated due to max_tokens limit. ' +
        'Consider increasing GITTER_AI_MAX_TOKENS.\n'
      );
    }

    const parsed = parseResponse(textContent);

    return {
      businessDescription: parsed.businessDescription,
      technicalDescription: parsed.technicalDescription,
      generatedAt: new Date().toISOString(),
      generatedBy: config.model,
      instructions: options.instructions,
    };
  } catch (error: unknown) {
    // Re-throw our own errors (parsing failures, empty response)
    if (error instanceof Error && error.message.startsWith('Failed to parse')) {
      throw error;
    }

    const err = error as { status?: number; message?: string; code?: string };

    if (err.status === 401 || err.status === 403) {
      throw new Error(
        'Authentication failed for Claude API. Check your API key/credentials.'
      );
    }
    if (err.status === 429) {
      throw new Error('Rate limited by Claude API. Please try again later.');
    }
    if (err.status === 500 || err.status === 503) {
      throw new Error('Claude API is temporarily unavailable. Please try again later.');
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      throw new Error(`Failed to connect to Claude API: ${err.message}`);
    }

    throw new Error(`Claude API error: ${err.message ?? 'Unknown error'}`);
  }
}

/**
 * Options for generating a tag-level description across multiple repos.
 */
export interface TagDescribeOptions {
  businessLines: number;
  technicalLines: number;
  instructions?: string;
}

/**
 * Generate a description of how multiple repos under a tag relate to each other.
 */
export async function generateTagDescription(
  config: AIConfig,
  repoContents: Array<{ repoName: string; content: string }>,
  options: TagDescribeOptions,
): Promise<TagDescription> {
  const client = createClient(config);

  const systemPrompt = `You are an expert technical writer analyzing a group of interconnected software repositories that are tagged together. Your task is to identify what system or product these repos form together and describe their relationship.

1. **Business Description** (~${options.businessLines} lines): Explain what system or product these components form together. What business problem does this group solve as a whole? How do they serve users or stakeholders as a unified system? Identify the role of each component in the overall product. Highlight the synergies — explain what value emerges from these components working together that none of them could deliver alone. Write for a non-technical audience — avoid technical terms like repositories, APIs, frameworks, databases, deployments, etc. Use plain business language that executives and stakeholders would understand.

2. **Technical Description** (~${options.technicalLines} lines): Describe the technical architecture of the system. How do these components connect to each other? Identify patterns like frontend/backend/middleware/infrastructure, API boundaries, shared data stores, message queues, deployment topology, and dependencies between them. If the relationships between components can be meaningfully visualized, include a Mermaid diagram (e.g., flowchart, sequence diagram, or C4 context diagram) showing how the components interact.

Format your response as markdown with exactly these two sections:

## Business Description
[business description here]

## Technical Description
[technical description here]`;

  let userMessage = 'Analyze these interconnected repositories and describe the system they form together.\n\n';

  if (options.instructions) {
    userMessage += `=== ADDITIONAL INSTRUCTIONS ===\n${options.instructions}\n\n`;
  }

  for (const repo of repoContents) {
    userMessage += `=== REPOSITORY: ${repo.repoName} ===\n${repo.content}\n\n`;
  }

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => 'text' in block ? block.text : '')
      .join('\n');

    if (!textContent) {
      throw new Error('Failed to parse AI response: empty response. Please try again.');
    }

    if (response.stop_reason === 'max_tokens') {
      process.stderr.write(
        'Warning: AI response was truncated due to max_tokens limit. ' +
        'Consider increasing GITTER_AI_MAX_TOKENS.\n'
      );
    }

    const parsed = parseResponse(textContent);

    return {
      businessDescription: parsed.businessDescription,
      technicalDescription: parsed.technicalDescription,
      generatedAt: new Date().toISOString(),
      generatedBy: config.model,
      repos: repoContents.map(r => r.repoName),
      instructions: options.instructions,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Failed to parse')) {
      throw error;
    }

    const err = error as { status?: number; message?: string; code?: string };

    if (err.status === 401 || err.status === 403) {
      throw new Error('Authentication failed for Claude API. Check your API key/credentials.');
    }
    if (err.status === 429) {
      throw new Error('Rate limited by Claude API. Please try again later.');
    }
    if (err.status === 500 || err.status === 503) {
      throw new Error('Claude API is temporarily unavailable. Please try again later.');
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      throw new Error(`Failed to connect to Claude API: ${err.message}`);
    }

    throw new Error(`Claude API error: ${err.message ?? 'Unknown error'}`);
  }
}

import { existsSync } from 'fs';
import { select, editor } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import { loadAIConfig } from '../ai-config.js';
import { generateDescription } from '../ai-client.js';
import { collectRepoContent, applyTokenBudget } from '../repo-content.js';
import type { RegistryEntry } from '../types.js';

interface DescribeCmdOptions {
  show?: boolean;
  edit?: boolean;
  instructions?: string;
  businessLines?: string;
  technicalLines?: string;
}

/**
 * Resolve the target registry entry from query or CWD.
 */
async function resolveEntry(query: string | undefined): Promise<RegistryEntry> {
  const registry = loadRegistry();

  if (query) {
    const matches = searchEntries(registry, query);
    if (matches.length === 0) {
      process.stderr.write(`No repositories match query: ${query}\n`);
      process.exit(1);
    }
    if (matches.length === 1) {
      return matches[0];
    }
    const selectedPath = await select({
      message: 'Multiple repositories matched. Select one:',
      choices: matches.map(entry => ({
        name: `${entry.repoName} (${entry.localPath})`,
        value: entry.localPath,
      })),
    }, {
      output: process.stderr,
    });
    return matches.find(e => e.localPath === selectedPath)!;
  }

  // No query: use CWD
  if (!isInsideGitRepo()) {
    process.stderr.write('Not inside a git repository. Provide a query or run from within a registered repo.\n');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const entry = findByPath(registry, repoRoot);
  if (!entry) {
    process.stderr.write('Current repository is not registered. Run \'gitter scan\' first.\n');
    process.exit(1);
  }

  return entry;
}

/**
 * Display a stored description.
 */
function displayDescription(entry: RegistryEntry): void {
  if (!entry.description) {
    console.log(`No description available for ${entry.repoName}. Run 'gitter describe' to generate one.`);
    return;
  }

  const desc = entry.description;
  console.log(pc.bold('--- Business Description ---'));
  console.log(desc.businessDescription);
  console.log();
  console.log(pc.bold('--- Technical Description ---'));
  console.log(desc.technicalDescription);
  console.log();
  console.log(`${pc.bold('Generated:')} ${desc.generatedAt}`);
  console.log(`${pc.bold('Model:')} ${desc.generatedBy}`);
  if (desc.instructions) {
    console.log(`${pc.bold('Instructions:')} ${desc.instructions}`);
  }
}

/**
 * Handler for `gitter describe [query]` command.
 */
export async function describeCommand(query: string | undefined, options: DescribeCmdOptions): Promise<void> {
  const entry = await resolveEntry(query);

  // --show: display stored description without calling AI
  if (options.show) {
    displayDescription(entry);
    return;
  }

  // --edit: open descriptions in editor for manual editing
  if (options.edit) {
    const existing = entry.description;
    const defaultText = existing
      ? `## Business Description\n${existing.businessDescription}\n\n## Technical Description\n${existing.technicalDescription}`
      : `## Business Description\n\n\n## Technical Description\n`;

    const edited = await editor({
      message: `Edit description for ${entry.repoName} (save and close editor when done):`,
      default: defaultText,
      postfix: '.md',
    });

    const trimmed = edited.trim();
    if (!trimmed) {
      console.log('Empty description, no changes saved.');
      return;
    }

    // Parse the edited text by splitting on ## Technical Description
    const techMarker = '## Technical Description';
    const techIdx = trimmed.indexOf(techMarker);
    let business: string;
    let technical: string;
    if (techIdx >= 0) {
      business = trimmed.slice(0, techIdx).replace(/^## Business Description\s*\n?/, '').trim();
      technical = trimmed.slice(techIdx + techMarker.length).trim();
    } else {
      business = trimmed.replace(/^## Business Description\s*\n?/, '').trim();
      technical = '';
    }

    const registry = loadRegistry();
    const registryEntry = findByPath(registry, entry.localPath);
    if (registryEntry) {
      registryEntry.description = {
        businessDescription: business,
        technicalDescription: technical,
        generatedAt: new Date().toISOString(),
        generatedBy: 'manual-edit',
        ...(existing?.instructions ? { instructions: existing.instructions } : {}),
      };
      saveRegistry(registry);
    }

    console.log(`Description saved for ${pc.bold(entry.repoName)}.`);
    return;
  }

  // Generation path
  if (!existsSync(entry.localPath)) {
    process.stderr.write(`Repository path no longer exists: ${entry.localPath}\n`);
    process.exit(1);
  }

  const config = loadAIConfig();
  const businessLines = parseInt(options.businessLines ?? '20', 10);
  const technicalLines = parseInt(options.technicalLines ?? '20', 10);

  process.stderr.write(`Generating description for ${pc.bold(entry.repoName)}...\n`);

  // Collect repo content
  const content = collectRepoContent(entry.localPath);
  const budgeted = applyTokenBudget(content);

  // Generate description
  const description = await generateDescription(config, budgeted, {
    businessLines,
    technicalLines,
    instructions: options.instructions,
    existingDescription: entry.description,
  });

  // Store in registry (mutate in place, do NOT use addOrUpdate)
  const registry = loadRegistry();
  const registryEntry = findByPath(registry, entry.localPath);
  if (registryEntry) {
    registryEntry.description = description;
    saveRegistry(registry);
  }

  // Display the generated description
  console.log();
  displayDescription({ ...entry, description });
}

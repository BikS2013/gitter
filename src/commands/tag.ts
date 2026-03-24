import { select, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import type { RegistryEntry } from '../types.js';

interface TagCmdOptions {
  add?: string[];
  remove?: string[];
  list?: boolean;
  eliminate?: string;
}

/**
 * Validate and normalize a single tag.
 * Exported for reuse in server.ts.
 */
export function validateTag(tag: string): string {
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) throw new Error('Tag cannot be empty');
  if (trimmed.length > 50) throw new Error(`Tag too long (max 50 chars): ${trimmed}`);
  if (trimmed.includes(',')) throw new Error(`Tag cannot contain commas: ${trimmed}`);
  return trimmed;
}

/**
 * Add tags to an entry, deduplicating and sorting alphabetically.
 * Returns the new tags array. Exported for reuse in server.ts.
 */
export function addTagsToEntry(entry: RegistryEntry, tags: string[]): string[] {
  const validated = tags.map(validateTag);
  const existing = new Set(entry.tags ?? []);
  for (const tag of validated) {
    existing.add(tag);
  }
  return [...existing].sort();
}

/**
 * Remove tags from an entry.
 * Returns the new tags array. Exported for reuse in server.ts.
 */
export function removeTagsFromEntry(entry: RegistryEntry, tags: string[]): string[] {
  const validated = tags.map(validateTag);
  const toRemove = new Set(validated);
  const current = entry.tags ?? [];
  return current.filter(t => !toRemove.has(t));
}

/**
 * Resolve target entry from query or CWD (same pattern as notes).
 */
async function resolveEntry(query: string | undefined): Promise<RegistryEntry> {
  const registry = loadRegistry();

  if (query) {
    const matches = searchEntries(registry, query);
    if (matches.length === 0) {
      process.stderr.write(`No repositories match query: ${query}\n`);
      process.exit(1);
    }
    if (matches.length === 1) return matches[0];
    const selectedPath = await select({
      message: 'Multiple repositories matched. Select one:',
      choices: matches.map(e => ({
        name: `${e.repoName} (${e.localPath})`,
        value: e.localPath,
      })),
    }, { output: process.stderr });
    return matches.find(e => e.localPath === selectedPath)!;
  }

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
 * Handler for `gitter tag [query]` command.
 */
export async function tagCommand(query: string | undefined, options: TagCmdOptions): Promise<void> {
  // --list: show all tags across all repos with usage counts
  if (options.list) {
    const registry = loadRegistry();
    const tagCounts = new Map<string, number>();
    for (const repo of registry.repositories) {
      if (repo.tags) {
        for (const tag of repo.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    if (tagCounts.size === 0) {
      console.log('No tags found across any repositories.');
      return;
    }

    const sorted = [...tagCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    console.log(pc.bold('All tags:'));
    for (const [tag, count] of sorted) {
      console.log(`  ${pc.cyan(tag)} ${pc.dim(`(${count} repo${count !== 1 ? 's' : ''})`)}`);
    }
    return;
  }

  // --eliminate <tag>: remove a tag from all repos
  if (options.eliminate) {
    const tagToRemove = validateTag(options.eliminate);
    const registry = loadRegistry();
    const affected: RegistryEntry[] = [];

    for (const repo of registry.repositories) {
      if (repo.tags && repo.tags.includes(tagToRemove)) {
        affected.push(repo);
      }
    }

    if (affected.length === 0) {
      console.log(`Tag ${pc.cyan(tagToRemove)} is not used by any repository.`);
      return;
    }

    console.log(`Tag ${pc.cyan(tagToRemove)} is used by ${affected.length} repo${affected.length !== 1 ? 's' : ''}:`);
    for (const repo of affected) {
      console.log(`  ${repo.repoName}`);
    }

    const yes = await confirm({
      message: `Remove tag ${tagToRemove} from all repositories?`,
    }, { output: process.stderr });

    if (!yes) {
      console.log('Cancelled.');
      return;
    }

    for (const repo of affected) {
      repo.tags = repo.tags!.filter(t => t !== tagToRemove);
      if (repo.tags.length === 0) {
        delete repo.tags;
      }
    }
    saveRegistry(registry);
    console.log(`${pc.yellow('Removed')} tag ${pc.cyan(tagToRemove)} from ${affected.length} repo${affected.length !== 1 ? 's' : ''}.`);
    return;
  }

  // --add and --remove require resolving a repo
  if (options.add || options.remove) {
    const entry = await resolveEntry(query);
    const registry = loadRegistry();
    const registryEntry = findByPath(registry, entry.localPath);
    if (!registryEntry) return;

    if (options.add) {
      registryEntry.tags = addTagsToEntry(registryEntry, options.add);
      saveRegistry(registry);
      console.log(`${pc.green('Added')} tags to ${pc.bold(registryEntry.repoName)}: ${options.add.map(t => pc.cyan(validateTag(t))).join(', ')}`);
    }

    if (options.remove) {
      const newTags = removeTagsFromEntry(registryEntry, options.remove);
      if (newTags.length === 0) {
        delete registryEntry.tags;
      } else {
        registryEntry.tags = newTags;
      }
      saveRegistry(registry);
      console.log(`${pc.yellow('Removed')} tags from ${pc.bold(registryEntry.repoName)}: ${options.remove.map(t => pc.cyan(validateTag(t))).join(', ')}`);
    }

    // Show current tags after modification
    const current = registryEntry.tags ?? [];
    if (current.length > 0) {
      console.log(`Current tags: ${current.map(t => pc.cyan(t)).join(', ')}`);
    } else {
      console.log('No tags remaining.');
    }
    return;
  }

  // No options: show current tags for the resolved repo
  const entry = await resolveEntry(query);
  if (entry.tags && entry.tags.length > 0) {
    console.log(`${pc.bold('Tags for ' + entry.repoName + ':')} ${entry.tags.map(t => pc.cyan(t)).join(', ')}`);
  } else {
    console.log(`No tags for ${pc.bold(entry.repoName)}. Use ${pc.dim('gitter tag --add <tag>')} to add tags.`);
  }
}

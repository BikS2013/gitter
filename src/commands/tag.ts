import { select, search, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import type { Registry, RegistryEntry } from '../types.js';

interface TagCmdOptions {
  add?: string;
  remove?: string;
  clear?: boolean;
  list?: boolean;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function collectAllTags(registry: Registry): string[] {
  const tagSet = new Set<string>();
  for (const entry of registry.repositories) {
    if (entry.tags) {
      for (const tag of entry.tags) {
        tagSet.add(tag);
      }
    }
  }
  return [...tagSet].sort();
}

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

export async function tagCommand(query: string | undefined, options: TagCmdOptions): Promise<void> {
  // --list: show all tags across the registry with repo counts
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
      console.log('No tags in the registry.');
      return;
    }
    for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${pc.cyan(tag)} (${count} ${count === 1 ? 'repo' : 'repos'})`);
    }
    return;
  }

  const entry = await resolveEntry(query);
  const registry = loadRegistry();
  const registryEntry = findByPath(registry, entry.localPath)!;

  // --clear
  if (options.clear) {
    if (!registryEntry.tags?.length) {
      console.log(`No tags to clear for ${entry.repoName}.`);
      return;
    }
    const yes = await confirm({
      message: `Clear all tags for ${entry.repoName}?`,
    }, { output: process.stderr });
    if (!yes) {
      console.log('Cancelled.');
      return;
    }
    delete registryEntry.tags;
    saveRegistry(registry);
    console.log(`Tags cleared for ${pc.bold(entry.repoName)}.`);
    return;
  }

  // --add
  if (options.add) {
    const tag = normalizeTag(options.add);
    if (!tag) {
      process.stderr.write('Tag cannot be empty.\n');
      process.exit(1);
    }
    const tags = [...new Set([...(registryEntry.tags ?? []), tag])].sort();
    registryEntry.tags = tags;
    saveRegistry(registry);
    console.log(`Tag ${pc.cyan(tag)} added to ${pc.bold(entry.repoName)}.`);
    return;
  }

  // --remove
  if (options.remove) {
    const tag = normalizeTag(options.remove);
    if (!registryEntry.tags?.includes(tag)) {
      console.log(`Tag '${tag}' not found on ${entry.repoName}.`);
      return;
    }
    const remaining = registryEntry.tags.filter(t => t !== tag);
    if (remaining.length === 0) {
      delete registryEntry.tags;
    } else {
      registryEntry.tags = remaining;
    }
    saveRegistry(registry);
    console.log(`Tag ${pc.cyan(tag)} removed from ${pc.bold(entry.repoName)}.`);
    return;
  }

  // Interactive mode — type to search existing tags or create new ones
  const currentTags = new Set(registryEntry.tags ?? []);

  if (currentTags.size > 0) {
    console.log(`Current tags: ${[...currentTags].sort().map(t => pc.cyan(t)).join(', ')}`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const allTags = collectAllTags(registry);
    const availableTags = allTags.filter(t => !currentTags.has(t));

    // Listen for Escape key to abort the prompt
    const ac = new AbortController();
    const onKeypress = (_ch: string, key: { name: string }) => {
      if (key?.name === 'escape') ac.abort();
    };
    process.stdin.on('keypress', onKeypress);

    let tag: string;
    try {
      tag = await search({
        message: 'Add a tag:',
        theme: {
          style: {
            keysHelpTip: (keys: Array<[string, string]>) => {
              keys.push(['Esc', 'finish']);
              return keys.map(([key, action]) => `${key} ${action}`).join(', ');
            },
          },
        },
        source: async (term) => {
          const q = normalizeTag(term ?? '');

          if (!q) {
            return availableTags.map(t => ({ name: t, value: t }));
          }

          const matches = availableTags.filter(t => t.includes(q));
          const isNew = !allTags.includes(q) && !currentTags.has(q);

          const choices: Array<{ name: string; value: string }> = [];
          if (isNew) {
            choices.push({ name: `+ "${q}"`, value: q });
          }
          for (const t of matches) {
            choices.push({ name: t, value: t });
          }

          return choices;
        },
      }, { output: process.stderr, signal: ac.signal });
    } catch {
      // Escape pressed — exit loop
      break;
    } finally {
      process.stdin.removeListener('keypress', onKeypress);
    }

    currentTags.add(tag);
    console.log(`  + ${pc.cyan(tag)}`);
  }

  const finalTags = [...currentTags].sort();
  if (finalTags.length === 0) {
    delete registryEntry.tags;
  } else {
    registryEntry.tags = finalTags;
  }
  saveRegistry(registry);

  if (finalTags.length > 0) {
    console.log(`Tags for ${pc.bold(entry.repoName)}: ${finalTags.map(t => pc.cyan(t)).join(', ')}`);
  } else {
    console.log(`All tags removed from ${pc.bold(entry.repoName)}.`);
  }
}

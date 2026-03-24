import { select, editor, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import type { RegistryEntry } from '../types.js';

interface UserDescCmdOptions {
  clear?: boolean;
  show?: boolean;
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
 * Handler for `gitter user-desc [query]` command.
 * Opens an editor to add/edit user description, --show to display, or --clear to remove.
 */
export async function userDescCommand(query: string | undefined, options: UserDescCmdOptions): Promise<void> {
  const entry = await resolveEntry(query);

  // --show: display current user description
  if (options.show) {
    if (entry.userDescription) {
      console.log(entry.userDescription);
    } else {
      console.log(`No user description set for ${entry.repoName}. Run 'gitter user-desc' to add one.`);
    }
    return;
  }

  // --clear: remove user description
  if (options.clear) {
    if (!entry.userDescription) {
      console.log(`No user description to clear for ${entry.repoName}.`);
      return;
    }
    const yes = await confirm({
      message: `Clear user description for ${entry.repoName}?`,
    }, { output: process.stderr });
    if (!yes) {
      console.log('Cancelled.');
      return;
    }
    const registry = loadRegistry();
    const registryEntry = findByPath(registry, entry.localPath);
    if (registryEntry) {
      delete registryEntry.userDescription;
      saveRegistry(registry);
    }
    console.log(`User description cleared for ${pc.bold(entry.repoName)}.`);
    return;
  }

  // Open editor with existing user description as default
  const updatedDesc = await editor({
    message: `Edit user description for ${entry.repoName} (save and close editor when done):`,
    default: entry.userDescription ?? '',
    postfix: '.md',
  });

  const trimmed = updatedDesc.trim();
  const registry = loadRegistry();
  const registryEntry = findByPath(registry, entry.localPath);
  if (registryEntry) {
    if (trimmed) {
      registryEntry.userDescription = trimmed;
    } else {
      delete registryEntry.userDescription;
    }
    saveRegistry(registry);
  }

  if (trimmed) {
    console.log(`User description saved for ${pc.bold(entry.repoName)}.`);
  } else {
    console.log(`User description cleared for ${pc.bold(entry.repoName)}.`);
  }
}

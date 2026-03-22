import { select, editor, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import type { RegistryEntry } from '../types.js';

interface NotesCmdOptions {
  clear?: boolean;
}

/**
 * Resolve target entry from query or CWD (same pattern as describe).
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
 * Handler for `gitter notes [query]` command.
 * Opens an editor to add/edit notes, or --clear to remove them.
 */
export async function notesCommand(query: string | undefined, options: NotesCmdOptions): Promise<void> {
  const entry = await resolveEntry(query);

  // --clear: remove notes
  if (options.clear) {
    if (!entry.notes) {
      console.log(`No notes to clear for ${entry.repoName}.`);
      return;
    }
    const yes = await confirm({
      message: `Clear notes for ${entry.repoName}?`,
    }, { output: process.stderr });
    if (!yes) {
      console.log('Cancelled.');
      return;
    }
    const registry = loadRegistry();
    const registryEntry = findByPath(registry, entry.localPath);
    if (registryEntry) {
      delete registryEntry.notes;
      saveRegistry(registry);
    }
    console.log(`Notes cleared for ${pc.bold(entry.repoName)}.`);
    return;
  }

  // Open editor with existing notes as default
  const updatedNotes = await editor({
    message: `Edit notes for ${entry.repoName} (save and close editor when done):`,
    default: entry.notes ?? '',
    postfix: '.md',
  });

  const trimmed = updatedNotes.trim();
  const registry = loadRegistry();
  const registryEntry = findByPath(registry, entry.localPath);
  if (registryEntry) {
    if (trimmed) {
      registryEntry.notes = trimmed;
    } else {
      delete registryEntry.notes;
    }
    saveRegistry(registry);
  }

  if (trimmed) {
    console.log(`Notes saved for ${pc.bold(entry.repoName)}.`);
  } else {
    console.log(`Notes cleared for ${pc.bold(entry.repoName)}.`);
  }
}

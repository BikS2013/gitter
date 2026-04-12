import { select } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, searchEntries, findByPath } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import type { RegistryEntry } from '../types.js';

/**
 * Resolve target entry from query or CWD.
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
      message: 'Multiple repositories matched. Select one to rename:',
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
 * Handler for `gitter rename [query] <new-name>` command.
 * If only one argument is provided, infers the repo from CWD.
 */
export async function renameCommand(queryOrNewName: string, newNameOrUndefined?: string): Promise<void> {
  let query: string | undefined;
  let newName: string;

  if (newNameOrUndefined) {
    query = queryOrNewName;
    newName = newNameOrUndefined;
  } else {
    query = undefined;
    newName = queryOrNewName;
  }

  const entry = await resolveEntry(query);
  const oldName = entry.repoName;

  const registry = loadRegistry();
  const registryEntry = findByPath(registry, entry.localPath);
  if (registryEntry) {
    registryEntry.repoName = newName;
    saveRegistry(registry);
  }

  console.log(`Renamed ${pc.yellow(oldName)} -> ${pc.green(newName)}`);
}

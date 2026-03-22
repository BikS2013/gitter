import { select } from '@inquirer/prompts';
import pc from 'picocolors';
import { loadRegistry, saveRegistry, searchEntries } from '../registry.js';
import type { RegistryEntry } from '../types.js';

/**
 * Handler for `gitter rename <query> <new-name>` command.
 * Renames a repository's display name in the registry.
 */
export async function renameCommand(query: string, newName: string): Promise<void> {
  const registry = loadRegistry();
  const matches = searchEntries(registry, query);

  if (matches.length === 0) {
    process.stderr.write(`No repositories match query: ${query}\n`);
    process.exit(1);
  }

  let entry: RegistryEntry;

  if (matches.length === 1) {
    entry = matches[0];
  } else {
    const selectedPath = await select({
      message: 'Multiple repositories matched. Select one to rename:',
      choices: matches.map(e => ({
        name: `${e.repoName} (${e.localPath})`,
        value: e.localPath,
      })),
    }, {
      output: process.stderr,
    });
    entry = matches.find(e => e.localPath === selectedPath)!;
  }

  const oldName = entry.repoName;
  entry.repoName = newName;
  saveRegistry(registry);

  console.log(`Renamed ${pc.yellow(oldName)} -> ${pc.green(newName)}`);
}

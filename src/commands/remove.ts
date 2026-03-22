import { select, confirm } from '@inquirer/prompts';
import { loadRegistry, searchEntries, removeByPath, saveRegistry } from '../registry.js';

/**
 * Handler for `gitter remove <query>` command.
 * Searches for matching repositories and removes the selected one after confirmation.
 */
export async function removeCommand(query: string): Promise<void> {
  const registry = loadRegistry();
  const matches = searchEntries(registry, query);

  if (matches.length === 0) {
    process.stderr.write(`No repositories match query: ${query}\n`);
    process.exit(1);
  }

  let selectedPath: string;

  if (matches.length === 1) {
    selectedPath = matches[0].localPath;
    console.log(`Found: ${matches[0].repoName} (${matches[0].localPath})`);
  } else {
    selectedPath = await select({
      message: 'Multiple repositories matched. Select one to remove:',
      choices: matches.map(entry => ({
        name: `${entry.repoName} (${entry.localPath})`,
        value: entry.localPath,
        description: `Last updated: ${entry.lastUpdated}`,
      })),
    }, {
      output: process.stderr,
    });
  }

  const confirmed = await confirm({
    message: `Remove ${selectedPath} from the registry?`,
  }, {
    output: process.stderr,
  });

  if (confirmed) {
    removeByPath(registry, selectedPath);
    saveRegistry(registry);
    console.log(`Removed ${selectedPath} from the registry.`);
  } else {
    console.log('Removal cancelled.');
  }
}

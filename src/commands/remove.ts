import { select, confirm } from '@inquirer/prompts';
import { loadRegistry, searchEntries, removeByPath, saveRegistry, findByPath } from '../registry.js';
import { isInsideGitRepo, getRepoRoot } from '../git.js';

/**
 * Handler for `gitter remove [query]` command.
 * If no query is provided and CWD is inside a registered repo, uses that repo.
 * Searches for matching repositories and removes the selected one after confirmation.
 */
export async function removeCommand(query: string | undefined): Promise<void> {
  const registry = loadRegistry();

  let selectedPath: string;

  if (query) {
    const matches = searchEntries(registry, query);

    if (matches.length === 0) {
      process.stderr.write(`No repositories match query: ${query}\n`);
      process.exit(1);
    }

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
  } else {
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
    selectedPath = entry.localPath;
    console.log(`Found: ${entry.repoName} (${entry.localPath})`);
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

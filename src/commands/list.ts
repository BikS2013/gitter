import { existsSync } from 'fs';
import Table from 'cli-table3';
import pc from 'picocolors';
import { loadRegistry } from '../registry.js';

/**
 * Handler for `gitter list` command.
 * Displays all registered repositories in a formatted table.
 */
interface ListCmdOptions {
  tag?: string;
}

export async function listCommand(options: ListCmdOptions): Promise<void> {
  const registry = loadRegistry();

  let repos = registry.repositories;

  if (options.tag) {
    const filterTag = options.tag.toLowerCase();
    repos = repos.filter(e => e.tags?.some(t => t.includes(filterTag)));
    if (repos.length === 0) {
      console.log(`No repositories with tag matching: ${options.tag}`);
      return;
    }
  }

  if (repos.length === 0) {
    console.log('No repositories registered.');
    return;
  }

  const table = new Table({
    head: [pc.bold('Repo Name'), pc.bold('Local Path'), pc.bold('Remotes'), pc.bold('Tags'), pc.bold('Last Updated')],
  });

  for (const entry of repos) {
    const missing = !existsSync(entry.localPath);
    const repoName = missing ? pc.red(`[MISSING] ${entry.repoName}`) : entry.repoName;
    const remoteCount = entry.remotes.length;
    const lastUpdated = new Date(entry.lastUpdated).toLocaleString();

    const tags = entry.tags?.join(', ') ?? '';
    table.push([repoName, entry.localPath, remoteCount, tags, lastUpdated]);
  }

  console.log(table.toString());
}

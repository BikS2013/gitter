import { existsSync } from 'fs';
import Table from 'cli-table3';
import pc from 'picocolors';
import { loadRegistry, searchEntries } from '../registry.js';

/**
 * Handler for `gitter search <query>` command.
 * Searches repositories and displays matches in a formatted table.
 */
export async function searchCommand(query: string): Promise<void> {
  const registry = loadRegistry();
  const matches = searchEntries(registry, query);

  if (matches.length === 0) {
    console.log(`No repositories match query: ${query}`);
    return;
  }

  const table = new Table({
    head: [pc.bold('Repo Name'), pc.bold('Local Path'), pc.bold('Remotes'), pc.bold('Last Updated')],
  });

  for (const entry of matches) {
    const missing = !existsSync(entry.localPath);
    const repoName = missing ? pc.red(`[MISSING] ${entry.repoName}`) : entry.repoName;
    const remoteCount = entry.remotes.length;
    const lastUpdated = new Date(entry.lastUpdated).toLocaleString();

    table.push([repoName, entry.localPath, remoteCount, lastUpdated]);
  }

  console.log(table.toString());
}

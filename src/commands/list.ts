import { existsSync } from 'fs';
import Table from 'cli-table3';
import pc from 'picocolors';
import { loadRegistry } from '../registry.js';

/**
 * Handler for `gitter list` command.
 * Displays all registered repositories in a formatted table.
 */
export async function listCommand(): Promise<void> {
  const registry = loadRegistry();

  if (registry.repositories.length === 0) {
    console.log('No repositories registered.');
    return;
  }

  const table = new Table({
    head: [pc.bold('Repo Name'), pc.bold('Local Path'), pc.bold('Remotes'), pc.bold('Last Updated')],
  });

  for (const entry of registry.repositories) {
    const missing = !existsSync(entry.localPath);
    const repoName = missing ? pc.red(`[MISSING] ${entry.repoName}`) : entry.repoName;
    const remoteCount = entry.remotes.length;
    const lastUpdated = new Date(entry.lastUpdated).toLocaleString();

    table.push([repoName, entry.localPath, remoteCount, lastUpdated]);
  }

  console.log(table.toString());
}

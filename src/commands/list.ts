import { existsSync } from 'fs';
import Table from 'cli-table3';
import pc from 'picocolors';
import { loadRegistry } from '../registry.js';
import type { RegistryEntry } from '../types.js';

interface ListCmdOptions {
  tag?: string[];
  name?: string;
  desc?: string;
}

/**
 * Handler for `gitter list` command.
 * Displays registered repositories in a formatted table.
 * Supports filtering by tag, name, and user description.
 */
export async function listCommand(options: ListCmdOptions): Promise<void> {
  const registry = loadRegistry();

  if (registry.repositories.length === 0) {
    console.log('No repositories registered.');
    return;
  }

  let filtered: RegistryEntry[] = registry.repositories;

  // Filter by tag (OR logic: show repos matching ANY specified tag)
  if (options.tag && options.tag.length > 0) {
    const filterTags = options.tag.map(t => t.toLowerCase());
    filtered = filtered.filter(entry => {
      if (!entry.tags || entry.tags.length === 0) return false;
      return filterTags.some(ft => entry.tags!.includes(ft));
    });
  }

  // Filter by name (case-insensitive substring match)
  if (options.name) {
    const q = options.name.toLowerCase();
    filtered = filtered.filter(entry =>
      entry.repoName.toLowerCase().includes(q),
    );
  }

  // Filter by user description (case-insensitive substring match)
  if (options.desc) {
    const q = options.desc.toLowerCase();
    filtered = filtered.filter(entry =>
      entry.userDescription !== undefined &&
      entry.userDescription.toLowerCase().includes(q),
    );
  }

  if (filtered.length === 0) {
    console.log('No repositories match the specified filters.');
    return;
  }

  const table = new Table({
    head: [pc.bold('Repo Name'), pc.bold('Local Path'), pc.bold('Remotes'), pc.bold('Last Updated')],
  });

  for (const entry of filtered) {
    const missing = !existsSync(entry.localPath);
    const repoName = missing ? pc.red(`[MISSING] ${entry.repoName}`) : entry.repoName;
    const remoteCount = entry.remotes.length;
    const lastUpdated = new Date(entry.lastUpdated).toLocaleString();

    table.push([repoName, entry.localPath, remoteCount, lastUpdated]);
  }

  const filterNote = (options.tag || options.name || options.desc)
    ? ` (${filtered.length} of ${registry.repositories.length})`
    : '';
  console.log(table.toString());
  if (filterNote) {
    console.log(pc.dim(`Showing ${filtered.length} of ${registry.repositories.length} repositories`));
  }
}

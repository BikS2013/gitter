import pc from 'picocolors';
import { isInsideGitRepo, collectRepoMetadata } from '../git.js';
import { loadRegistry, addOrUpdate, saveRegistry, findByPath } from '../registry.js';

/**
 * Handler for `gitter scan` command.
 * Also invoked as the default action when no subcommand is given and CWD is a git repo.
 *
 * Behavior:
 * 1. Check if CWD is inside a git repo -> if not, stderr + exit(1)
 * 2. Collect metadata via collectRepoMetadata()
 * 3. Load registry, addOrUpdate, save registry
 * 4. Print confirmation to stdout: repo name, path, remote count, branch count
 * 5. Indicate whether this was a new registration or an update
 */
export async function scanCommand(): Promise<void> {
  if (!isInsideGitRepo()) {
    process.stderr.write('Not inside a git repository\n');
    process.exit(1);
  }

  const metadata = collectRepoMetadata();
  const registry = loadRegistry();

  const existing = findByPath(registry, metadata.localPath);
  const isUpdate = existing !== undefined;

  // Preserve existing description and notes across re-scans
  if (existing?.description) {
    metadata.description = existing.description;
  }
  if (existing?.notes) {
    metadata.notes = existing.notes;
  }
  if (existing?.claudeSessions) {
    metadata.claudeSessions = existing.claudeSessions;
  }
  if (existing?.tags) {
    metadata.tags = existing.tags;
  }

  addOrUpdate(registry, metadata);
  saveRegistry(registry);

  const action = isUpdate ? 'Updated' : 'Registered';
  const label = isUpdate
    ? pc.yellow(action)
    : pc.green(action);

  console.log(
    `${label} repository ${pc.bold(metadata.repoName)}\n` +
    `  Path:     ${metadata.localPath}\n` +
    `  Remotes:  ${metadata.remotes.length}\n` +
    `  Branches: ${metadata.localBranches.length}`
  );
}

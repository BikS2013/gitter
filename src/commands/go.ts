import { existsSync } from 'fs';
import { select } from '@inquirer/prompts';
import { loadRegistry, searchEntries } from '../registry.js';

/**
 * Handler for `gitter go <query>` command.
 * CRITICAL: stdout must contain ONLY the absolute path. Everything else goes to stderr.
 */
export async function goCommand(query: string): Promise<void> {
  const registry = loadRegistry();
  const matches = searchEntries(registry, query);

  if (matches.length === 0) {
    process.stderr.write('No repositories match query: ' + query + '\n');
    process.exit(1);
  }

  let selectedPath: string;

  if (matches.length === 1) {
    selectedPath = matches[0].localPath;
  } else {
    selectedPath = await select({
      message: 'Multiple repositories matched. Select one:',
      choices: matches.map(entry => ({
        name: `${entry.repoName} (${entry.localPath})`,
        value: entry.localPath,
      })),
    }, {
      output: process.stderr,
    });
  }

  if (!existsSync(selectedPath)) {
    process.stderr.write('Repository path no longer exists: ' + selectedPath + '\n');
    process.exit(1);
  }

  process.stdout.write(selectedPath + '\n');
}

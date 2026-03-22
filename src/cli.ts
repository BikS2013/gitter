#!/usr/bin/env node

import { program } from 'commander';
import { scanCommand } from './commands/scan.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { goCommand } from './commands/go.js';
import { infoCommand } from './commands/info.js';
import { removeCommand } from './commands/remove.js';
import { initCommand } from './commands/init.js';
import { describeCommand } from './commands/describe.js';
import { isInsideGitRepo } from './git.js';

process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});

program
  .name('gitter')
  .version('1.0.0')
  .description('Git repository registry - track, search, and navigate your local repos');

program
  .command('scan')
  .description('Scan current directory and register/update the git repository')
  .action(scanCommand);

program
  .command('list')
  .description('List all registered repositories')
  .action(listCommand);

program
  .command('search <query>')
  .description('Search repositories by name, path, or remote URL')
  .action(searchCommand);

program
  .command('go <query>')
  .description('Navigate to a matching repository (use with shell function)')
  .action(goCommand);

program
  .command('info <query>')
  .description('Show detailed information about a repository')
  .action(infoCommand);

program
  .command('remove <query>')
  .description('Remove a repository from the registry')
  .action(removeCommand);

program
  .command('init')
  .description('Print shell function for directory navigation integration')
  .action(initCommand);

program
  .command('describe [query]')
  .description('Generate or show AI-powered repository description')
  .option('--instructions <text>', 'Additional instructions for the AI')
  .option('--show', 'Show stored description without regenerating')
  .option('--business-lines <n>', 'Target line count for business description', '20')
  .option('--technical-lines <n>', 'Target line count for technical description', '20')
  .action(describeCommand);

// Default action: no subcommand provided
program.action(async () => {
  if (isInsideGitRepo()) {
    await scanCommand();
  } else {
    program.help();
  }
});

program.parse();

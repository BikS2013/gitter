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
import { renameCommand } from './commands/rename.js';
import { notesCommand } from './commands/notes.js';
import { uiCommand } from './commands/ui.js';
import { rememberClaudeCommand } from './commands/remember-claude.js';
import { tagCommand } from './commands/tag.js';
import { userDescCommand } from './commands/user-desc.js';
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
  .option('--tag <tags...>', 'Filter by tag (show repos with any matching tag)')
  .option('--name <query>', 'Filter by repo name (substring match)')
  .option('--desc <query>', 'Filter by user description (substring match)')
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
  .command('info [query]')
  .description('Show detailed information about a repository')
  .action(infoCommand);

program
  .command('remove [query]')
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
  .option('--edit', 'Edit description manually in your editor')
  .option('--business-lines <n>', 'Target line count for business description', '20')
  .option('--technical-lines <n>', 'Target line count for technical description', '20')
  .option('--tag <tag>', 'Describe the relationship between all repos with this tag')
  .action(describeCommand);

program
  .command('rename [query] <new-name>')
  .description('Rename a repository in the registry')
  .action(renameCommand);

program
  .command('notes [query]')
  .description('Add or edit user notes for a repository')
  .option('--clear', 'Remove notes from the repository')
  .action(notesCommand);

program
  .command('ui')
  .description('Open the registry browser in an Electron window')
  .option('--port <n>', 'Port number for the web server', '3000')
  .option('--no-open', 'Do not automatically open the window')
  .option('--browser', 'Open in system browser instead of Electron')
  .action(uiCommand);

program
  .command('remember-claude [session-id]')
  .description('Save a Claude Code session ID for this repository')
  .option('--list', 'List all stored Claude sessions')
  .option('--clear', 'Remove all stored Claude sessions')
  .action(rememberClaudeCommand);

program
  .command('user-desc [query]')
  .description('Add, edit, or view user description for a repository')
  .option('--show', 'Show stored user description only')
  .option('--clear', 'Remove user description')
  .action(userDescCommand);

program
  .command('tag [query]')
  .description('Manage tags for a repository')
  .option('--add <tags...>', 'Add tags to the repository')
  .option('--remove <tags...>', 'Remove tags from the repository')
  .option('--clear', 'Remove all tags from the repository')
  .option('--list', 'List all tags used across all repositories')
  .option('--eliminate <tag>', 'Remove a tag from all repositories')
  .action(tagCommand);

// Default action: no subcommand provided
program.action(async () => {
  if (isInsideGitRepo()) {
    await scanCommand();
  } else {
    program.help();
  }
});

program.parse();

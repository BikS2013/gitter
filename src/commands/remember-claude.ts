import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import pc from 'picocolors';
import { isInsideGitRepo, getRepoRoot } from '../git.js';
import { loadRegistry, saveRegistry, findByPath } from '../registry.js';
import type { ClaudeSession } from '../types.js';

/**
 * Derive the Claude Code project directory name from a repo path.
 * Claude encodes the path by replacing '/' with '-' and prepending '-'.
 * e.g. /Users/john/project => -Users-john-project
 */
function getClaudeProjectDirName(repoPath: string): string {
  return '-' + repoPath.split('/').filter(Boolean).join('-');
}

/**
 * Find session IDs from Claude Code's project data directory.
 * Sessions are stored as <uuid>.jsonl files.
 * Returns sessions sorted by modification time (most recent first).
 */
function discoverClaudeSessions(repoPath: string): Array<{ sessionId: string; mtime: Date }> {
  const home = process.env.HOME;
  if (!home) return [];

  const projectDirName = getClaudeProjectDirName(repoPath);
  const projectDir = join(home, '.claude', 'projects', projectDirName);

  let files: string[];
  try {
    files = readdirSync(projectDir);
  } catch {
    return [];
  }

  const sessions: Array<{ sessionId: string; mtime: Date }> = [];
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const sessionId = file.replace('.jsonl', '');
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) continue;
    try {
      const stat = statSync(join(projectDir, file));
      sessions.push({ sessionId, mtime: stat.mtime });
    } catch {
      continue;
    }
  }

  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return sessions;
}

interface RememberClaudeOptions {
  list?: boolean;
  clear?: boolean;
}

/**
 * Handler for `gitter remember-claude [session-id]` command.
 * Stores Claude Code session IDs in the registry for the current repo.
 */
export async function rememberClaudeCommand(
  sessionId: string | undefined,
  options: RememberClaudeOptions,
): Promise<void> {
  if (!isInsideGitRepo()) {
    process.stderr.write('Not inside a git repository.\n');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const registry = loadRegistry();
  const entry = findByPath(registry, repoRoot);

  if (!entry) {
    process.stderr.write('Current repository is not registered. Run \'gitter scan\' first.\n');
    process.exit(1);
  }

  // --list: show stored sessions
  if (options.list) {
    if (!entry.claudeSessions || entry.claudeSessions.length === 0) {
      console.log(`No Claude sessions stored for ${pc.bold(entry.repoName)}.`);
      return;
    }
    console.log(`Claude sessions for ${pc.bold(entry.repoName)}:\n`);
    const sorted = [...entry.claudeSessions].sort(
      (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime(),
    );
    for (const session of sorted) {
      const date = new Date(session.collectedAt);
      const formatted = date.toLocaleString();
      console.log(`  ${pc.cyan(session.sessionId)}  ${pc.dim(formatted)}`);
      console.log(`    ${pc.dim('claude --resume ' + session.sessionId)}\n`);
    }
    return;
  }

  // --clear: remove all sessions
  if (options.clear) {
    if (!entry.claudeSessions || entry.claudeSessions.length === 0) {
      console.log(`No Claude sessions to clear for ${pc.bold(entry.repoName)}.`);
      return;
    }
    const count = entry.claudeSessions.length;
    delete entry.claudeSessions;
    saveRegistry(registry);
    console.log(`Cleared ${count} Claude session(s) from ${pc.bold(entry.repoName)}.`);
    return;
  }

  // Determine session ID: from argument or auto-detect
  let targetSessionId = sessionId;

  if (!targetSessionId) {
    const discovered = discoverClaudeSessions(repoRoot);
    if (discovered.length === 0) {
      process.stderr.write(
        'No Claude Code sessions found for this project.\n' +
        'Provide a session ID explicitly: gitter remember-claude <session-id>\n',
      );
      process.exit(1);
    }
    targetSessionId = discovered[0].sessionId;
    console.log(`Auto-detected latest session: ${pc.cyan(targetSessionId)}`);
  }

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(targetSessionId)) {
    process.stderr.write(`Invalid session ID format: ${targetSessionId}\n`);
    process.exit(1);
  }

  // Upsert: update timestamp if exists, add if new
  const now = new Date().toISOString();
  if (!entry.claudeSessions) {
    entry.claudeSessions = [];
  }

  const existing = entry.claudeSessions.find(s => s.sessionId === targetSessionId);
  if (existing) {
    existing.collectedAt = now;
    saveRegistry(registry);
    console.log(
      `${pc.yellow('Updated')} session ${pc.cyan(targetSessionId)} for ${pc.bold(entry.repoName)}`,
    );
  } else {
    const session: ClaudeSession = {
      sessionId: targetSessionId,
      collectedAt: now,
    };
    entry.claudeSessions.push(session);
    saveRegistry(registry);
    console.log(
      `${pc.green('Saved')} session ${pc.cyan(targetSessionId)} for ${pc.bold(entry.repoName)}`,
    );
  }

  console.log(`  Resume with: ${pc.dim('claude --resume ' + targetSessionId)}`);
}

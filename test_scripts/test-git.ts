/**
 * test-git.ts
 * Unit tests for the git module (src/git.ts).
 * Requires at least one real git repo on the system.
 *
 * Run: npx tsx test_scripts/test-git.ts
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import {
  isInsideGitRepo,
  getRepoRoot,
  getRemotes,
  getLocalBranches,
  getRemoteBranches,
  getCurrentBranch,
  collectRepoMetadata,
} from '../src/git.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: msg });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label ? label + ': ' : ''}Expected ${e}, got ${a}`);
  }
}

function assertTrue(value: boolean, label = ''): void {
  if (!value) {
    throw new Error(`${label ? label + ': ' : ''}Expected true, got false`);
  }
}

// ---------------------------------------------------------------------------
// Find a real git repo to test with
// ---------------------------------------------------------------------------
function findGitRepo(): string {
  // Try known locations
  const candidates = [
    '/Users/giorgosmarinos/aiwork/ibank/ibankRedesignShellNetCore6',
    '/Users/giorgosmarinos/aiwork/IDP/AzWrap',
    '/Users/giorgosmarinos/aiwork/IDP/teams-tool',
  ];

  for (const path of candidates) {
    if (existsSync(`${path}/.git`)) {
      return path;
    }
  }

  // Fallback: search for any git repo
  try {
    const result = execSync(
      'find /Users/giorgosmarinos/aiwork -maxdepth 3 -name .git -type d 2>/dev/null | head -1',
      { encoding: 'utf-8' }
    ).trim();
    if (result) {
      return result.replace(/\/\.git$/, '');
    }
  } catch {
    // ignore
  }

  throw new Error('No git repository found on the system for testing');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\n=== Git Module Tests ===\n');

const testRepoPath = findGitRepo();
console.log(`Using test repo: ${testRepoPath}\n`);

// --- Test: isInsideGitRepo returns true inside a git repo ---
test('isInsideGitRepo returns true inside a git repo', () => {
  const result = isInsideGitRepo(testRepoPath);
  assertEqual(result, true, 'should be true');
});

// --- Test: isInsideGitRepo returns false outside a git repo ---
test('isInsideGitRepo returns false outside a git repo (/tmp)', () => {
  const result = isInsideGitRepo('/tmp');
  assertEqual(result, false, 'should be false');
});

// --- Test: getRepoRoot returns correct path ---
test('getRepoRoot returns the repository root path', () => {
  const root = getRepoRoot(testRepoPath);
  assertTrue(typeof root === 'string', 'root is a string');
  assertTrue(root.length > 0, 'root is not empty');
  assertTrue(existsSync(root), 'root path exists on disk');
  // The root should contain a .git directory
  assertTrue(
    existsSync(`${root}/.git`),
    'root contains .git'
  );
});

// --- Test: getRepoRoot from subdirectory resolves to root ---
test('getRepoRoot from subdirectory resolves to repo root', () => {
  // Find any subdirectory inside the test repo
  let subDir: string | null = null;
  try {
    const dirs = execSync(
      `find "${testRepoPath}" -mindepth 1 -maxdepth 1 -type d ! -name .git 2>/dev/null | head -1`,
      { encoding: 'utf-8' }
    ).trim();
    if (dirs) subDir = dirs;
  } catch {
    // skip
  }

  if (subDir) {
    const root = getRepoRoot(subDir);
    const expectedRoot = getRepoRoot(testRepoPath);
    assertEqual(root, expectedRoot, 'subdirectory resolves to same root');
  } else {
    // No subdirectories, just verify root returns itself
    const root = getRepoRoot(testRepoPath);
    assertTrue(root.length > 0, 'root returned');
  }
});

// --- Test: getRemotes returns Remote[] with correct structure ---
test('getRemotes returns array of Remote objects with correct structure', () => {
  const remotes = getRemotes(testRepoPath);
  assertTrue(Array.isArray(remotes), 'remotes is an array');
  // Even if there are no remotes, the structure should be valid
  for (const remote of remotes) {
    assertTrue(typeof remote.name === 'string', 'remote.name is string');
    assertTrue(typeof remote.fetchUrl === 'string', 'remote.fetchUrl is string');
    assertTrue(typeof remote.pushUrl === 'string', 'remote.pushUrl is string');
    assertTrue(remote.name.length > 0, 'remote.name is not empty');
  }
});

// --- Test: getLocalBranches returns string[] ---
test('getLocalBranches returns an array of strings', () => {
  const branches = getLocalBranches(testRepoPath);
  assertTrue(Array.isArray(branches), 'branches is an array');
  assertTrue(branches.length > 0, 'at least one local branch');
  for (const b of branches) {
    assertTrue(typeof b === 'string', 'branch is a string');
    assertTrue(b.length > 0, 'branch is not empty');
    // Branch names should not contain leading * or whitespace
    assertTrue(!b.startsWith('*'), 'no leading asterisk');
    assertTrue(b === b.trim(), 'no leading/trailing whitespace');
  }
});

// --- Test: getRemoteBranches returns string[] ---
test('getRemoteBranches returns an array of strings', () => {
  const branches = getRemoteBranches(testRepoPath);
  assertTrue(Array.isArray(branches), 'remoteBranches is an array');
  // Remote branches may be empty if no remotes configured
  for (const b of branches) {
    assertTrue(typeof b === 'string', 'branch is a string');
    assertTrue(b.length > 0, 'branch is not empty');
    // Remote branches should contain a slash (e.g., origin/main)
    assertTrue(b.includes('/'), 'contains slash (remote/branch format)');
  }
});

// --- Test: getCurrentBranch returns a string ---
test('getCurrentBranch returns a non-empty string', () => {
  const branch = getCurrentBranch(testRepoPath);
  assertTrue(typeof branch === 'string', 'branch is a string');
  assertTrue(branch.length > 0, 'branch is not empty');
});

// --- Test: collectRepoMetadata returns complete RegistryEntry ---
test('collectRepoMetadata returns a complete RegistryEntry', () => {
  const entry = collectRepoMetadata(testRepoPath);

  // Check all required fields exist and have correct types
  assertTrue(typeof entry.repoName === 'string' && entry.repoName.length > 0, 'repoName');
  assertTrue(typeof entry.localPath === 'string' && entry.localPath.length > 0, 'localPath');
  assertTrue(Array.isArray(entry.remotes), 'remotes is array');
  assertTrue(Array.isArray(entry.remoteBranches), 'remoteBranches is array');
  assertTrue(Array.isArray(entry.localBranches), 'localBranches is array');
  assertTrue(typeof entry.currentBranch === 'string' && entry.currentBranch.length > 0, 'currentBranch');
  assertTrue(typeof entry.lastUpdated === 'string', 'lastUpdated is string');

  // lastUpdated should be a valid ISO 8601 date
  const date = new Date(entry.lastUpdated);
  assertTrue(!isNaN(date.getTime()), 'lastUpdated is valid ISO date');

  // localPath should exist on disk
  assertTrue(existsSync(entry.localPath), 'localPath exists on disk');

  // repoName should match the directory name of localPath
  const expectedName = entry.localPath.split('/').pop();
  assertEqual(entry.repoName, expectedName, 'repoName matches directory name');

  // currentBranch should be in localBranches (unless detached HEAD)
  if (entry.currentBranch !== 'HEAD') {
    assertTrue(
      entry.localBranches.includes(entry.currentBranch),
      'currentBranch is in localBranches'
    );
  }
});

// --- Test: isInsideGitRepo returns false for non-existent path ---
test('isInsideGitRepo returns false for non-existent path', () => {
  const result = isInsideGitRepo('/nonexistent/path/that/does/not/exist');
  assertEqual(result, false, 'should be false');
});

// --- Summary ---
console.log(`\n--- Git Tests Summary ---`);
console.log(`  Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  for (const r of results) {
    if (!r.ok) console.log(`  - ${r.name}: ${r.error}`);
  }
}
console.log('');

process.exit(failed > 0 ? 1 : 0);

/**
 * test-repo-content.ts
 * Unit tests for the repository content collector (src/repo-content.ts).
 * Uses a real git repo on disk for testing.
 *
 * Run: npx tsx test_scripts/test-repo-content.ts
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { collectRepoContent, formatRepoContentForPrompt, applyTokenBudget } from '../src/repo-content.js';
import type { RepoContent } from '../src/repo-content.js';

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

function assertTrue(value: boolean, label = ''): void {
  if (!value) throw new Error(`${label ? label + ': ' : ''}Expected true, got false`);
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label ? label + ': ' : ''}Expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// Find a real git repo for testing
// ---------------------------------------------------------------------------
function findGitRepo(): string {
  const candidates = [
    '/Users/giorgosmarinos/aiwork/IDP/AzWrap',
    '/Users/giorgosmarinos/aiwork/IDP/teams-tool',
    '/Users/giorgosmarinos/aiwork/ibank/ibankRedesignShellNetCore6',
  ];
  for (const path of candidates) {
    if (existsSync(`${path}/.git`)) return path;
  }
  try {
    const result = execSync(
      'find /Users/giorgosmarinos/aiwork -maxdepth 3 -name .git -type d 2>/dev/null | head -1',
      { encoding: 'utf-8' }
    ).trim();
    if (result) return result.replace(/\/\.git$/, '');
  } catch { /* ignore */ }
  throw new Error('No git repository found for testing');
}

const GIT_REPO_PATH = findGitRepo();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\n=== Repo Content Tests ===\n');
console.log(`Test repo: ${GIT_REPO_PATH}\n`);

// --- Test: collectRepoContent returns non-empty content ---
let repoContent: RepoContent;

test('collectRepoContent returns non-empty content', () => {
  repoContent = collectRepoContent(GIT_REPO_PATH);
  assertTrue(repoContent.fileTree.length > 0, 'fileTree is non-empty');
});

// --- Test: file tree section exists and has content ---
test('fileTree contains file paths', () => {
  assertTrue(repoContent.fileTree.length > 10, 'fileTree has substantial content');
  // File tree should contain file path separators (/) or at least some file names
  assertTrue(
    repoContent.fileTree.includes('/') || repoContent.fileTree.includes('.'),
    'fileTree contains path separators or file extensions'
  );
});

// --- Test: README section included if repo has one ---
test('readme section is included when repo has a README', () => {
  const hasReadme = existsSync(`${GIT_REPO_PATH}/README.md`) ||
    existsSync(`${GIT_REPO_PATH}/README`) ||
    existsSync(`${GIT_REPO_PATH}/README.rst`) ||
    existsSync(`${GIT_REPO_PATH}/readme.md`);

  if (hasReadme) {
    assertTrue(repoContent.readme !== null, 'readme should be non-null when README file exists');
    assertTrue(repoContent.readme!.length > 0, 'readme content is non-empty');
  } else {
    assertEqual(repoContent.readme, null, 'readme should be null when no README exists');
  }
});

// --- Test: manifest is collected when present ---
test('manifest is collected when project has one', () => {
  const manifestFiles = [
    'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
    'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile',
  ];
  const hasManifest = manifestFiles.some(f => existsSync(`${GIT_REPO_PATH}/${f}`));

  if (hasManifest) {
    assertTrue(repoContent.manifest !== null, 'manifest should be non-null');
    assertTrue(repoContent.manifest!.length > 0, 'manifest content is non-empty');
  } else {
    assertEqual(repoContent.manifest, null, 'manifest should be null when none exists');
  }
});

// --- Test: formatRepoContentForPrompt produces string with section delimiters ---
test('formatRepoContentForPrompt produces string with section delimiters', () => {
  const formatted = formatRepoContentForPrompt(repoContent);
  assertTrue(formatted.length > 0, 'formatted string is non-empty');
  assertTrue(formatted.includes('--- FILE TREE ---'), 'contains FILE TREE delimiter');

  // If README exists, should have that delimiter
  if (repoContent.readme !== null) {
    assertTrue(formatted.includes('--- README ---'), 'contains README delimiter');
  }

  // If manifest exists, should have that delimiter
  if (repoContent.manifest !== null) {
    assertTrue(formatted.includes('--- PROJECT MANIFEST ---'), 'contains PROJECT MANIFEST delimiter');
  }
});

// --- Test: formatRepoContentForPrompt includes all sections ---
test('formatRepoContentForPrompt includes project docs section when present', () => {
  const formatted = formatRepoContentForPrompt(repoContent);
  if (repoContent.projectDocs.length > 0) {
    assertTrue(formatted.includes('--- PROJECT DOCUMENTATION ---'), 'contains PROJECT DOCUMENTATION delimiter');
  }
  if (repoContent.sourceSnippets.length > 0) {
    assertTrue(formatted.includes('--- SOURCE FILE ---'), 'contains SOURCE FILE delimiter');
  }
  if (repoContent.ciConfigs.length > 0) {
    assertTrue(formatted.includes('--- CI/CD CONFIG ---'), 'contains CI/CD CONFIG delimiter');
  }
});

// --- Test: applyTokenBudget returns string under 120KB ---
test('applyTokenBudget returns string under 120KB', () => {
  // Create a fresh copy since applyTokenBudget mutates the content object
  const freshContent = collectRepoContent(GIT_REPO_PATH);
  const budgeted = applyTokenBudget(freshContent);
  assertTrue(budgeted.length > 0, 'budgeted string is non-empty');
  const sizeBytes = Buffer.byteLength(budgeted, 'utf-8');
  assertTrue(sizeBytes <= 120_000, `budgeted size (${sizeBytes} bytes) should be <= 120000`);
});

// --- Test: applyTokenBudget preserves file tree ---
test('applyTokenBudget result still contains FILE TREE section', () => {
  const freshContent = collectRepoContent(GIT_REPO_PATH);
  const budgeted = applyTokenBudget(freshContent);
  assertTrue(budgeted.includes('--- FILE TREE ---'), 'budgeted result contains FILE TREE');
});

// --- Test: RepoContent shape has all required fields ---
test('RepoContent has all required fields', () => {
  assertTrue(typeof repoContent.fileTree === 'string', 'fileTree is string');
  assertTrue(repoContent.readme === null || typeof repoContent.readme === 'string', 'readme is string or null');
  assertTrue(repoContent.manifest === null || typeof repoContent.manifest === 'string', 'manifest is string or null');
  assertTrue(Array.isArray(repoContent.projectDocs), 'projectDocs is array');
  assertTrue(Array.isArray(repoContent.sourceSnippets), 'sourceSnippets is array');
  assertTrue(Array.isArray(repoContent.ciConfigs), 'ciConfigs is array');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n--- Repo Content Tests Summary ---`);
console.log(`  Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  for (const r of results) {
    if (!r.ok) console.log(`  - ${r.name}: ${r.error}`);
  }
}
console.log('');

process.exit(failed > 0 ? 1 : 0);

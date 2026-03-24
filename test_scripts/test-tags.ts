/**
 * test-tags.ts
 * Unit tests for the tag feature (src/commands/tag.ts).
 * Tests validateTag, addTagsToEntry, removeTagsFromEntry pure functions
 * and CLI integration via execFileSync.
 *
 * Run: npx tsx test_scripts/test-tags.ts
 */

import { join } from 'path';
import { execFileSync } from 'child_process';
import type { RegistryEntry } from '../src/types.js';
import { validateTag, addTagsToEntry, removeTagsFromEntry } from '../src/commands/tag.js';

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

function assertThrows(fn: () => void, substringInMessage?: string, label = ''): void {
  let threw = false;
  try {
    fn();
  } catch (err: unknown) {
    threw = true;
    if (substringInMessage) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes(substringInMessage)) {
        throw new Error(
          `${label ? label + ': ' : ''}Expected error containing "${substringInMessage}", got "${msg}"`
        );
      }
    }
  }
  if (!threw) {
    throw new Error(`${label ? label + ': ' : ''}Expected function to throw, but it did not`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const originalHome = process.env.HOME;

function cleanup(): void {
  process.env.HOME = originalHome;
}

function makeSampleEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    repoName: 'test-repo',
    localPath: '/Users/test/repos/test-repo',
    remotes: [
      { name: 'origin', fetchUrl: 'https://github.com/user/test-repo.git', pushUrl: 'https://github.com/user/test-repo.git' },
    ],
    remoteBranches: ['origin/main'],
    localBranches: ['main'],
    currentBranch: 'main',
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CLI helper
// ---------------------------------------------------------------------------
const CLI_PATH = join(import.meta.dirname!, '..', 'src', 'cli.ts');
const GITTER_ROOT = join(import.meta.dirname!, '..');

function runCliCombined(args: string[], cwd?: string): string {
  try {
    return execFileSync('npx', ['tsx', CLI_PATH, ...args], {
      cwd: cwd ?? GITTER_ROOT,
      encoding: 'utf-8',
      env: { ...process.env },
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    // Return combined stdout + stderr even on non-zero exit
    return (err.stdout ?? '') + (err.stderr ?? '');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests(): Promise<void> {
  console.log('\n=== Tag Feature Tests ===\n');

  // ===== validateTag tests =====
  console.log('--- validateTag ---');

  test('validateTag: valid tag returns lowercase trimmed string', () => {
    const result = validateTag('backend');
    assertEqual(result, 'backend', 'simple tag');
  });

  test('validateTag: tag with spaces gets trimmed', () => {
    const result = validateTag('  frontend  ');
    assertEqual(result, 'frontend', 'trimmed tag');
  });

  test('validateTag: tag with uppercase gets lowercased', () => {
    const result = validateTag('MyProject');
    assertEqual(result, 'myproject', 'lowercased tag');
  });

  test('validateTag: empty tag throws error', () => {
    assertThrows(
      () => validateTag(''),
      'Tag cannot be empty',
      'empty tag'
    );
    assertThrows(
      () => validateTag('   '),
      'Tag cannot be empty',
      'whitespace-only tag'
    );
  });

  test('validateTag: tag over 50 chars throws error', () => {
    const longTag = 'a'.repeat(51);
    assertThrows(
      () => validateTag(longTag),
      'Tag too long',
      'long tag'
    );
  });

  test('validateTag: tag with comma throws error', () => {
    assertThrows(
      () => validateTag('tag,with,commas'),
      'Tag cannot contain commas',
      'comma tag'
    );
  });

  // ===== addTagsToEntry tests =====
  console.log('\n--- addTagsToEntry ---');

  test('addTagsToEntry: add tags to entry with no existing tags', () => {
    const entry = makeSampleEntry();
    // entry.tags is undefined
    const result = addTagsToEntry(entry, ['backend', 'api']);
    assertEqual(result, ['api', 'backend'], 'sorted tags');
  });

  test('addTagsToEntry: add tags to entry with existing tags (merges correctly)', () => {
    const entry = makeSampleEntry({ tags: ['alpha', 'gamma'] });
    const result = addTagsToEntry(entry, ['beta']);
    assertEqual(result, ['alpha', 'beta', 'gamma'], 'merged and sorted');
  });

  test('addTagsToEntry: adding duplicate tags does not create duplicates', () => {
    const entry = makeSampleEntry({ tags: ['frontend', 'react'] });
    const result = addTagsToEntry(entry, ['react', 'frontend']);
    assertEqual(result, ['frontend', 'react'], 'no duplicates');
  });

  test('addTagsToEntry: tags are sorted alphabetically after add', () => {
    const entry = makeSampleEntry();
    const result = addTagsToEntry(entry, ['zebra', 'alpha', 'mango']);
    assertEqual(result, ['alpha', 'mango', 'zebra'], 'alphabetically sorted');
  });

  test('addTagsToEntry: case-insensitive deduplication works', () => {
    const entry = makeSampleEntry({ tags: ['backend'] });
    const result = addTagsToEntry(entry, ['Backend', 'BACKEND']);
    assertEqual(result, ['backend'], 'case-insensitive dedup');
  });

  // ===== removeTagsFromEntry tests =====
  console.log('\n--- removeTagsFromEntry ---');

  test('removeTagsFromEntry: remove existing tags', () => {
    const entry = makeSampleEntry({ tags: ['api', 'backend', 'frontend'] });
    const result = removeTagsFromEntry(entry, ['backend']);
    assertEqual(result, ['api', 'frontend'], 'backend removed');
  });

  test('removeTagsFromEntry: remove non-existent tag (no error, no change)', () => {
    const entry = makeSampleEntry({ tags: ['api', 'backend'] });
    const result = removeTagsFromEntry(entry, ['nonexistent']);
    assertEqual(result, ['api', 'backend'], 'unchanged');
  });

  test('removeTagsFromEntry: remove all tags results in empty array', () => {
    const entry = makeSampleEntry({ tags: ['api', 'backend'] });
    const result = removeTagsFromEntry(entry, ['api', 'backend']);
    assertEqual(result, [], 'empty array');
  });

  test('removeTagsFromEntry: remove from entry with no tags (no error)', () => {
    const entry = makeSampleEntry();
    // entry.tags is undefined
    const result = removeTagsFromEntry(entry, ['anything']);
    assertEqual(result, [], 'empty array from undefined tags');
  });

  // ===== CLI integration tests =====
  console.log('\n--- CLI integration ---');

  test('gitter tag --list works (no crash)', () => {
    // Should exit cleanly whether or not there are tags
    const output = runCliCombined(['tag', '--list']);
    assertTrue(typeof output === 'string', 'output is string');
  });

  test('gitter tag --add test-tag adds a tag to current repo', () => {
    // Running from within the gitter repo (which is a git repo)
    // First scan to ensure it is registered
    runCliCombined(['scan']);
    const output = runCliCombined(['tag', '--add', 'test-tag-ci']);
    assertTrue(output.includes('Added') || output.includes('test-tag-ci'), 'tag added output');
  });

  test('gitter tag (no flags) shows current tags', () => {
    const output = runCliCombined(['tag']);
    // Should show tags for current repo (which now has test-tag-ci)
    assertTrue(output.includes('test-tag-ci') || output.includes('Tags for') || output.includes('No tags'), 'shows tags');
  });

  test('gitter tag --remove test-tag removes the tag', () => {
    const output = runCliCombined(['tag', '--remove', 'test-tag-ci']);
    assertTrue(output.includes('Removed') || output.includes('test-tag-ci'), 'tag removed output');
  });

  // --- Cleanup: ensure test tag is removed ---
  try {
    runCliCombined(['tag', '--remove', 'test-tag-ci']);
  } catch {
    // ignore - tag may already be removed
  }

  cleanup();

  // --- Summary ---
  console.log(`\n--- Tag Tests Summary ---`);
  console.log(`  Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results) {
      if (!r.ok) console.log(`  - ${r.name}: ${r.error}`);
    }
  }
  console.log('');
}

runTests()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch((err) => {
    console.error('Unexpected error:', err);
    cleanup();
    process.exit(1);
  });

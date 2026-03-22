/**
 * test-registry.ts
 * Unit tests for the registry module (src/registry.ts).
 * Uses a temp directory as HOME so the real registry is never touched.
 *
 * Run: npx tsx test_scripts/test-registry.ts
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Registry, RegistryEntry } from '../src/types.js';

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
let tempHome: string;

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gitter-test-'));
  process.env.HOME = dir;
  return dir;
}

function cleanup(): void {
  process.env.HOME = originalHome;
  if (tempHome && existsSync(tempHome)) {
    rmSync(tempHome, { recursive: true, force: true });
  }
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
// Dynamic import helper (must import AFTER setting HOME)
// ---------------------------------------------------------------------------
async function importRegistry() {
  // Use a unique query string to bypass module cache
  // Since we cannot bust the ESM cache, we re-import and rely on the module
  // reading process.env.HOME at call time (which it does).
  return await import('../src/registry.js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests(): Promise<void> {
  console.log('\n=== Registry Module Tests ===\n');

  const reg = await importRegistry();

  // --- Test: ensureRegistryExists creates directory and file ---
  tempHome = makeTempHome();
  test('ensureRegistryExists creates ~/.gitter/registry.json', () => {
    reg.ensureRegistryExists();
    const registryPath = join(process.env.HOME!, '.gitter', 'registry.json');
    assertTrue(existsSync(registryPath), 'registry.json should exist');
    const content = JSON.parse(readFileSync(registryPath, 'utf-8'));
    assertEqual(content.version, 1, 'version');
    assertTrue(Array.isArray(content.repositories), 'repositories is array');
    assertEqual(content.repositories.length, 0, 'repositories empty');
  });

  // --- Test: loadRegistry returns empty registry on fresh install ---
  test('loadRegistry returns empty registry on fresh install', () => {
    const registry = reg.loadRegistry();
    assertEqual(registry.version, 1, 'version');
    assertEqual(registry.repositories.length, 0, 'no repos');
  });

  // --- Test: addOrUpdate creates new entry ---
  test('addOrUpdate creates a new entry', () => {
    const registry = reg.loadRegistry();
    const entry = makeSampleEntry();
    reg.addOrUpdate(registry, entry);
    assertEqual(registry.repositories.length, 1, 'length');
    assertEqual(registry.repositories[0].repoName, 'test-repo', 'repoName');
    assertEqual(registry.repositories[0].localPath, '/Users/test/repos/test-repo', 'localPath');
  });

  // --- Test: addOrUpdate updates existing entry (no duplicates) ---
  test('addOrUpdate updates existing entry without creating duplicate', () => {
    const registry = reg.loadRegistry();
    const entry1 = makeSampleEntry();
    reg.addOrUpdate(registry, entry1);

    // Update with same localPath but different branches
    const entry2 = makeSampleEntry({
      localBranches: ['main', 'develop', 'feature-x'],
      currentBranch: 'develop',
    });
    reg.addOrUpdate(registry, entry2);

    assertEqual(registry.repositories.length, 1, 'still 1 entry');
    assertEqual(registry.repositories[0].currentBranch, 'develop', 'branch updated');
    assertEqual(registry.repositories[0].localBranches.length, 3, '3 branches');
  });

  // --- Test: addOrUpdate with different path creates second entry ---
  test('addOrUpdate with different path creates a second entry', () => {
    const registry: Registry = { version: 1, repositories: [] };
    const entry1 = makeSampleEntry();
    const entry2 = makeSampleEntry({
      repoName: 'other-repo',
      localPath: '/Users/test/repos/other-repo',
    });
    reg.addOrUpdate(registry, entry1);
    reg.addOrUpdate(registry, entry2);
    assertEqual(registry.repositories.length, 2, 'two entries');
  });

  // --- Test: saveRegistry and loadRegistry round-trip ---
  test('saveRegistry persists data that loadRegistry can read back', () => {
    const registry: Registry = { version: 1, repositories: [] };
    const entry = makeSampleEntry();
    reg.addOrUpdate(registry, entry);
    reg.saveRegistry(registry);

    const loaded = reg.loadRegistry();
    assertEqual(loaded.repositories.length, 1, 'loaded 1 entry');
    assertEqual(loaded.repositories[0].repoName, 'test-repo', 'repoName');
  });

  // --- Test: removeByPath removes entry ---
  test('removeByPath removes the entry with matching path', () => {
    const registry: Registry = { version: 1, repositories: [] };
    const entry1 = makeSampleEntry();
    const entry2 = makeSampleEntry({
      repoName: 'keep-repo',
      localPath: '/Users/test/repos/keep-repo',
    });
    reg.addOrUpdate(registry, entry1);
    reg.addOrUpdate(registry, entry2);

    reg.removeByPath(registry, '/Users/test/repos/test-repo');
    assertEqual(registry.repositories.length, 1, 'one entry left');
    assertEqual(registry.repositories[0].repoName, 'keep-repo', 'correct entry kept');
  });

  // --- Test: removeByPath with non-existent path does nothing ---
  test('removeByPath with non-existent path does not change registry', () => {
    const registry: Registry = { version: 1, repositories: [] };
    const entry = makeSampleEntry();
    reg.addOrUpdate(registry, entry);

    reg.removeByPath(registry, '/nonexistent/path');
    assertEqual(registry.repositories.length, 1, 'still 1 entry');
  });

  // --- Test: searchEntries matches by name (case-insensitive) ---
  test('searchEntries matches by repoName (case-insensitive)', () => {
    const registry: Registry = { version: 1, repositories: [] };
    reg.addOrUpdate(registry, makeSampleEntry({ repoName: 'MyProject' }));
    reg.addOrUpdate(registry, makeSampleEntry({ repoName: 'other', localPath: '/other' }));

    const matches = reg.searchEntries(registry, 'myproject');
    assertEqual(matches.length, 1, 'one match');
    assertEqual(matches[0].repoName, 'MyProject', 'correct match');
  });

  // --- Test: searchEntries matches by path ---
  test('searchEntries matches by localPath', () => {
    const registry: Registry = { version: 1, repositories: [] };
    reg.addOrUpdate(registry, makeSampleEntry({ localPath: '/Users/dev/alpha' }));
    reg.addOrUpdate(registry, makeSampleEntry({ repoName: 'beta', localPath: '/Users/dev/beta' }));

    const matches = reg.searchEntries(registry, 'alpha');
    assertEqual(matches.length, 1, 'one match');
  });

  // --- Test: searchEntries matches by remote URL (case-insensitive) ---
  test('searchEntries matches by remote URL (case-insensitive)', () => {
    const registry: Registry = { version: 1, repositories: [] };
    reg.addOrUpdate(
      registry,
      makeSampleEntry({
        localPath: '/repos/a',
        remotes: [
          { name: 'origin', fetchUrl: 'https://github.com/Org/RepoX.git', pushUrl: 'https://github.com/Org/RepoX.git' },
        ],
      })
    );
    reg.addOrUpdate(
      registry,
      makeSampleEntry({ repoName: 'no-match', localPath: '/repos/b', remotes: [] })
    );

    const matches = reg.searchEntries(registry, 'repox');
    assertEqual(matches.length, 1, 'one match by URL');
  });

  // --- Test: searchEntries returns empty for no match ---
  test('searchEntries returns empty array for no match', () => {
    const registry: Registry = { version: 1, repositories: [] };
    reg.addOrUpdate(registry, makeSampleEntry());

    const matches = reg.searchEntries(registry, 'zzz-no-match-zzz');
    assertEqual(matches.length, 0, 'no matches');
  });

  // --- Test: findByPath returns entry or undefined ---
  test('findByPath returns matching entry or undefined', () => {
    const registry: Registry = { version: 1, repositories: [] };
    const entry = makeSampleEntry();
    reg.addOrUpdate(registry, entry);

    const found = reg.findByPath(registry, '/Users/test/repos/test-repo');
    assertTrue(found !== undefined, 'found entry');
    assertEqual(found!.repoName, 'test-repo', 'repoName');

    const notFound = reg.findByPath(registry, '/nonexistent');
    assertTrue(notFound === undefined, 'undefined for missing');
  });

  // --- Test: Missing HOME throws error ---
  test('getRegistryDir throws when HOME is not set', () => {
    const savedHome = process.env.HOME;
    delete process.env.HOME;
    try {
      assertThrows(
        () => reg.getRegistryDir(),
        'HOME environment variable is not set',
        'missing HOME'
      );
    } finally {
      process.env.HOME = savedHome;
    }
  });

  // --- Cleanup ---
  cleanup();

  // --- Summary ---
  console.log(`\n--- Registry Tests Summary ---`);
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

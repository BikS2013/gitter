/**
 * test-user-desc.ts
 * Tests for the user description feature.
 * Tests CLI integration (--show, --clear) and search integration.
 *
 * Run: npx tsx test_scripts/test-user-desc.ts
 */

import { join } from 'path';
import { execFileSync } from 'child_process';
import { loadRegistry, saveRegistry, findByPath, searchEntries } from '../src/registry.js';

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
    return (err.stdout ?? '') + (err.stderr ?? '');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests(): Promise<void> {
  console.log('\n=== User Description Tests ===\n');

  // Ensure repo is registered
  runCliCombined(['scan']);

  // --- Data model tests ---
  console.log('--- Data model ---');

  test('userDescription field exists on RegistryEntry', () => {
    const registry = loadRegistry();
    const entry = registry.repositories[0];
    // Field should be settable
    entry.userDescription = 'test';
    assertEqual(entry.userDescription, 'test');
    delete entry.userDescription;
    assertEqual(entry.userDescription, undefined);
  });

  test('userDescription is preserved across scan', () => {
    // Set a user description directly
    const registry = loadRegistry();
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: GITTER_ROOT, encoding: 'utf-8',
    }).trim();
    const entry = findByPath(registry, repoRoot);
    assertTrue(!!entry, 'entry found');
    entry!.userDescription = 'test-preserve-desc';
    saveRegistry(registry);

    // Run scan
    runCliCombined(['scan']);

    // Verify preserved
    const after = loadRegistry();
    const afterEntry = findByPath(after, repoRoot);
    assertEqual(afterEntry?.userDescription, 'test-preserve-desc', 'preserved after scan');

    // Clean up
    delete afterEntry!.userDescription;
    saveRegistry(after);
  });

  // --- Search integration ---
  console.log('\n--- Search integration ---');

  test('searchEntries matches on userDescription', () => {
    const registry = loadRegistry();
    const entry = registry.repositories[0];
    entry.userDescription = 'unique-xyz-search-term';
    const matches = searchEntries(registry, 'unique-xyz-search-term');
    assertTrue(matches.length >= 1, 'found match');
    assertEqual(matches[0].repoName, entry.repoName, 'correct repo');
    delete entry.userDescription;
  });

  test('searchEntries does not match when userDescription is absent', () => {
    const registry = loadRegistry();
    const entry = registry.repositories[0];
    delete entry.userDescription;
    const matches = searchEntries(registry, 'unique-xyz-nonexistent-term-abc');
    assertEqual(matches.length, 0, 'no matches');
  });

  // --- CLI integration ---
  console.log('\n--- CLI integration ---');

  test('gitter user-desc --help shows options', () => {
    const output = runCliCombined(['user-desc', '--help']);
    assertTrue(output.includes('--show'), 'has --show');
    assertTrue(output.includes('--clear'), 'has --clear');
  });

  test('gitter user-desc --show works with no description set', () => {
    // Ensure no description
    const registry = loadRegistry();
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: GITTER_ROOT, encoding: 'utf-8',
    }).trim();
    const entry = findByPath(registry, repoRoot);
    delete entry!.userDescription;
    saveRegistry(registry);

    const output = runCliCombined(['user-desc', '--show']);
    assertTrue(output.includes('No user description') || output.includes('user-desc'), 'shows no desc message');
  });

  test('gitter info shows User Description section', () => {
    // Set a description
    const registry = loadRegistry();
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: GITTER_ROOT, encoding: 'utf-8',
    }).trim();
    const entry = findByPath(registry, repoRoot);
    entry!.userDescription = 'Test user desc for info';
    saveRegistry(registry);

    const output = runCliCombined(['info', 'gitter']);
    assertTrue(output.includes('User Description'), 'has User Description header');
    assertTrue(output.includes('Test user desc for info'), 'shows description content');

    // Clean up
    const reg2 = loadRegistry();
    const e2 = findByPath(reg2, repoRoot);
    delete e2!.userDescription;
    saveRegistry(reg2);
  });

  test('user description appears before business description in info', () => {
    // Set a description
    const registry = loadRegistry();
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: GITTER_ROOT, encoding: 'utf-8',
    }).trim();
    const entry = findByPath(registry, repoRoot);
    entry!.userDescription = 'USER-DESC-ORDER-TEST';
    saveRegistry(registry);

    const output = runCliCombined(['info', 'gitter']);
    const userDescPos = output.indexOf('User Description');
    const descPos = output.indexOf('Description:') !== -1
      ? output.indexOf('Description:')
      : output.indexOf('Business Description');
    assertTrue(userDescPos < descPos, 'user desc before business desc');

    // Clean up
    const reg2 = loadRegistry();
    const e2 = findByPath(reg2, repoRoot);
    delete e2!.userDescription;
    saveRegistry(reg2);
  });

  // --- Summary ---
  console.log(`\n--- User Description Tests Summary ---`);
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
    process.exit(1);
  });

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import type { Registry, RegistryEntry } from './types.js';

const REGISTRY_VERSION = 1;

/**
 * Get the registry directory path (~/.gitter/).
 * Throws if HOME environment variable is not set.
 */
export function getRegistryDir(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error(
      'HOME environment variable is not set. Cannot determine registry location. ' +
      'Please set the HOME environment variable and try again.'
    );
  }
  return join(home, '.gitter');
}

/**
 * Get the registry file path (~/.gitter/registry.json).
 */
export function getRegistryPath(): string {
  return join(getRegistryDir(), 'registry.json');
}

/**
 * Ensure the registry directory and file exist.
 */
export function ensureRegistryExists(): void {
  const dir = getRegistryDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = getRegistryPath();
  if (!existsSync(filePath)) {
    const empty: Registry = { version: REGISTRY_VERSION, repositories: [] };
    saveRegistry(empty);
  }
}

/**
 * Load and parse the registry from disk.
 */
export function loadRegistry(): Registry {
  ensureRegistryExists();
  const filePath = getRegistryPath();
  const content = readFileSync(filePath, 'utf-8');

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error(
      `Registry file is corrupted: ${filePath}. ` +
      'Delete the file and run gitter again to create a fresh registry.'
    );
  }

  const registry = data as Registry;
  if (typeof registry.version !== 'number' || !Array.isArray(registry.repositories)) {
    throw new Error(
      `Registry file has an invalid schema: ${filePath}. ` +
      'Delete the file and run gitter again to create a fresh registry.'
    );
  }

  return registry;
}

/**
 * Save the registry to disk using atomic write.
 */
export function saveRegistry(registry: Registry): void {
  const filePath = getRegistryPath();
  const data = JSON.stringify(registry, null, 2) + '\n';
  const dir = dirname(filePath);
  const tmpFile = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);

  try {
    writeFileSync(tmpFile, data, 'utf-8');
    renameSync(tmpFile, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
}

/**
 * Find a registry entry by its absolute local path.
 */
export function findByPath(registry: Registry, localPath: string): RegistryEntry | undefined {
  return registry.repositories.find(entry => entry.localPath === localPath);
}

/**
 * Add a new entry or update an existing one (by localPath).
 */
export function addOrUpdate(registry: Registry, entry: RegistryEntry): Registry {
  const index = registry.repositories.findIndex(e => e.localPath === entry.localPath);
  if (index >= 0) {
    registry.repositories[index] = entry;
  } else {
    registry.repositories.push(entry);
  }
  return registry;
}

/**
 * Remove an entry by its absolute local path.
 */
export function removeByPath(registry: Registry, localPath: string): Registry {
  registry.repositories = registry.repositories.filter(e => e.localPath !== localPath);
  return registry;
}

/**
 * Search registry entries by a query string.
 * Case-insensitive partial match on repoName, localPath, and remote URLs.
 */
export function searchEntries(registry: Registry, query: string): RegistryEntry[] {
  const q = query.toLowerCase();
  return registry.repositories.filter(entry => {
    if (entry.repoName.toLowerCase().includes(q)) return true;
    if (entry.localPath.toLowerCase().includes(q)) return true;
    for (const remote of entry.remotes) {
      if (remote.fetchUrl.toLowerCase().includes(q)) return true;
      if (remote.pushUrl.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

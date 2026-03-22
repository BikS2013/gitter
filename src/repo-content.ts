import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { git } from './git.js';

/**
 * Collected repository content for Claude analysis.
 */
export interface RepoContent {
  /** git ls-tree output (truncated at 500 lines) */
  fileTree: string;
  /** README content (first 200 lines) or null if no README found */
  readme: string | null;
  /** Project manifest (package.json, Cargo.toml, etc.) or null */
  manifest: string | null;
  /** Project documentation files (CLAUDE.md, .cursor/rules) -- first 100 lines each */
  projectDocs: string[];
  /** Key source file excerpts (src/main.*, src/index.*, etc.) -- first 100 lines each */
  sourceSnippets: string[];
  /** CI/CD config excerpts (.github/workflows/*.yml) -- first 50 lines each, max 3 */
  ciConfigs: string[];
}

const TOKEN_BUDGET_BYTES = 120_000;

/**
 * Read a file from the repository, returning at most maxLines lines.
 * Returns null if the file does not exist or cannot be read.
 */
function readFileHead(repoPath: string, relativePath: string, maxLines: number): string | null {
  const fullPath = join(repoPath, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (truncated at ${maxLines} lines)`;
    }
    return content;
  } catch {
    return null; // Silently skip unreadable files (binary, permissions, etc.)
  }
}

/**
 * Collect all repository content for Claude analysis.
 *
 * @param repoPath - Absolute path to the repository root
 * @returns RepoContent with all collected sections
 */
export function collectRepoContent(repoPath: string): RepoContent {
  // 1. File Tree (Priority 1)
  let fileTree: string;
  let fileTreeLines: string[];
  try {
    const lsOutput = git(['ls-tree', '-r', '--name-only', 'HEAD'], repoPath);
    fileTreeLines = lsOutput.split('\n');
    if (fileTreeLines.length > 500) {
      const remaining = fileTreeLines.length - 500;
      fileTree = fileTreeLines.slice(0, 500).join('\n') + `\n... (${remaining} more files)`;
    } else {
      fileTree = lsOutput;
    }
  } catch {
    fileTree = '(no commits yet)';
    fileTreeLines = [];
  }

  // 2. README (Priority 1)
  const readmeCandidates = ['README.md', 'README', 'README.rst', 'readme.md'];
  let readme: string | null = null;
  for (const candidate of readmeCandidates) {
    readme = readFileHead(repoPath, candidate, 200);
    if (readme !== null) break;
  }

  // 3. Manifest (Priority 1)
  const manifestCandidates = [
    'package.json',
    'Cargo.toml',
    'pyproject.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'composer.json',
    'Gemfile',
  ];
  let manifest: string | null = null;
  for (const candidate of manifestCandidates) {
    const fullPath = join(repoPath, candidate);
    if (existsSync(fullPath)) {
      try {
        manifest = readFileSync(fullPath, 'utf-8');
      } catch {
        manifest = null;
      }
      break;
    }
  }

  // 4. Project Docs (Priority 2)
  const docCandidates = ['CLAUDE.md', '.cursor/rules'];
  const projectDocs: string[] = [];
  for (const candidate of docCandidates) {
    const content = readFileHead(repoPath, candidate, 100);
    if (content !== null) {
      projectDocs.push(`[${candidate}]\n${content}`);
    }
  }

  // 5. Source Snippets (Priority 2)
  const entryPointPatterns = [
    /^src\/main\./,
    /^src\/index\./,
    /^src\/app\./,
    /^src\/lib\./,
    /^main\./,
    /^index\./,
    /^app\./,
  ];
  const sourceSnippets: string[] = [];
  for (const pattern of entryPointPatterns) {
    if (sourceSnippets.length >= 5) break;
    for (const file of fileTreeLines) {
      if (sourceSnippets.length >= 5) break;
      if (pattern.test(file)) {
        const content = readFileHead(repoPath, file, 100);
        if (content !== null) {
          sourceSnippets.push(`[${file}]\n${content}`);
        }
      }
    }
  }

  // 6. CI Configs (Priority 3)
  const ciConfigs: string[] = [];
  const workflowsDir = join(repoPath, '.github', 'workflows');
  if (existsSync(workflowsDir)) {
    try {
      const files = readdirSync(workflowsDir)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .slice(0, 3);
      for (const file of files) {
        const relPath = `.github/workflows/${file}`;
        const content = readFileHead(repoPath, relPath, 50);
        if (content !== null) {
          ciConfigs.push(`[${relPath}]\n${content}`);
        }
      }
    } catch {
      // Silently skip if directory cannot be read
    }
  }

  return {
    fileTree,
    readme,
    manifest,
    projectDocs,
    sourceSnippets,
    ciConfigs,
  };
}

/**
 * Format collected repo content into a single string for the Claude user message.
 * Each section is delimited with labeled separators.
 */
export function formatRepoContentForPrompt(content: RepoContent): string {
  const sections: string[] = [];

  sections.push('--- FILE TREE ---');
  sections.push(content.fileTree);

  if (content.readme) {
    sections.push('\n--- README ---');
    sections.push(content.readme);
  }

  if (content.manifest) {
    sections.push('\n--- PROJECT MANIFEST ---');
    sections.push(content.manifest);
  }

  for (const doc of content.projectDocs) {
    sections.push('\n--- PROJECT DOCUMENTATION ---');
    sections.push(doc);
  }

  for (const snippet of content.sourceSnippets) {
    sections.push('\n--- SOURCE FILE ---');
    sections.push(snippet);
  }

  for (const ci of content.ciConfigs) {
    sections.push('\n--- CI/CD CONFIG ---');
    sections.push(ci);
  }

  return sections.join('\n');
}

/**
 * Apply progressive truncation to fit content within the token budget.
 * Modifies the content object in place and reformats.
 * Returns the formatted string.
 */
export function applyTokenBudget(content: RepoContent): string {
  let formatted = formatRepoContentForPrompt(content);
  let truncated = false;

  // Step 1: Remove CI configs
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.ciConfigs.length > 0) {
    content.ciConfigs = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 2: Remove source snippets
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.sourceSnippets.length > 0) {
    content.sourceSnippets = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 3: Remove project docs
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.projectDocs.length > 0) {
    content.projectDocs = [];
    formatted = formatRepoContentForPrompt(content);
    truncated = true;
  }

  // Step 4: Truncate README to 100 lines
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES && content.readme) {
    const lines = content.readme.split('\n');
    if (lines.length > 100) {
      content.readme = lines.slice(0, 100).join('\n') + '\n... (truncated at 100 lines)';
      formatted = formatRepoContentForPrompt(content);
      truncated = true;
    }
  }

  // Step 5: Truncate file tree to 250 lines
  if (Buffer.byteLength(formatted, 'utf-8') > TOKEN_BUDGET_BYTES) {
    const lines = content.fileTree.split('\n');
    if (lines.length > 250) {
      content.fileTree = lines.slice(0, 250).join('\n') + '\n... (truncated at 250 lines)';
      formatted = formatRepoContentForPrompt(content);
      truncated = true;
    }
  }

  const sizeKB = Math.round(Buffer.byteLength(formatted, 'utf-8') / 1024);
  const estimatedTokens = Math.round(Buffer.byteLength(formatted, 'utf-8') / 4);
  process.stderr.write(`Content size: ~${sizeKB}KB (~${estimatedTokens} tokens)\n`);

  if (truncated) {
    process.stderr.write('Warning: Repository content was truncated to fit within the token budget.\n');
  }

  return formatted;
}

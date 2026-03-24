/**
 * Returns the complete HTML page for the Gitter Registry Browser.
 * Single-page app with all CSS and JS inline. No external resources.
 */
export function getHtmlPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gitter Registry Browser</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --header-bg: #1a1a2e;
    --header-accent: #e94560;
    --body-bg: #f5f5f5;
    --card-bg: #ffffff;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
    --card-shadow-hover: 0 4px 12px rgba(0,0,0,0.12);
    --border-color: #e0e0e0;
    --text-primary: #1a1a2e;
    --text-secondary: #555;
    --text-muted: #999;
    --mono-font: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    --sans-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --selected-bg: #e8edf3;
    --selected-border: #4a6fa5;
    --tag-bg: #eef1f5;
    --tag-text: #4a6fa5;
    --code-bg: #f0f2f5;
    --link-color: #4a6fa5;
  }

  html, body { height: 100%; font-family: var(--sans-font); color: var(--text-primary); background: var(--body-bg); }

  /* --- HEADER --- */
  #header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: var(--header-bg); color: #fff;
    padding: 0 24px; height: 56px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  #header .logo {
    font-size: 18px; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap;
    display: flex; align-items: center; gap: 8px;
  }
  #header .logo .accent { color: var(--header-accent); }
  #search-box {
    flex: 1; max-width: 340px;
    padding: 7px 12px; border: none; border-radius: 6px;
    background: rgba(255,255,255,0.12); color: #fff;
    font-size: 14px; outline: none; transition: background 0.2s;
  }
  #search-box::placeholder { color: rgba(255,255,255,0.5); }
  #search-box:focus { background: rgba(255,255,255,0.2); }

  .header-controls { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-wrap: wrap; }

  .filter-btn, .sort-btn {
    padding: 5px 10px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;
    background: transparent; color: rgba(255,255,255,0.7); font-size: 12px;
    cursor: pointer; transition: all 0.15s; white-space: nowrap;
  }
  .filter-btn:hover, .sort-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .filter-btn.active { background: var(--header-accent); border-color: var(--header-accent); color: #fff; }
  .sort-btn.active { background: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.35); }
  .sort-btn .arrow { font-size: 10px; margin-left: 2px; }

  .divider { width: 1px; height: 24px; background: rgba(255,255,255,0.15); margin: 0 4px; }

  /* --- MAIN LAYOUT --- */
  #main {
    position: fixed; top: 56px; left: 0; right: 0; bottom: 0;
    display: flex;
  }

  #list-panel {
    width: 30%; min-width: 260px; max-width: 420px;
    overflow-y: auto; background: var(--body-bg);
    border-right: 1px solid var(--border-color);
    padding: 12px;
  }

  #detail-panel {
    flex: 1; overflow-y: auto; padding: 24px 32px;
    background: #fff;
  }

  /* --- REPO LIST --- */
  .repo-card {
    padding: 10px 14px; margin-bottom: 6px;
    border-radius: 6px; cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
    background: var(--card-bg);
    box-shadow: var(--card-shadow);
  }
  .repo-card:hover { box-shadow: var(--card-shadow-hover); border-color: var(--border-color); }
  .repo-card.selected { background: var(--selected-bg); border-color: var(--selected-border); }
  .repo-card .repo-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: var(--text-primary); }
  .repo-card .repo-path { font-family: var(--mono-font); font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .repo-card .repo-meta { display: flex; gap: 8px; margin-top: 4px; align-items: center; flex-wrap: wrap; }
  .repo-card .branch-tag {
    font-size: 11px; padding: 1px 6px; border-radius: 3px;
    background: var(--tag-bg); color: var(--tag-text); font-family: var(--mono-font);
  }
  .repo-card .desc-indicator { font-size: 10px; color: var(--text-muted); }

  .list-count { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; padding-left: 4px; }

  /* --- DETAIL VIEW --- */
  .detail-empty {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: var(--text-muted); font-size: 16px;
  }

  .detail-header { margin-bottom: 24px; }
  .detail-header h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
  .detail-path {
    font-family: var(--mono-font); font-size: 13px; color: var(--link-color);
    cursor: pointer; display: inline-block; padding: 4px 8px;
    background: var(--code-bg); border-radius: 4px;
    transition: background 0.15s;
  }
  .detail-path:hover { background: #dde3eb; }
  .detail-path::after { content: ' (click to copy)'; font-family: var(--sans-font); font-size: 11px; color: var(--text-muted); margin-left: 6px; }
  .copied-toast {
    display: inline-block; margin-left: 8px; font-size: 12px;
    color: #2d8a4e; opacity: 0; transition: opacity 0.3s;
  }
  .copied-toast.show { opacity: 1; }

  .detail-section { margin-bottom: 24px; }
  .detail-section h2 {
    font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text-secondary); margin-bottom: 10px;
    padding-bottom: 6px; border-bottom: 2px solid var(--border-color);
  }

  .detail-branch-current {
    font-family: var(--mono-font); font-size: 14px;
    padding: 4px 10px; background: var(--tag-bg); color: var(--tag-text);
    border-radius: 4px; display: inline-block;
  }

  .detail-timestamp { font-size: 13px; color: var(--text-secondary); }

  /* Tables */
  .detail-table {
    width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px;
  }
  .detail-table th {
    text-align: left; padding: 6px 10px; background: var(--code-bg);
    font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;
    color: var(--text-secondary); border-bottom: 1px solid var(--border-color);
  }
  .detail-table td {
    padding: 6px 10px; border-bottom: 1px solid #f0f0f0;
    font-family: var(--mono-font); font-size: 12px; word-break: break-all;
  }

  /* Branch pills */
  .branch-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .branch-pill {
    font-family: var(--mono-font); font-size: 12px;
    padding: 3px 8px; border-radius: 4px;
    background: var(--tag-bg); color: var(--tag-text);
  }

  /* Markdown rendered content */
  .md-content { font-size: 14px; line-height: 1.7; color: var(--text-primary); }
  .md-content h1 { font-size: 20px; font-weight: 700; margin: 16px 0 8px; }
  .md-content h2 { font-size: 17px; font-weight: 600; margin: 14px 0 6px; }
  .md-content h3 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
  .md-content p { margin: 8px 0; }
  .md-content strong { font-weight: 600; }
  .md-content em { font-style: italic; }
  .md-content code {
    font-family: var(--mono-font); font-size: 12px;
    background: var(--code-bg); padding: 2px 5px; border-radius: 3px;
  }
  .md-content pre {
    background: #1e1e2e; color: #cdd6f4; padding: 14px 16px;
    border-radius: 6px; overflow-x: auto; margin: 10px 0;
    font-family: var(--mono-font); font-size: 12px; line-height: 1.5;
  }
  .md-content pre code { background: none; padding: 0; color: inherit; }
  .md-content ul, .md-content ol { margin: 8px 0; padding-left: 24px; }
  .md-content li { margin: 3px 0; }
  .md-content a { color: var(--link-color); text-decoration: none; }
  .md-content a:hover { text-decoration: underline; }
  .muted { color: var(--text-muted); font-style: italic; }

  /* --- TAG BADGES & FILTER --- */
  .tag-badge {
    display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px;
    background: #e8f5e9; color: #2e7d32; font-family: var(--mono-font);
    cursor: pointer;
  }
  .tag-badge:hover { background: #c8e6c9; }

  #tag-filter-bar {
    display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 0 4px;
    max-height: 60px; overflow-y: auto;
  }
  .tag-chip {
    font-size: 11px; padding: 2px 8px; border-radius: 12px;
    background: var(--tag-bg); color: var(--tag-text); cursor: pointer;
    border: 1px solid transparent; transition: all 0.15s;
    font-family: var(--mono-font);
  }
  .tag-chip:hover { border-color: var(--tag-text); }
  .tag-chip.active { background: var(--tag-text); color: #fff; }

  .tag-input-row { display: flex; gap: 6px; margin-top: 8px; }
  .tag-input {
    flex: 1; padding: 4px 8px; border: 1px solid var(--border-color);
    border-radius: 4px; font-size: 13px; font-family: var(--mono-font);
    background: var(--card-bg); color: var(--text-primary);
  }
  .tag-add-btn, .tag-remove-btn, .tag-eliminate-btn {
    padding: 3px 10px; border: none; border-radius: 4px;
    font-size: 12px; cursor: pointer; transition: background 0.15s;
  }
  .tag-add-btn { background: #2e7d32; color: #fff; }
  .tag-add-btn:hover { background: #1b5e20; }
  .tag-remove-btn { background: #c62828; color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }
  .tag-remove-btn:hover { background: #b71c1c; }
  .tag-eliminate-btn { background: #e65100; color: #fff; margin-top: 8px; }
  .tag-eliminate-btn:hover { background: #bf360c; }
  .tag-eliminate-x:hover { opacity: 1 !important; color: #e74c3c; }

  .detail-tag-badge {
    display: inline-flex; align-items: center;
    padding: 3px 10px; margin: 2px 4px; border-radius: 12px;
    font-size: 0.8rem; background: var(--tag-bg); color: var(--tag-text);
  }

  /* --- USER DESCRIPTION --- */
  .user-desc-display { font-size: 14px; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; }
  .user-desc-edit { width: 100%; min-height: 80px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; font-family: var(--sans-font); font-size: 13px; resize: vertical; }
  .user-desc-actions { display: flex; gap: 6px; margin-top: 8px; }
  .user-desc-save { padding: 4px 12px; background: #2e7d32; color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .user-desc-save:hover { background: #1b5e20; }
  .user-desc-clear { padding: 4px 12px; background: #c62828; color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .user-desc-clear:hover { background: #b71c1c; }
  .user-desc-edit-btn { padding: 4px 12px; background: var(--tag-text); color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .user-desc-edit-btn:hover { background: #3a5f95; }

  /* Loading & Error */
  .loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 16px; }
  .error-msg { color: #c0392b; background: #fdecea; padding: 12px 16px; border-radius: 6px; font-size: 14px; }

  /* --- RESPONSIVE --- */
  @media (max-width: 768px) {
    #main { flex-direction: column; }
    #list-panel { width: 100%; max-width: none; min-width: 0; max-height: 40vh; border-right: none; border-bottom: 1px solid var(--border-color); }
    #detail-panel { padding: 16px; }
    #header { padding: 0 12px; gap: 8px; height: auto; min-height: 56px; flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
    #search-box { max-width: none; flex-basis: 100%; order: 10; }
    .header-controls { order: 11; flex-basis: 100%; justify-content: flex-start; margin-left: 0; margin-bottom: 4px; }
    #main { top: auto; position: relative; margin-top: 120px; height: calc(100vh - 120px); }
  }
</style>
</head>
<body>

<div id="header">
  <div class="logo"><span class="accent">&gt;_</span> Gitter Registry Browser</div>
  <input type="text" id="search-box" placeholder="Search repos by name, path, or remote..." />
  <div class="header-controls">
    <button class="filter-btn" data-filter="hasDesc" title="Show only repos with descriptions">Has Desc</button>
    <button class="filter-btn" data-filter="noDesc" title="Show only repos without descriptions">No Desc</button>
    <div class="divider"></div>
    <button class="filter-btn" data-filter="hasNotes" title="Show only repos with notes">Has Notes</button>
    <button class="filter-btn" data-filter="noNotes" title="Show only repos without notes">No Notes</button>
    <div class="divider"></div>
    <button class="filter-btn" data-filter="hasTags" title="Show only repos with tags">Has Tags</button>
    <button class="filter-btn" data-filter="noTags" title="Show only repos without tags">No Tags</button>
    <div class="divider"></div>
    <button class="sort-btn active" data-sort="repoName">Name <span class="arrow">&#9650;</span></button>
    <button class="sort-btn" data-sort="lastUpdated">Updated <span class="arrow">&#9650;</span></button>
    <button class="sort-btn" data-sort="localPath">Path <span class="arrow">&#9650;</span></button>
  </div>
</div>

<div id="main">
  <div id="list-panel">
    <div class="loading">Loading repositories...</div>
  </div>
  <div id="detail-panel">
    <div class="detail-empty">Select a repository from the list</div>
  </div>
</div>

<script>
(function() {
  'use strict';

  const state = {
    repos: [],
    filtered: [],
    selected: null,
    searchQuery: '',
    sortField: 'repoName',
    sortDir: 'asc',
    filters: { hasDesc: false, noDesc: false, hasNotes: false, noNotes: false, hasTags: false, noTags: false },
    selectedTags: [],
    availableTags: []
  };

  // --- Markdown Renderer ---
  function renderMarkdown(text) {
    if (!text) return '<p class="muted">&mdash;</p>';
    let html = text;

    // Code blocks
    const codeBlocks = [];
    html = html.replace(/\\\`\\\`\\\`([\\s\\S]*?)\\\`\\\`\\\`/g, function(_, code) {
      const idx = codeBlocks.length;
      const cleaned = code.replace(/^\\w*\\n?/, '');
      codeBlocks.push('<pre><code>' + escapeHtml(cleaned.trim()) + '</code></pre>');
      return '%%CODEBLOCK_' + idx + '%%';
    });

    // Inline code (preserve before other transforms)
    const inlineCodes = [];
    html = html.replace(/\\\`([^\\\`]+)\\\`/g, function(_, code) {
      const idx = inlineCodes.length;
      inlineCodes.push('<code>' + escapeHtml(code) + '</code>');
      return '%%INLINE_' + idx + '%%';
    });

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    html = html.replace(/(^- .+(?:\\n- .+)*)/gm, function(block) {
      const items = block.split('\\n').map(function(line) {
        return '<li>' + line.replace(/^- /, '') + '</li>';
      }).join('');
      return '<ul>' + items + '</ul>';
    });

    // Ordered lists
    html = html.replace(/(^\\d+\\. .+(?:\\n\\d+\\. .+)*)/gm, function(block) {
      const items = block.split('\\n').map(function(line) {
        return '<li>' + line.replace(/^\\d+\\.\\s*/, '') + '</li>';
      }).join('');
      return '<ol>' + items + '</ol>';
    });

    // Paragraphs: split on double newlines for remaining text
    html = html.split(/\\n{2,}/).map(function(para) {
      para = para.trim();
      if (!para) return '';
      if (/^<(h[1-3]|ul|ol|pre|blockquote)/.test(para)) return para;
      return '<p>' + para.replace(/\\n/g, '<br>') + '</p>';
    }).join('');

    // Restore code blocks and inline codes
    codeBlocks.forEach(function(block, i) {
      html = html.replace('%%CODEBLOCK_' + i + '%%', block);
    });
    inlineCodes.forEach(function(code, i) {
      html = html.replace('%%INLINE_' + i + '%%', code);
    });

    return html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Tag helpers ---
  function computeAvailableTags() {
    var tagMap = {};
    state.repos.forEach(function(r) {
      if (r.tags) r.tags.forEach(function(t) {
        tagMap[t] = (tagMap[t] || 0) + 1;
      });
    });
    state.availableTags = Object.keys(tagMap).sort().map(function(t) {
      return { name: t, count: tagMap[t] };
    });
  }

  function apiCall(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      if (!res.ok) return res.json().then(function(e) { throw new Error(e.error || 'Request failed'); });
      return res.json();
    });
  }

  function toggleTagFilter(tag) {
    var index = state.selectedTags.indexOf(tag);
    if (index === -1) {
      state.selectedTags.push(tag);
    } else {
      state.selectedTags.splice(index, 1);
    }
    applyFilters();
    renderList();
  }

  function clearTagFilters() {
    state.selectedTags = [];
    applyFilters();
    renderList();
  }

  function addTagToRepo(localPath) {
    var input = document.getElementById('new-tag-input');
    var tag = input.value.trim();
    if (!tag) return;
    apiCall('/api/tags/add', { localPath: localPath, tags: [tag] })
      .then(function() {
        input.value = '';
        refreshAfterTagChange(localPath);
      })
      .catch(function(err) { alert(err.message); });
  }

  function removeTagFromRepo(localPath, tag) {
    apiCall('/api/tags/remove', { localPath: localPath, tags: [tag] })
      .then(function() {
        refreshAfterTagChange(localPath);
      })
      .catch(function(err) { alert(err.message); });
  }

  function eliminateTag(tagName) {
    if (!confirm('Remove tag "' + tagName + '" from ALL repositories?')) return;
    apiCall('/api/tags/eliminate', { tag: tagName })
      .then(function() {
        state.selectedTags = state.selectedTags.filter(function(t) { return t !== tagName; });
        var selectedPath = state.selected ? state.selected.localPath : null;
        refreshAfterTagChange(selectedPath);
      })
      .catch(function(err) { alert(err.message); });
  }

  function refreshAfterTagChange(selectedPath) {
    fetch('/api/registry')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        state.repos = data.repositories || data || [];
        computeAvailableTags();
        applyFilters();
        renderList();
        if (selectedPath) {
          var updated = state.repos.find(function(r) { return r.localPath === selectedPath; });
          if (updated) {
            state.selected = updated;
            renderList();
            renderDetail();
          }
        }
      });
  }

  // --- Data fetching ---
  function fetchRegistry() {
    fetch('/api/registry')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        state.repos = data.repositories || data || [];
        computeAvailableTags();
        applyFilters();
        renderList();
      })
      .catch(function(err) {
        document.getElementById('list-panel').innerHTML =
          '<div class="error-msg">Failed to load registry: ' + escapeHtml(err.message) + '</div>';
      });
  }

  // --- Filtering & Sorting ---
  function applyFilters() {
    let list = state.repos;

    // Text search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(function(r) {
        if (r.repoName.toLowerCase().includes(q)) return true;
        if (r.localPath.toLowerCase().includes(q)) return true;
        if (r.userDescription && r.userDescription.toLowerCase().includes(q)) return true;
        if (r.remotes && r.remotes.some(function(rem) {
          return rem.fetchUrl.toLowerCase().includes(q) || rem.pushUrl.toLowerCase().includes(q);
        })) return true;
        return false;
      });
    }

    // Filter toggles (AND with search)
    const f = state.filters;
    if (f.hasDesc) list = list.filter(function(r) { return r.description && r.description.businessDescription; });
    if (f.noDesc) list = list.filter(function(r) { return !r.description || !r.description.businessDescription; });
    if (f.hasNotes) list = list.filter(function(r) { return r.notes; });
    if (f.noNotes) list = list.filter(function(r) { return !r.notes; });
    if (f.hasTags) list = list.filter(function(r) { return r.tags && r.tags.length > 0; });
    if (f.noTags) list = list.filter(function(r) { return !r.tags || r.tags.length === 0; });

    // Tag filter (OR logic)
    if (state.selectedTags.length > 0) {
      list = list.filter(function(r) {
        if (!r.tags || r.tags.length === 0) return false;
        return state.selectedTags.some(function(st) {
          return r.tags.indexOf(st) >= 0;
        });
      });
    }

    // Sort
    const field = state.sortField;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    list = list.slice().sort(function(a, b) {
      let va = a[field] || '';
      let vb = b[field] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.filtered = list;
  }

  // --- Render list ---
  function renderList() {
    const panel = document.getElementById('list-panel');
    if (state.filtered.length === 0) {
      panel.innerHTML = '<div class="list-count">No repositories found</div>';
      return;
    }

    var tagBarHtml = '';
    if (state.availableTags.length > 0) {
      tagBarHtml = '<div id="tag-filter-bar">';
      state.availableTags.forEach(function(t) {
        var isActive = state.selectedTags.indexOf(t.name) >= 0;
        tagBarHtml += '<span class="tag-chip' + (isActive ? ' active' : '') + '" data-tag="' + escapeHtml(t.name) + '">';
        tagBarHtml += escapeHtml(t.name) + ' <span style="opacity:0.6">(' + t.count + ')</span>';
        tagBarHtml += ' <span class="tag-eliminate-x" data-eliminate-tag="' + escapeHtml(t.name) + '" title="Remove from all repos" style="margin-left:4px;opacity:0.5;cursor:pointer;font-size:10px">&times;</span>';
        tagBarHtml += '</span>';
      });
      if (state.selectedTags.length > 0) {
        tagBarHtml += '<span class="tag-chip" data-tag="__clear__" style="opacity:0.7">Clear</span>';
      }
      tagBarHtml += '</div>';
    }

    let html = tagBarHtml;
    html += '<div class="list-count">' + state.filtered.length + ' of ' + state.repos.length + ' repositories</div>';
    state.filtered.forEach(function(repo, idx) {
      const isSelected = state.selected && state.selected.localPath === repo.localPath;
      const hasDesc = repo.description && repo.description.businessDescription;
      const hasNotes = !!repo.notes;
      html += '<div class="repo-card' + (isSelected ? ' selected' : '') + '" data-idx="' + idx + '">';
      html += '<div class="repo-name">' + escapeHtml(repo.repoName) + '</div>';
      html += '<div class="repo-path">' + escapeHtml(repo.localPath) + '</div>';
      html += '<div class="repo-meta">';
      html += '<span class="branch-tag">' + escapeHtml(repo.currentBranch) + '</span>';
      if (hasDesc) html += '<span class="desc-indicator">&#9679; described</span>';
      if (repo.userDescription) html += '<span class="desc-indicator">&#9679; user desc</span>';
      if (hasNotes) html += '<span class="desc-indicator">&#9679; notes</span>';
      if (repo.tags && repo.tags.length > 0) {
        repo.tags.forEach(function(t) {
          html += '<span class="tag-badge" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>';
        });
      }
      html += '</div></div>';
    });

    panel.innerHTML = html;

    // Click handlers for repo cards
    panel.querySelectorAll('.repo-card').forEach(function(card) {
      card.addEventListener('click', function() {
        const idx = parseInt(card.getAttribute('data-idx'));
        state.selected = state.filtered[idx];
        renderList();
        renderDetail();
      });
    });

    // Click handlers for tag badges on repo cards
    panel.querySelectorAll('.tag-badge').forEach(function(badge) {
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        var tag = badge.getAttribute('data-tag');
        if (tag) toggleTagFilter(tag);
      });
    });

    // Click handlers for tag filter chips
    panel.querySelectorAll('.tag-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var tag = chip.getAttribute('data-tag');
        if (tag === '__clear__') {
          clearTagFilters();
        } else if (tag) {
          toggleTagFilter(tag);
        }
      });
    });

    // Click handlers for tag eliminate buttons on filter chips
    panel.querySelectorAll('.tag-eliminate-x').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var tag = btn.getAttribute('data-eliminate-tag');
        if (tag) eliminateTag(tag);
      });
    });
  }

  // --- Render detail ---
  function renderDetail() {
    const panel = document.getElementById('detail-panel');
    const repo = state.selected;
    if (!repo) {
      panel.innerHTML = '<div class="detail-empty">Select a repository from the list</div>';
      return;
    }

    let html = '<div class="detail-header">';
    html += '<h1>' + escapeHtml(repo.repoName) + '</h1>';
    html += '<span class="detail-path" id="copy-path" title="Click to copy path">' + escapeHtml(repo.localPath) + '</span>';
    html += '<span class="copied-toast" id="copied-toast">Copied!</span>';
    html += '</div>';

    // Current Branch
    html += '<div class="detail-section">';
    html += '<h2>Current Branch</h2>';
    html += '<span class="detail-branch-current">' + escapeHtml(repo.currentBranch) + '</span>';
    html += '</div>';

    // Remotes
    if (repo.remotes && repo.remotes.length > 0) {
      html += '<div class="detail-section">';
      html += '<h2>Remotes</h2>';
      html += '<table class="detail-table"><thead><tr><th>Name</th><th>Fetch URL</th><th>Push URL</th></tr></thead><tbody>';
      repo.remotes.forEach(function(rem) {
        html += '<tr><td>' + escapeHtml(rem.name) + '</td><td>' + escapeHtml(rem.fetchUrl) + '</td><td>' + escapeHtml(rem.pushUrl) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // Local Branches
    if (repo.localBranches && repo.localBranches.length > 0) {
      html += '<div class="detail-section">';
      html += '<h2>Local Branches</h2>';
      html += '<div class="branch-list">';
      repo.localBranches.forEach(function(b) {
        html += '<span class="branch-pill">' + escapeHtml(b) + '</span>';
      });
      html += '</div></div>';
    }

    // Remote Branches
    if (repo.remoteBranches && repo.remoteBranches.length > 0) {
      html += '<div class="detail-section">';
      html += '<h2>Remote Branches</h2>';
      html += '<div class="branch-list">';
      repo.remoteBranches.forEach(function(b) {
        html += '<span class="branch-pill">' + escapeHtml(b) + '</span>';
      });
      html += '</div></div>';
    }

    // Last Updated
    html += '<div class="detail-section">';
    html += '<h2>Last Updated</h2>';
    html += '<span class="detail-timestamp">' + formatTimestamp(repo.lastUpdated) + '</span>';
    html += '</div>';

    // User Description (above business description)
    html += '<div class="detail-section">';
    html += '<h2>User Description</h2>';
    if (repo.userDescription) {
      html += '<div class="user-desc-display" id="user-desc-text">' + escapeHtml(repo.userDescription) + '</div>';
      html += '<div class="user-desc-actions">';
      html += '<button class="user-desc-edit-btn" id="edit-user-desc-btn">Edit</button>';
      html += '<button class="user-desc-clear" id="clear-user-desc-btn">Clear</button>';
      html += '</div>';
    } else {
      html += '<p class="muted">(No user description)</p>';
      html += '<div class="user-desc-actions">';
      html += '<button class="user-desc-edit-btn" id="edit-user-desc-btn">Add Description</button>';
      html += '</div>';
    }
    // Hidden edit form
    html += '<div id="user-desc-edit-form" style="display:none; margin-top:8px;">';
    html += '<textarea class="user-desc-edit" id="user-desc-textarea"></textarea>';
    html += '<div class="user-desc-actions">';
    html += '<button class="user-desc-save" id="save-user-desc-btn">Save</button>';
    html += '<button class="user-desc-edit-btn" id="cancel-user-desc-btn">Cancel</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Business Description
    html += '<div class="detail-section">';
    html += '<h2>Business Description</h2>';
    html += '<div class="md-content">';
    if (repo.description && repo.description.businessDescription) {
      html += renderMarkdown(repo.description.businessDescription);
    } else {
      html += '<p class="muted">(No description)</p>';
    }
    html += '</div></div>';

    // Technical Description
    if (repo.description && repo.description.technicalDescription) {
      html += '<div class="detail-section">';
      html += '<h2>Technical Description</h2>';
      html += '<div class="md-content">' + renderMarkdown(repo.description.technicalDescription) + '</div>';
      html += '</div>';
    }

    // Tags
    html += '<div class="detail-section">';
    html += '<h2>Tags</h2>';
    html += '<div class="branch-list">';
    if (repo.tags && repo.tags.length > 0) {
      repo.tags.forEach(function(t) {
        html += '<span class="detail-tag-badge">' + escapeHtml(t);
        html += ' <span class="tag-remove-btn" data-remove-tag="' + escapeHtml(t) + '" title="Remove tag">&times;</span>';
        html += '</span>';
      });
    } else {
      html += '<span class="muted">(No tags)</span>';
    }
    html += '</div>';
    html += '<div class="tag-input-row">';
    html += '<input type="text" class="tag-input" id="new-tag-input" placeholder="Add tag..." />';
    html += '<button class="tag-add-btn" id="add-tag-btn">Add</button>';
    html += '</div>';
    html += '</div>';

    // Claude Sessions
    html += '<div class="detail-section">';
    html += '<h2>Claude Sessions</h2>';
    if (repo.claudeSessions && repo.claudeSessions.length > 0) {
      var sessions = repo.claudeSessions.slice().sort(function(a, b) {
        return new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime();
      });
      html += '<table class="detail-table"><thead><tr><th>Session ID</th><th>Collected</th><th>Resume Command</th></tr></thead><tbody>';
      sessions.forEach(function(s) {
        html += '<tr><td>' + escapeHtml(s.sessionId) + '</td>';
        html += '<td style="font-family:var(--sans-font)">' + formatTimestamp(s.collectedAt) + '</td>';
        html += '<td>claude --resume ' + escapeHtml(s.sessionId) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="muted">(No sessions saved)</p>';
    }
    html += '</div>';

    // Notes
    html += '<div class="detail-section">';
    html += '<h2>Notes</h2>';
    html += '<div class="md-content">';
    if (repo.notes) {
      html += renderMarkdown(repo.notes);
    } else {
      html += '<p class="muted">(No notes)</p>';
    }
    html += '</div></div>';

    panel.innerHTML = html;

    // Copy path handler
    document.getElementById('copy-path').addEventListener('click', function() {
      navigator.clipboard.writeText(repo.localPath).then(function() {
        const toast = document.getElementById('copied-toast');
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 1500);
      });
    });

    // Tag add handler
    var addTagBtn = document.getElementById('add-tag-btn');
    var tagInput = document.getElementById('new-tag-input');
    if (addTagBtn) {
      addTagBtn.addEventListener('click', function() {
        addTagToRepo(repo.localPath);
      });
    }
    if (tagInput) {
      tagInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addTagToRepo(repo.localPath);
      });
    }

    // Tag remove handlers
    panel.querySelectorAll('.tag-remove-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tag = btn.getAttribute('data-remove-tag');
        if (tag) removeTagFromRepo(repo.localPath, tag);
      });
    });

    // User description handlers
    var editUserDescBtn = document.getElementById('edit-user-desc-btn');
    var saveUserDescBtn = document.getElementById('save-user-desc-btn');
    var cancelUserDescBtn = document.getElementById('cancel-user-desc-btn');
    var clearUserDescBtn = document.getElementById('clear-user-desc-btn');
    var userDescEditForm = document.getElementById('user-desc-edit-form');
    var userDescTextarea = document.getElementById('user-desc-textarea');
    var userDescText = document.getElementById('user-desc-text');

    if (editUserDescBtn) {
      editUserDescBtn.addEventListener('click', function() {
        userDescTextarea.value = repo.userDescription || '';
        userDescEditForm.style.display = 'block';
        if (userDescText) userDescText.style.display = 'none';
        editUserDescBtn.style.display = 'none';
        if (clearUserDescBtn) clearUserDescBtn.style.display = 'none';
      });
    }

    if (saveUserDescBtn) {
      saveUserDescBtn.addEventListener('click', function() {
        var desc = userDescTextarea.value;
        apiCall('/api/user-desc', { localPath: repo.localPath, userDescription: desc })
          .then(function() {
            refreshAfterTagChange(repo.localPath);
          })
          .catch(function(err) { alert(err.message); });
      });
    }

    if (cancelUserDescBtn) {
      cancelUserDescBtn.addEventListener('click', function() {
        userDescEditForm.style.display = 'none';
        if (userDescText) userDescText.style.display = 'block';
        if (editUserDescBtn) editUserDescBtn.style.display = 'inline-block';
        if (clearUserDescBtn) clearUserDescBtn.style.display = 'inline-block';
      });
    }

    if (clearUserDescBtn) {
      clearUserDescBtn.addEventListener('click', function() {
        if (!confirm('Clear user description for this repository?')) return;
        fetch('/api/user-desc', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ localPath: repo.localPath })
        })
          .then(function(res) {
            if (!res.ok) return res.json().then(function(e) { throw new Error(e.error || 'Request failed'); });
            return res.json();
          })
          .then(function() {
            refreshAfterTagChange(repo.localPath);
          })
          .catch(function(err) { alert(err.message); });
      });
    }
  }

  function formatTimestamp(iso) {
    if (!iso) return '&mdash;';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      return escapeHtml(iso);
    }
  }

  // --- Event Bindings ---

  // Search
  document.getElementById('search-box').addEventListener('input', function(e) {
    state.searchQuery = e.target.value;
    applyFilters();
    renderList();
  });

  // Filter toggles
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const key = btn.getAttribute('data-filter');
      state.filters[key] = !state.filters[key];
      btn.classList.toggle('active');
      // Mutually exclusive toggles
      if (key === 'hasDesc' && state.filters.hasDesc) {
        state.filters.noDesc = false;
        document.querySelector('[data-filter="noDesc"]').classList.remove('active');
      } else if (key === 'noDesc' && state.filters.noDesc) {
        state.filters.hasDesc = false;
        document.querySelector('[data-filter="hasDesc"]').classList.remove('active');
      } else if (key === 'hasNotes' && state.filters.hasNotes) {
        state.filters.noNotes = false;
        document.querySelector('[data-filter="noNotes"]').classList.remove('active');
      } else if (key === 'noNotes' && state.filters.noNotes) {
        state.filters.hasNotes = false;
        document.querySelector('[data-filter="hasNotes"]').classList.remove('active');
      } else if (key === 'hasTags' && state.filters.hasTags) {
        state.filters.noTags = false;
        document.querySelector('[data-filter="noTags"]').classList.remove('active');
      } else if (key === 'noTags' && state.filters.noTags) {
        state.filters.hasTags = false;
        document.querySelector('[data-filter="hasTags"]').classList.remove('active');
      }
      applyFilters();
      renderList();
    });
  });

  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const field = btn.getAttribute('data-sort');
      if (state.sortField === field) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDir = 'asc';
      }
      // Update UI
      document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      btn.querySelector('.arrow').innerHTML = state.sortDir === 'asc' ? '&#9650;' : '&#9660;';
      applyFilters();
      renderList();
    });
  });

  // --- Init ---
  fetchRegistry();

})();
</script>
</body>
</html>`;
}

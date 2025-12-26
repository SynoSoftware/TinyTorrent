const { execSync } = require('child_process');
const diff = execSync('git diff --unified=0 HEAD', { encoding: 'utf8' });

const lines = diff.split('\n');
let i = 0;
const entries = [];
let currentFile = null;
let oldFile = null;
let newFile = null;

const mapping = [
  { file: 'src/modules/dashboard/components/TorrentTable.tsx', pattern: 'grid-cols-[calc(12*var(--u)*var(--z))', semantic_role: 'table icon column width', category: 'density', resolution: 'restored_px' },
  { file: 'src/modules/dashboard/components/TorrentTable.tsx', pattern: 'gap-[calc(6*var(--u)*var(--z))]', semantic_role: 'empty-state spacing', category: 'readability', resolution: 'restored_px' },
  { file: 'src/modules/dashboard/components/TorrentTable.tsx', pattern: 'px-[calc(4*var(--u)*var(--z))]', semantic_role: 'skeleton row padding', category: 'density', resolution: 'restored_px' },
  { file: 'src/modules/dashboard/components/TorrentTable.tsx', pattern: 'min-w-[calc(55*var(--u)*var(--z))]', semantic_role: 'header dropdown min-width', category: 'readability', resolution: 'restored_px' },
  { file: 'src/modules/dashboard/components/details/visualizations/PiecesMap.tsx', pattern: 'max-w-[calc(57.5*var(--u)*var(--z))]', semantic_role: 'pieces-map tooltip max width', category: 'readability', resolution: 'restored_px' },
  { file: 'src/modules/dashboard/components/details/visualizations/PeerScatter.tsx', pattern: 'max-w-[calc(25*var(--u)*var(--z))]', semantic_role: 'peer-scatter tooltip max width', category: 'readability', resolution: 'restored_px' },
  { file: 'src/shared/ui/workspace/DirectoryPicker.tsx', pattern: 'max-w-[calc(160*var(--u)*var(--z))]', semantic_role: 'modal readable width clamp', category: 'readability', resolution: 'restored_prev_expr' },
  { file: 'src/app/components/WorkspaceShell.tsx', pattern: 'mx-auto max-w-[calc(350*var(--u)*var(--z))]', semantic_role: 'immersive main max-width clamp', category: 'structural', resolution: 'restored_prev_expr' },
  { file: 'src/modules/dashboard/components/ModeLayout.tsx', pattern: 'defaultSize={50}', semantic_role: 'inspector default pane size', category: 'structural', resolution: 'restored_prev_expr' },
  { file: 'src/index.css', pattern: '--tt-search-width: calc(40 * var(--u) * var(--z))', semantic_role: 'global token additions', category: 'density', resolution: 'reverted_agent_token' }
];

function findMapping(file, beforeText) {
  for (const m of mapping) {
    if (m.file === file && beforeText.includes(m.pattern)) return m;
  }
  return null;
}

while (i < lines.length) {
  const line = lines[i];
  if (line.startsWith('diff --git')) {
    let j = i+1;
    oldFile = null; newFile = null;
    while (j < lines.length && !(lines[j].startsWith('@@') )) {
      if (lines[j].startsWith('--- ')) oldFile = lines[j].slice(4).trim();
      if (lines[j].startsWith('+++ ')) newFile = lines[j].slice(4).trim();
      j++;
    }
    const filePath = (newFile || oldFile || '').replace(/^a\//, '').replace(/^b\//, '');
    currentFile = filePath;
    i = j;
    continue;
  }
  if (line.startsWith('@@')) {
    const header = line;
    const m = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;
    if (m) {
      oldStart = parseInt(m[1], 10);
      oldCount = m[2] ? parseInt(m[2],10) : 1;
      newStart = parseInt(m[3],10);
      newCount = m[4] ? parseInt(m[4],10) : 1;
    }
    i++;
    const removed = [];
    const added = [];
    while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
      const l = lines[i];
      if (l.startsWith('-')) removed.push(l.slice(1));
      else if (l.startsWith('+')) added.push(l.slice(1));
      i++;
    }
    const before = removed.join('\n');
    const after = added.join('\n');
    const line_range = oldCount > 0 ? `${oldStart}-${oldStart+oldCount-1}` : `${newStart}-${newStart+newCount-1}`;

    const map = findMapping(currentFile, before);
    const semantic_role = map ? map.semantic_role : '';
    const category = map ? map.category : '';
    const resolution = map ? map.resolution : '';

    entries.push({
      file: currentFile,
      line_range,
      before,
      after,
      semantic_role,
      category,
      resolution
    });

    continue;
  }
  i++;
}

const fs = require('fs');
const path = require('path');
const outPath = path.resolve(__dirname, 'zoom_report.json');
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf8');
console.error('WROTE ' + outPath);
console.log(JSON.stringify({ written: outPath, count: entries.length }));

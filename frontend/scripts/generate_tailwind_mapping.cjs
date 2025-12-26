#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'forensic-tailwind-mapping-after.txt');

/**
 * Structural layout invariants (ALWAYS allowed)
 * These do NOT represent UI geometry.
 */
const STRUCTURAL_WHITELIST_RE =
  /\b(h-full|w-full|min-h-0|min-w-0|flex-1|shrink-0|inset-0|inset-x-0|inset-y-0|top-0|bottom-0|left-0|right-0|z-\d+)\b/;

/**
 * Detection patterns
 */
const patterns = [
  {
    key: 'bracketed-var',
    re: /\[var\([^)]+\)\]/g,
    desc: 'BANNED: Bracketed var(...) uses'
  },
  {
    key: 'numeric-geometry',
    re: /\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|size|w|min-w|max-w|h|min-h|max-h|inset-x|inset-y)-\d+(\.\d+)?\b/g,
    desc: 'BANNED: Numeric UI geometry'
  },
  {
    key: 'text-numeric-px',
    re: /\btext-\d+px\b/g,
    desc: 'BANNED: Hardcoded pixel text'
  },
  {
    key: 'heroui-sm',
    re: /size=["']sm["']/g,
    desc: 'BANNED: Neutered sizing'
  },
  {
    key: 'rpc-unsafe',
    re: /z\.any\(\)/g,
    desc: 'BANNED: Unsafe RPC schema'
  },
  {
    key: 'bracket-any',
    re: /[\w-]*-\[[^\]]+\]/g,
    desc: 'REVIEW: Tailwind arbitrary brackets'
  }
];

/**
 * Recursive file walker
 */
function walk(dir, fileCb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
      walk(full, fileCb);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.html'].includes(ext)) {
        fileCb(full);
      }
    }
  }
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

/**
 * Collect results
 */
const results = {};
for (const p of patterns) results[p.key] = [];

walk(SRC, (file) => {
  const relPath = path.relative(ROOT, file);

  // Authority files define geometry — exempt them
  const isAuthorityFile =
    relPath.includes('index.css') || relPath.includes('constants.json');

  let lines;
  try {
    lines = readLines(file);
  } catch {
    return;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const p of patterns) {
      // Skip geometry checks in authority files
      if (
        isAuthorityFile &&
        (p.key === 'numeric-geometry' ||
         p.key === 'bracket-any' ||
         p.key === 'text-numeric-px')
      ) {
        continue;
      }

      const match = line.match(p.re);
      if (!match) continue;

      // Ignore structural layout invariants
      if (p.key === 'numeric-geometry' && STRUCTURAL_WHITELIST_RE.test(line)) {
        continue;
      }

      results[p.key].push({
        file: relPath,
        line: i + 1,
        text: line.trim()
      });
    }
  }
});

/**
 * Write report
 */
function writeOut() {
  const lines = [
    'Forensic Mapping: forensic-tailwind-mapping-after.txt',
    `Timestamp: ${new Date().toISOString()}`,
    '',
    'SUMMARY (Excluding Authority Files):'
  ];

  for (const p of patterns) {
    lines.push(` - ${p.key}: ${results[p.key].length} matches`);
  }

  for (const p of patterns) {
    lines.push('', `--- ${p.key} (${p.desc}) ---`);
    results[p.key].slice(0, 500).forEach(r => {
      lines.push(` - ${r.file}:${r.line} → ${r.text}`);
    });
  }

  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('Clean audit written to', OUT);
}

writeOut();

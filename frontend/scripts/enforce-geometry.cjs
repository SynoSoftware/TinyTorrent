#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Patterns that indicate px-based Tailwind escapes or inline px geometry
const patterns = [
  /text-\[\d+px\]/g,
  /h-\[\d+(?:px|vh|%)\]/g,
  /w-\[\d+(?:px|vw|%)\]/g,
  /min-w-\[\d+px\]/g,
  /max-w-\[\d+px\]/g,
  /gap-\[\d+px\]/g,
  /tracking-\[0-9.]+em\]/g,
  /rounded-\[\d+px\]/g,
  /\b\d+px\b/g,
];

// Folders allowed to use px escapes (visualizations, canvas code)
const ALLOWED_PATH_SEGMENTS = [
  path.join('src', 'modules', 'dashboard', 'components', 'details', 'visualizations'),
  path.join('src', 'shared', 'ui', 'visualizations'),
];

// Explicit files allowed to contain px literals (design tokens, core CSS, or legacy developer files)
const ALLOWED_FILES = [
  path.join('src', 'index.css'),
  path.join('src', 'App.css'),
  path.join('src', 'hero.ts'),
  path.join('src', 'config', 'logic.ts'),
  path.join('src', 'config', 'constants.json'),
];

function isAllowed(filePath) {
  const normalized = filePath.split(path.sep).join(path.posix.sep);
  return ALLOWED_PATH_SEGMENTS.some(seg => normalized.includes(seg.split(path.sep).join(path.posix.sep)));
}

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const violations = [];

walk(src, (file) => {
  if (!/\.tsx?$/.test(file) && !/\.jsx?$/.test(file) && !/\.css$/.test(file) && !/\.json$/.test(file)) return;
  const rel = path.relative(root, file);
  if (isAllowed(rel)) return; // skip allowed visualization code
  if (ALLOWED_FILES.some(f => rel === f)) return; // skip explicit allowed files
  const content = fs.readFileSync(file, 'utf8');
  for (const pat of patterns) {
    const match = content.match(pat);
    if (match) {
      violations.push({ file: rel, pattern: pat.toString(), matches: match.slice(0,5) });
      break;
    }
  }
});

if (violations.length) {
  console.error('\nGeometry enforcement violations found (px escapes outside allowed visualization folders):\n');
  for (const v of violations) {
    console.error(` - ${v.file}: ${v.pattern} => examples: ${v.matches.join(', ')}`);
  }
  console.error('\nFix by replacing px escapes with token-driven lengths (e.g., text-[length:var(--fz-scaled)]).');
  process.exit(2);
} else {
  console.log('Geometry enforcement: no violations found.');
  process.exit(0);
}

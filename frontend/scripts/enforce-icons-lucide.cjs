// scripts/enforce-icons-lucide.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const results = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist'].includes(e.name)) continue;
      walk(full);
    } else if (/\.(tsx|jsx)$/.test(e.name)) {
      const content = fs.readFileSync(full, 'utf8');
      if (/from ['"]lucide-react['"]/.test(content) || /<\w+Icon\b/.test(content)) {
        content.split('\n').forEach((line, i) => {
          if (/<[A-Z][A-Za-z0-9]*\b/.test(line)) {
            results.push({
              file: path.relative(ROOT, full),
              line: i + 1,
              text: line.trim()
            });
          }
        });
      }
    }
  }
}

walk(SRC);

fs.writeFileSync(
  path.join(ROOT, 'icon-lucide-usage.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);

console.log('Lucide icon census written:', results.length);

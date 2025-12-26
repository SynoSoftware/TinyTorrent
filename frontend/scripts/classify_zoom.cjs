const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, 'zoom_report.json');
if (!fs.existsSync(p)) {
  console.error('zoom_report.json not found');
  process.exit(2);
}
const raw = fs.readFileSync(p, 'utf8');
let data;
try { data = JSON.parse(raw); } catch (e) { console.error('invalid json', e); process.exit(2);} 

const typRe = /text-\[length:var\(--fz[-A-Za-z0-9_]*\)\]/i;
const typTokenRe = /--fz-([A-Za-z0-9_\-]+)/i;
const spaceRe = /\b(px|py|p|pt|pb|pl|pr|gap|m|mt|mb|ml|mr)-\[length:var\(--p-([A-Za-z0-9_\-]+)\)\]/i;
const genericRe = /\[length:var\(/i;

const out = [];
for (const e of data) {
  const before = (e.before||'')+'';
  if (!before) continue;
  if (!genericRe.test(before)) continue; // only classify entries that contained length:var
  let bucket = 'C';
  let suggestion = null;
  if (typRe.test(before)) {
    bucket = 'A';
    const m = before.match(typTokenRe);
    const token = m && m[1] ? m[1] : 'scaled';
    suggestion = token === 'scaled' ? 'text-scaled' : `text-${token}`;
  } else if (spaceRe.test(before)) {
    bucket = 'B';
    const m = before.match(spaceRe);
    const prefix = m[1];
    const ptoken = m[2];
    suggestion = `${prefix}-p-${ptoken}`;
  } else {
    bucket = 'C';
    suggestion = before.replace(/\[length:/, '[').slice(0,300);
  }
  out.push({
    file: e.file,
    line_range: e.line_range,
    before: e.before,
    after: e.after,
    bucket,
    suggestion,
  });
}

const outPath = path.resolve(__dirname, 'zoom_classification.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', outPath, 'entries', out.length);

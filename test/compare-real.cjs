// Compare two vault directories for FULL consistency (notes + attachments),
// ignoring .obsidian and the configured exclude patterns.
// Usage: node test/compare-real.cjs <vaultA> <vaultB>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const excludes = ['.obsidian', '_conflicts', 'templates'];
// Exclude any path that contains one of these segments anywhere (not just at
// the top level), so nested `.obsidian` plugin dirs (e.g. tew/.obsidian/...) are
// ignored just like the vault's own .obsidian config.
function isExcluded(rel) {
  const segs = rel.split('/');
  return segs.some(s => excludes.includes(s));
}

function walk(root) {
  const map = new Map(); // relPath -> sha256 hex
  const rec = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (e.isDirectory()) { if (!isExcluded(rel)) rec(full); }
      else {
        if (isExcluded(rel)) continue;
        const buf = fs.readFileSync(full);
        map.set(rel, crypto.createHash('sha256').update(buf).digest('hex'));
      }
    }
  };
  rec(root);
  return map;
}

const a = walk(process.argv[2]);
const b = walk(process.argv[3]);
const ak = new Set(a.keys()), bk = new Set(b.keys());

const missingInB = [...ak].filter(k => !bk.has(k));
const extraInB = [...bk].filter(k => !ak.has(k));
const contentDiff = [...ak].filter(k => bk.has(k) && a.get(k) !== b.get(k));

const mdDiff = contentDiff.filter(k => k.endsWith('.md'));
const fileDiff = contentDiff.filter(k => !k.endsWith('.md'));

console.log('A files:', a.size, '| B files:', b.size);
console.log('MISSING in B (present in A):', missingInB.length);
console.log('EXTRA   in B (present in B):', extraInB.length);
console.log('CONTENT DIFF (same path, different hash):', contentDiff.length, '| notes:', mdDiff.length, '| files:', fileDiff.length);

function show(title, arr) {
  if (!arr.length) return;
  console.log('\n--- ' + title + ' (first 40) ---');
  console.log(arr.slice(0, 40).join('\n'));
}
show('MISSING in B', missingInB);
show('EXTRA in B', extraInB);
show('CONTENT DIFF', contentDiff);

const consistent = missingInB.length === 0 && extraInB.length === 0 && contentDiff.length === 0;
console.log('\n=== ' + (consistent ? 'CONSISTENT ✅' : 'INCONSISTENT ❌') + ' ===');
process.exit(consistent ? 0 : 1);

import * as fs from 'fs';
import * as path from 'path';

function walkMd(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === '.obsidian') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) rec(full);
      else if (e.name.endsWith('.md')) out.set(path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
    }
  };
  rec(root);
  return out;
}

const a = walkMd('/home/wang/文档/test');
const b = walkMd('/home/wang/文档/test1');
const ak = new Set(a.keys()), bk = new Set(b.keys());
const missingInB: string[] = []; for (const k of ak) if (!bk.has(k)) missingInB.push(k);
const extraInB: string[] = []; for (const k of bk) if (!ak.has(k)) extraInB.push(k);
const contentDiff: string[] = []; for (const k of ak) if (bk.has(k) && a.get(k) !== b.get(k)) contentDiff.push(k);
const onlyTrailingNl = contentDiff.filter(k => a.get(k)!.replace(/\n+$/,'') === b.get(k)!.replace(/\n+$/,''));

console.log('test/  .md files:', a.size);
console.log('test1/ .md files:', b.size);
console.log('MISSING in test1 (in test, not test1):', missingInB.length);
console.log('EXTRA   in test1 (in test1, not test):', extraInB.length);
console.log('CONTENT DIFF (same path, different bytes):', contentDiff.length, '| of which only trailing-newline diffs:', onlyTrailingNl.length);
console.log('\n--- sample MISSING in test1 (first 30) ---');
console.log(missingInB.slice(0, 30).join('\n'));
console.log('\n--- sample EXTRA in test1 (first 30) ---');
console.log(extraInB.slice(0, 30).join('\n'));
console.log('\n--- sample CONTENT DIFF (first 20) ---');
console.log(contentDiff.slice(0, 20).join('\n'));

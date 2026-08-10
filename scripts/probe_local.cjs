const fs = require('fs');
const path = '/home/wang/文档/test';
const d = JSON.parse(fs.readFileSync(path + '/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const excludes = d.excludePatterns || [];
const isExcluded = (p) => excludes.some((e) => p.startsWith(e)) || p.startsWith('.obsidian/');
const localMd = [], localNonMd = [];
const walkFs = (dir) => {
  let ents;
  try { ents = fs.readdirSync(path + (dir ? '/' + dir : ''), { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || excludes.some((x) => (rel + '/').startsWith(x))) continue;
      walkFs(rel);
    } else if (e.isFile()) {
      if (isExcluded(rel)) continue;
      if (rel.endsWith('.md')) localMd.push(rel); else localNonMd.push(rel);
    }
  }
};
walkFs('');
const localDirs = new Set();
for (const f of [...localMd, ...localNonMd]) {
  if (!f.includes('/')) continue;
  const parts = f.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) localDirs.add(parts.slice(0, i).join('/'));
}
console.log('verifycount 算法: md=' + localMd.length + ' nonMd=' + localNonMd.length + ' dirs=' + localDirs.size);
// 真实遍历
const realDirs = new Set();
for (const root, ) {}

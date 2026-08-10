// 用 CLI 方式测 shouldExclude
const path = '/home/wang/文档/test';
const d = JSON.parse(require('fs').readFileSync(path + '/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const excludes = d.excludePatterns || [];
const shouldExclude = (p) => {
  if (excludes.some(x => p.startsWith(x))) return true;
  const segments = p.split('/').filter(s => s.length > 0);
  return segments.some(seg => seg.startsWith('.'));
};
const tests = [
  'AIReports/探寻生命的意义/公众号系列/day-1/article.md',
  'AIReports/探寻生命的意义/',
  'code/foo.md',
  'memory/work.md',
  'AIReports/Charts/a.png',
];
for (const t of tests) console.log(shouldExclude(t) ? 'EXCLUDE' : 'include', t);

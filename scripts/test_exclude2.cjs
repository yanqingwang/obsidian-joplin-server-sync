const d = JSON.parse(require('fs').readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const excludes = d.excludePatterns || [];
const p = 'AITasks/00 Table of Content.md';
console.log('excludes:', excludes);
console.log('startsWith 命中:', excludes.some(x => p.startsWith(x)));
const segments = p.split('/');
console.log('隐藏段:', segments.some(s => s.startsWith('.')));

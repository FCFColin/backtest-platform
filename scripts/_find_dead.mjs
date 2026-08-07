import fs from 'fs';
import path from 'path';

const srcDirs = ['packages/frontend/src', 'packages/backend/src'];
const exts = ['.ts', '.tsx'];
const files = [];

function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name.match(/node_modules|\.turbo|dist/)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (exts.includes(path.extname(f.name))) files.push(p);
  }
}
srcDirs.forEach(walk);

const allContent = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const dead = [];
for (const f of files) {
  const base = path.basename(f, path.extname(f));
  if (base === 'index' || base === 'main' || base === 'App' || base.startsWith('vite-env'))
    continue;
  const importName = base.replace(/\.(ts|tsx)$/, '');
  const matches = allContent.match(new RegExp(`from.*['"].*${importName}['"]`, 'g'));
  if (!matches) dead.push(f.replace(/\\/g, '/'));
}
dead.sort();
console.log(dead.join('\n'));
console.log('\nTotal potential dead files:', dead.length);

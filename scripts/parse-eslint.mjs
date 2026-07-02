import fs from 'node:fs';

const file = process.argv[2] ?? 'eslint-pages.json';
const raw = fs.readFileSync(file, 'utf8');
const data = JSON.parse(raw);

const warns = [];
for (const f of data) {
  if (!f.messages) continue;
  for (const m of f.messages) {
    if (m.severity !== 1) continue; // warnings only
    const short = f.filePath.split('src\\pages\\')[1] ?? f.filePath;
    warns.push(`${short}:${m.line}:${m.column} ${m.ruleId} — ${m.message}`);
  }
}
warns.forEach((w) => console.log(w));
console.log(`\nTOTAL WARNINGS: ${warns.length}`);

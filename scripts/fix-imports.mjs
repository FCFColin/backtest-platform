import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('packages/frontend/src/**/*.{ts,tsx}');

const patterns = [
  { from: /(from\s+['"])\.\.\/\.\.\/shared\/types\/signal(['"])/g, to: "$1@backtest/shared/types/signal$2" },
  { from: /(from\s+['"])\.\.\/\.\.\/shared\/types\/tactical(['"])/g, to: "$1@backtest/shared/types/tactical$2" },
  { from: /(from\s+['"])\.\.\/\.\.\/shared\/types(['"])/g, to: "$1@backtest/shared$2" },
  { from: /(from\s+['"])\.\.\/\.\.\/shared\/constants(['"])/g, to: "$1@backtest/shared/constants$2" },
  { from: /(from\s+['"])@backtest\/shared\/types(['"])/g, to: "$1@backtest/shared$2" },
];

let fixed = 0;
for (const fp of files) {
  let content = readFileSync(fp, 'utf8');
  let changed = false;
  for (const p of patterns) {
    const test = content.replace(p.from, '__REPLACED__');
    if (test !== content) {
      content = content.replace(p.from, p.to);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(fp, content);
    fixed++;
    console.log('Fixed:', fp);
  }
}
console.log('Fixed', fixed, 'files');

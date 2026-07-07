import { readFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('packages/frontend/src/**/*.{ts,tsx}');
let remaining = 0;
for (const fp of files) {
  const c = readFileSync(fp, 'utf8');
  const m = c.match(/from\s+['"](\.\.\/)+shared/);
  if (m) { remaining++; console.log(fp, m[0]); }
}
console.log('Files with relative shared imports:', remaining);

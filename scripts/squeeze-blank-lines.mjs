import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const exts = ['.ts', '.tsx', '.go', '.css', '.yaml', '.yml', '.mjs', '.sql'];
const skip = /node_modules|dist|coverage|\.git|\.turbo|\.nyc_output|lcov-report|\.dev-logs|pnpm-lock/;

const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  .trim()
  .split('\n')
  .filter((f) => exts.some((e) => f.endsWith(e)) && !skip.test(f));

let totalRemoved = 0;
let filesChanged = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const original = readFileSync(file, 'utf8');
  const lines = original.split('\n');
  const result = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun++;
      if (blankRun <= 1) result.push(line);
    } else {
      blankRun = 0;
      result.push(line);
    }
  }
  while (result.length > 0 && result[result.length - 1].trim() === '') result.pop();
  if (result.length > 0) result.push('');
  const output = result.join('\n');
  if (output !== original) {
    totalRemoved += lines.length - result.length;
    filesChanged++;
    writeFileSync(file, output);
    if (filesChanged % 50 === 0) console.log(`  ${filesChanged} files, ${totalRemoved} lines removed...`);
  }
}

console.log(`Done: ${filesChanged} files changed, ${totalRemoved} blank lines removed.`);

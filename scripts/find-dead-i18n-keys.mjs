import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const localeFile = 'packages/frontend/src/i18n/locales/zh-CN/common.json';
const content = readFileSync(localeFile, 'utf8');
const keys = Object.keys(JSON.parse(content));

const skip = /node_modules|dist|coverage|\.git|\.turbo|lcov-report|common\.json/;
const sourceFiles = execSync('git ls-files "*.ts" "*.tsx"', {
  encoding: 'utf8',
  maxBuffer: 30 * 1024 * 1024,
})
  .trim()
  .split('\n')
  .filter((f) => !skip.test(f));

const allSource = sourceFiles
  .filter(existsSync)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const dead = [];
for (const key of keys) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`['"\`]${escaped}['"\`]`);
  if (!pattern.test(allSource)) {
    dead.push(key);
  }
}

console.log(`Total keys: ${keys.length}`);
console.log(`Dead keys: ${dead.length}`);
if (dead.length > 0) {
  console.log('\nDead keys:');
  for (const key of dead) {
    const value = JSON.parse(content)[key];
    const preview = value.length > 60 ? value.slice(0, 57) + '...' : value;
    console.log(`  "${key}" => "${preview}"`);
  }
}

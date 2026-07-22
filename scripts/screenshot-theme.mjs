import { firefox } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const specsDir = join(rootDir, '.trae', 'specs');

(async () => {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Navigate and wait for load
  await page.goto('http://localhost:5176/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Light mode screenshot
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  // Trigger React to re-render if needed by dispatching storage event or just reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(specsDir, 'local-v3-light-v3.png'), fullPage: false });

  // Toggle to dark mode
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(specsDir, 'local-v3-dark-v3.png'), fullPage: false });

  await browser.close();
  console.log('Screenshots saved successfully');
})();

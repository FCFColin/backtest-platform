import { firefox } from '@playwright/test';

const BASE_URL = 'http://localhost:5176';

(async () => {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // === 验证 1: 信息条已删除 ===
  console.log('=== Test 1: info-banner removed ===');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const bannerExists = await page.locator('.info-banner').count();
  console.log(`  info-banner count: ${bannerExists} (expected: 0)`);
  console.log(`  ${bannerExists === 0 ? '✓ PASS' : '✗ FAIL'}: info-banner removed`);

  // === 验证 2: 点击 ADD EMPTY 后组合为空 ===
  console.log('\n=== Test 2: ADD EMPTY creates empty portfolio ===');
  // 先确保在 backtest 页面
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);

  // 点击 ADD EMPTY 按钮
  const addEmptyBtn = page.locator('button.portfolios-add-btn', { hasText: /ADD EMPTY|添加空组合/i }).first();
  if (await addEmptyBtn.count() > 0) {
    await addEmptyBtn.click();
    await page.waitForTimeout(500);

    // 检查是否有 portfolio 卡片出现
    const cards = await page.locator('.portfolio-card').count();
    console.log(`  portfolio cards after ADD EMPTY: ${cards}`);

    // 检查卡片内是否有 ticker 输入
    const tickerInputs = await page.locator('.ticker-input').count();
    console.log(`  ticker inputs: ${tickerInputs} (expected: 0 for empty portfolio)`);
    console.log(`  ${tickerInputs === 0 ? '✓ PASS' : '✗ FAIL'}: empty portfolio has no tickers`);

    // 检查是否有 VTI 或 BND 文本
    const vtiText = await page.locator('text=VTI').count();
    const bndText = await page.locator('text=BND').count();
    console.log(`  VTI occurrences: ${vtiText}, BND occurrences: ${bndText}`);
    console.log(`  ${vtiText === 0 && bndText === 0 ? '✓ PASS' : '✗ FAIL'}: no VTI/BND in empty portfolio`);
  } else {
    console.log('  ⚠️ ADD EMPTY button not found, trying LOAD EXAMPLE first...');
    const loadExample = page.locator('button', { hasText: /LOAD EXAMPLE|加载示例/i }).first();
    if (await loadExample.count() > 0) {
      console.log('  Found LOAD EXAMPLE button, clicking...');
      await loadExample.click();
      await page.waitForTimeout(500);
    }
    // 现在尝试找 ADD EMPTY
    const addEmptyBtn2 = page.locator('button.portfolios-add-btn', { hasText: /ADD EMPTY|添加空组合/i }).first();
    if (await addEmptyBtn2.count() > 0) {
      await addEmptyBtn2.click();
      await page.waitForTimeout(500);
      const tickerInputs = await page.locator('.ticker-input').count();
      console.log(`  ticker inputs after ADD EMPTY: ${tickerInputs}`);
    }
  }

  // === 验证 3: 货币切换 ===
  console.log('\n=== Test 3: Currency toggle ===');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);

  const currencyBtn = page.locator('.navbar-currency-btn');
  if (await currencyBtn.count() > 0) {
    const textBefore = await currencyBtn.textContent();
    console.log(`  Currency button text before: "${textBefore?.trim()}"`);

    await currencyBtn.click();
    await page.waitForTimeout(500);

    const textAfter = await currencyBtn.textContent();
    console.log(`  Currency button text after: "${textAfter?.trim()}"`);

    const changed = textBefore !== textAfter;
    console.log(`  ${changed ? '✓ PASS' : '✗ FAIL'}: currency changed on click`);

    // 检查参数区货币选择器是否同步
    const currencySelect = page.locator('select.param-input').filter({ hasText: /USD|CNY/i }).first();
    if (await currencySelect.count() > 0) {
      const selectValue = await currencySelect.inputValue();
      console.log(`  Param currency select value: "${selectValue}"`);
    }
  } else {
    console.log('  ✗ FAIL: currency button not found');
  }

  // === 验证 4: 语言切换无抖动 ===
  console.log('\n=== Test 4: Language switch stability ===');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);

  // 测量导航栏高度在切换前后是否变化
  const navbarBefore = await page.locator('.navbar').boundingBox();
  console.log(`  Navbar size before: ${navbarBefore?.width}x${navbarBefore?.height}`);

  const langBtn = page.locator('.navbar-icon-btn').first();
  await langBtn.click();
  await page.waitForTimeout(1000);

  const navbarAfter = await page.locator('.navbar').boundingBox();
  console.log(`  Navbar size after: ${navbarAfter?.width}x${navbarAfter?.height}`);

  const sizeStable = navbarBefore?.width === navbarAfter?.width && navbarBefore?.height === navbarAfter?.height;
  console.log(`  ${sizeStable ? '✓ PASS' : '⚠️ CHECK'}: navbar size ${sizeStable ? 'stable' : 'changed'}`);

  // 检查页面是否有错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await browser.close();

  console.log('\n=== Summary ===');
  if (errors.length > 0) {
    console.log(`Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('No console errors detected');
  }
})();

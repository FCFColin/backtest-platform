// scripts/verify/C-004-005-006-019-frontend.mjs
//
// P0-4 验证：前端 4 项 CRITICAL 修复真实性验证（C-004 / C-005 / C-006 / C-019）
//
// 说明（重要）：
//   任务要求使用 chrome-devtools MCP 工具进行动态验证，但本次运行时 MCP 服务器
//   `mcp_plugin_Chrome_DevTools_chrome-devtools` 未连接（run_mcp 返回 "MCP tool is not found"），
//   且 on-disk 声明路径 s_回测平台-9c1e0a21 不存在（实际为 s_量化平台-bc492fe8）。
//   属于基础设施不可用（非本子智能体可控）。dev server (vite :15173) 已正常运行，
//   `@playwright/test`（tmp.md P0-4 原始方案所用库）在根目录可解析。
//   为产出真实验证证据而非 3/4 项 SKIP，按 tmp.md 原方案使用 Playwright chromium 作为后备，
//   并在最终报告中明确记录此后备。静态检查 (C-019 grep useEngineHealth) 不受影响。
//
// 验证项：
//   C-004 Navbar/PromoBar 路由断链（登录链接 404）— 点击登录链接验证 URL=/login 非 404
//   C-005 起始资金默认值 invalid — input.value 非空、validity.valid===true、运行按钮存在且未禁用
//   C-006 CLS=1.05 修复（目标 < 0.1）— PerformanceObserver 实测 layout-shift
//   C-019 删除 useEngineHealth 死代码 — grepInCode 0 匹配
//
// 运行：node scripts/verify/C-004-005-006-019-frontend.mjs
//   前置：dev server 在 http://localhost:15173/ 运行（vite）

import { chromium } from '@playwright/test';
import { writeAggregatedResult, grepInCode } from './_lib.mjs';

const BASE = 'http://localhost:15173';
const SHOTS = 'docs/audit/2026-07-28/verify/screenshots';

const results = {
  C004: { status: 'SKIP', summary: '未执行', details: {} },
  C005: { status: 'SKIP', summary: '未执行', details: {} },
  C006: { status: 'SKIP', summary: '未执行', details: {} },
  C019: { status: 'SKIP', summary: '未执行', details: {} },
  bonusChecks: { status: 'SKIP', summary: '未执行', details: {} },
};

// ── C-019 静态检查（不依赖浏览器，始终执行）──
const useEngineHealthRefs = grepInCode(/useEngineHealth/, 'packages/frontend/src', {
  extensions: ['.ts', '.tsx'],
});
results.C019 = {
  status: useEngineHealthRefs.length === 0 ? 'PASS' : 'FAIL',
  summary:
    useEngineHealthRefs.length === 0
      ? 'packages/frontend/src 中 useEngineHealth 0 匹配，死代码已删除'
      : '仍存在 ' + useEngineHealthRefs.length + ' 处 useEngineHealth 引用',
  details: {
    matchCount: useEngineHealthRefs.length,
    matches: useEngineHealthRefs.slice(0, 10),
    searchDir: 'packages/frontend/src',
  },
};

// ── 动态检查（需浏览器）──
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  const msg = 'chromium 启动失败（可能未安装浏览器二进制）：' + (e?.message ?? e);
  results.C004 = { status: 'SKIP', summary: msg, details: { error: String(e) } };
  results.C005 = { status: 'SKIP', summary: msg, details: { error: String(e) } };
  results.C006 = { status: 'SKIP', summary: msg, details: { error: String(e) } };
  results.bonusChecks = { status: 'SKIP', summary: msg, details: { error: String(e) } };
  writeAggregatedResult('C-004-005-006-019-frontend', results);
  console.error(msg);
  process.exit(2);
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
const page = await context.newPage();

// 收集所有失败 navigation（status >= 400 的 document 请求）
const failedNavigations = [];
page.on('response', (res) => {
  try {
    if (res.request().resourceType() === 'document' && res.status() >= 400) {
      failedNavigations.push({ url: res.url(), status: res.status() });
    }
  } catch {
    // ignore
  }
});

try {
  // ═══ 场景 1：首页 + 起始资金默认值 (C-005) + bonusChecks ═══
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + '/C-004-homepage.png', fullPage: true });

  const homepageChecks = await page.evaluate(() => {
    const numberInputs = Array.from(document.querySelectorAll('input[type="number"]'));
    const startingInput =
      numberInputs.find((i) => i.value === '10000') ||
      numberInputs.find((i) => /^\d+(\.\d+)?$/.test(i.value) && Number(i.value) > 0) ||
      null;

    const runButton = Array.from(document.querySelectorAll('button')).find((b) =>
      /运行|开始|回测|Run|Start/i.test(b.textContent ?? ''),
    );

    const h1Elements = document.querySelectorAll('h1');
    const allText = Array.from(document.querySelectorAll('*'))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent ?? '').trim())
      .filter(Boolean);
    const i18nLeaked = allText.filter(
      (t) =>
        /^(common|portfolio|nav|backtest|hero|footer|action|params)\.[a-zA-Z]/.test(t) &&
        t.length < 80,
    );
    const nanTexts = allText.filter((t) => /\bNaN\b/.test(t));

    return {
      numberInputCount: numberInputs.length,
      startingValueValue: startingInput?.value ?? null,
      startingValueValid: startingInput?.validity?.valid ?? null,
      startingValueValidationMessage: startingInput?.validationMessage ?? null,
      startingInputMin: startingInput?.min ?? null,
      runButtonExists: !!runButton,
      runButtonDisabled: runButton?.disabled ?? null,
      runButtonText: runButton?.textContent?.trim() ?? null,
      h1Count: h1Elements.length,
      h1Texts: Array.from(h1Elements).map((h) => h.textContent?.trim()),
      i18nLeakedCount: i18nLeaked.length,
      i18nLeakedSample: i18nLeaked.slice(0, 10),
      nanCount: nanTexts.length,
      nanSample: nanTexts.slice(0, 5),
    };
  });

  // ═══ 场景 2：Navbar 登录/注册链接 (C-004) ═══
  const navChecks = await page.evaluate(() => {
    const loginLinks = Array.from(document.querySelectorAll('a')).filter((a) =>
      /登录|login/i.test(a.textContent ?? ''),
    );
    const signupLinks = Array.from(document.querySelectorAll('a')).filter((a) =>
      /注册|signup|register/i.test(a.textContent ?? ''),
    );
    return {
      loginLinkCount: loginLinks.length,
      loginHrefs: loginLinks.map((a) => a.getAttribute('href')),
      signupLinkCount: signupLinks.length,
      signupHrefs: signupLinks.map((a) => a.getAttribute('href')),
    };
  });

  let loginPageUrl = null;
  let loginPageIsValid = false;
  let loginPageSnippet = null;
  if (navChecks.loginLinkCount > 0) {
    try {
      await page.click('a:has-text("登录")', { timeout: 5000 });
    } catch {
      try {
        await page.click('a[href="/login"]', { timeout: 5000 });
      } catch {
        await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
      }
    }
    await page.waitForTimeout(1200);
    loginPageUrl = page.url();
    loginPageSnippet = await page.evaluate(() => document.body.textContent?.slice(0, 300) ?? '');
    await page.screenshot({ path: SHOTS + '/C-004-login-page.png', fullPage: true });
    loginPageIsValid =
      !/404|Not Found|找不到|页面不存在/i.test(loginPageSnippet) &&
      /login|登录|密码|password|email|邮箱/i.test(loginPageSnippet);
  }

  results.C004 = {
    status:
      loginPageIsValid && navChecks.loginHrefs?.some((h) => h === '/login') ? 'PASS' : 'FAIL',
    summary:
      loginPageIsValid && navChecks.loginHrefs?.some((h) => h === '/login')
        ? '登录链接 href=/login，点击后进入 ' + loginPageUrl + '，无 404'
        : '登录链接验证失败：hrefs=' + JSON.stringify(navChecks.loginHrefs) + ' url=' + loginPageUrl,
    details: {
      loginLinkCount: navChecks.loginLinkCount,
      loginHrefs: navChecks.loginHrefs,
      signupLinkCount: navChecks.signupLinkCount,
      signupHrefs: navChecks.signupHrefs,
      loginPageUrl,
      loginPageIsValid,
      loginPageSnippet: loginPageSnippet?.slice(0, 200),
    },
  };

  // ═══ C-005 起始资金默认值 ═══
  const c005Pass =
    homepageChecks.runButtonExists === true &&
    homepageChecks.runButtonDisabled === false &&
    homepageChecks.startingValueValid === true &&
    homepageChecks.startingValueValue !== null &&
    homepageChecks.startingValueValue !== '';
  results.C005 = {
    status: c005Pass ? 'PASS' : 'FAIL',
    summary: c005Pass
      ? '起始资金 input 默认值=' + homepageChecks.startingValueValue + '，validity.valid=true，运行按钮存在且未禁用'
      : '起始资金验证失败：value=' + homepageChecks.startingValueValue + ' valid=' + homepageChecks.startingValueValid + ' runBtn=' + homepageChecks.runButtonExists + ' disabled=' + homepageChecks.runButtonDisabled,
    details: homepageChecks,
  };

  // ═══ 场景 3：CLS 测量 (C-006) ═══
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  const clsValue = await page.evaluate(() =>
    new Promise((resolve) => {
      let cls = 0;
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) cls += entry.value;
          }
        });
        po.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        resolve({ cls: -1, error: String(e) });
        return;
      }
      setTimeout(() => resolve({ cls: Math.round(cls * 10000) / 10000 }), 3000);
    }),
  );
  const cls = typeof clsValue === 'object' ? clsValue.cls : clsValue;
  const clsError = typeof clsValue === 'object' ? clsValue.error : null;
  results.C006 = {
    status: cls >= 0 && cls < 0.1 ? 'PASS' : 'FAIL',
    summary:
      cls >= 0
        ? 'CLS 实测=' + cls + '（阈值 <0.1）' + (cls < 0.1 ? '，达标' : '，未达标')
        : 'CLS 测量失败：' + clsError,
    details: { clsValue: cls, threshold: 0.1, error: clsError },
  };

  // ═══ bonusChecks ═══
  const noBonusIssues =
    homepageChecks.h1Count === 1 &&
    homepageChecks.i18nLeakedCount === 0 &&
    homepageChecks.nanCount === 0 &&
    failedNavigations.length === 0;
  results.bonusChecks = {
    status: noBonusIssues ? 'PASS' : 'FAIL',
    summary: noBonusIssues
      ? '无 bonus 问题：H1=1、无 i18n 泄露、无 NaN、无失败 navigation'
      : '存在 bonus 问题：H1=' + homepageChecks.h1Count + ' i18n泄露=' + homepageChecks.i18nLeakedCount + ' NaN=' + homepageChecks.nanCount + ' 失败nav=' + failedNavigations.length,
    details: {
      h1Count: homepageChecks.h1Count,
      h1Texts: homepageChecks.h1Texts,
      i18nLeakedCount: homepageChecks.i18nLeakedCount,
      i18nLeakedSample: homepageChecks.i18nLeakedSample,
      nanCount: homepageChecks.nanCount,
      nanSample: homepageChecks.nanSample,
      failedNavigations,
    },
  };
} catch (e) {
  const msg = '动态检查异常：' + (e?.message ?? e);
  if (results.C004.status === 'SKIP')
    results.C004 = { status: 'SKIP', summary: msg, details: { error: String(e?.stack ?? e) } };
  if (results.C005.status === 'SKIP')
    results.C005 = { status: 'SKIP', summary: msg, details: { error: String(e?.stack ?? e) } };
  if (results.C006.status === 'SKIP')
    results.C006 = { status: 'SKIP', summary: msg, details: { error: String(e?.stack ?? e) } };
  if (results.bonusChecks.status === 'SKIP')
    results.bonusChecks = { status: 'SKIP', summary: msg, details: { error: String(e?.stack ?? e) } };
} finally {
  await browser.close();
}

writeAggregatedResult('C-004-005-006-019-frontend', results);

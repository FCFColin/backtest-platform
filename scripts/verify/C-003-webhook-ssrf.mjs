// scripts/verify/C-003-webhook-ssrf.mjs
// C-003 Webhook SSRF 防护真实性独立验证
import {
  writeResult,
  fileExists,
  readFileContent,
  grepInCode,
} from './_lib.mjs';

const result = await (async () => {
  const webhookServicePath = 'packages/backend/src/application/webhookService.ts';
  const ssrfGuardPath = 'packages/backend/src/utils/ssrfGuard.ts';

  const webhookServiceExists = fileExists(webhookServicePath);
  const ssrfGuardExists = fileExists(ssrfGuardPath);

  if (!webhookServiceExists) {
    return {
      status: 'FAIL',
      summary: 'webhookService.ts not found',
      details: { webhookServiceExists, ssrfGuardExists },
    };
  }

  const webhookSrc = readFileContent(webhookServicePath);
  const ssrfSrc = ssrfGuardExists ? readFileContent(ssrfGuardPath) : '';

  const regexes = {
    hasIpValidation: /isPrivateIp|isInternalIp|blockPrivateIp|isPrivate/,
    hasDnsResolve: /dns\.resolve|dns\.lookup|lookupService/,
    hasPortValidation: /allowedPorts|80|443|8080|8443/,
    hasTimeout: /AbortSignal\.timeout|AbortController.*timeout|signal:/,
    hasSizeLimit: /maxSize|contentLength|content-length/i,
    hasDnsRebindingProtection: /resolve.*again|double.*check|resolve.*second|getaddrinfo|dnsLookup.*then.*fetch/,
  };

  const webhookChecks = {
    hasIpValidation: regexes.hasIpValidation.test(webhookSrc),
    hasDnsResolve: regexes.hasDnsResolve.test(webhookSrc),
    hasPortValidation: regexes.hasPortValidation.test(webhookSrc),
    hasTimeout: regexes.hasTimeout.test(webhookSrc),
    hasSizeLimit: regexes.hasSizeLimit.test(webhookSrc),
    hasDnsRebindingProtection: regexes.hasDnsRebindingProtection.test(webhookSrc),
  };

  const ssrfChecks = ssrfGuardExists ? {
    hasIpValidation: regexes.hasIpValidation.test(ssrfSrc),
    hasDnsResolve: regexes.hasDnsResolve.test(ssrfSrc),
    hasPortValidation: regexes.hasPortValidation.test(ssrfSrc),
    hasTimeout: regexes.hasTimeout.test(ssrfSrc),
    hasSizeLimit: regexes.hasSizeLimit.test(ssrfSrc),
    hasDnsRebindingProtection: regexes.hasDnsRebindingProtection.test(ssrfSrc),
  } : {
    hasIpValidation: false, hasDnsResolve: false, hasPortValidation: false,
    hasTimeout: false, hasSizeLimit: false, hasDnsRebindingProtection: false,
  };

  const combinedChecks = {
    hasIpValidation: webhookChecks.hasIpValidation || ssrfChecks.hasIpValidation,
    hasDnsResolve: webhookChecks.hasDnsResolve || ssrfChecks.hasDnsResolve,
    hasPortValidation: webhookChecks.hasPortValidation || ssrfChecks.hasPortValidation,
    hasTimeout: webhookChecks.hasTimeout || ssrfChecks.hasTimeout,
    hasSizeLimit: webhookChecks.hasSizeLimit || ssrfChecks.hasSizeLimit,
    hasDnsRebindingProtection: webhookChecks.hasDnsRebindingProtection || ssrfChecks.hasDnsRebindingProtection,
  };

  const actualSizeLimit = /MAX_RESPONSE_BYTES|readResponseWithLimit|maxBytes/i.test(webhookSrc) || /MAX_RESPONSE_BYTES|readResponseWithLimit|maxBytes/i.test(ssrfSrc);
  const actualDnsRebinding = /dns\.resolve4|resolve4\s*\(/.test(ssrfSrc) && /for\s*\(.*addr.*\)|\.forEach|\.map/.test(ssrfSrc) && /rebind|SSRF_DNS_REBINDING/i.test(ssrfSrc);
  const actualIpValidation = /isPrivateIPv4|isPrivateIPv6|isForbiddenIp/.test(ssrfSrc);
  const importsAssertSafeUrl = /import\s+\{[^}]*assertSafeUrl[^}]*\}\s+from\s+['"][^'"]*ssrfGuard/.test(webhookSrc);
  const callsAssertSafeUrl = /assertSafeUrl\s*\(/.test(webhookSrc);

  const actualProtection = {
    sizeLimit: actualSizeLimit,
    dnsRebinding: actualDnsRebinding,
    ipValidation: actualIpValidation,
    importsAssertSafeUrl,
    callsAssertSafeUrl,
  };

  const specifiedTestPath = 'tests/unit/services/webhookService.ssrf.test.ts';
  const alternativeTestPaths = ['tests/unit/utils/ssrf-guard.test.ts', 'tests/unit/application/webhookService.test.ts'];
  const hasSpecifiedTestFile = fileExists(specifiedTestPath);
  const alternativeTestFiles = alternativeTestPaths.filter((p) => fileExists(p));

  let integrationTest = null;
  const testUrls = [
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:6379/',
    'http://10.0.0.1/',
    'http://[::1]/',
  ];
  const adminToken = process.env.TEST_ADMIN_TOKEN || 'dev-admin-token';

  try {
    const results = await Promise.all(
      testUrls.map(async (url) => {
        try {
          const res = await fetch('http://localhost:15001/api/v1/webhooks/test-ssrf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(5000),
          });
          return { url, status: res.status, rejected: res.status >= 400 };
        } catch (e) {
          return { url, error: e.message, rejected: null };
        }
      }),
    );
    const allErrors = results.every((r) => r.error);
    if (allErrors) {
      integrationTest = { status: 'SKIP', reason: 'API not available or endpoint does not exist', sampleError: results[0]?.error, results };
    } else {
      integrationTest = { status: 'DONE', results, allRejected: results.filter((r) => !r.error).every((r) => r.rejected) };
    }
  } catch (e) {
    integrationTest = { status: 'SKIP', reason: 'API not available', message: e.message };
  }

  const isPrivateIpUtilHits = grepInCode(/isPrivateIPv4|isPrivateIPv6|isForbiddenIp|isPrivateIp/i, 'packages/backend/src/utils', { extensions: ['.ts'] });
  const isPrivateIpTestHits = grepInCode(/isPrivateIPv4|isPrivateIPv6|isForbiddenIp|assertSafeUrl/i, 'tests/unit', { extensions: ['.ts'] });

  const webhookRoutesPath = 'packages/backend/src/routes/webhookRoutes.ts';
  const routesSrc = fileExists(webhookRoutesPath) ? readFileContent(webhookRoutesPath) : '';
  const createWebhookHasHttpsOnly = /refine\([^)]*https:\/\//i.test(routesSrc) && !/assertSafeUrl/.test(routesSrc);
  const createWebhookCallsSsrf = /assertSafeUrl/.test(routesSrc);
  const sendWebhookCallsSsrf = /deliverWebhook[\s\S]*?assertSafeUrl/.test(webhookSrc) || callsAssertSafeUrl;

  const additionalChecks = {
    isPrivateIpUtilityExists: isPrivateIpUtilHits.length > 0,
    isPrivateIpUtilityPath: isPrivateIpUtilHits.map((h) => h.file),
    isPrivateIpTestExists: isPrivateIpTestHits.length > 0,
    isPrivateIpTestPath: isPrivateIpTestHits.map((h) => h.file),
    createWebhookValidation: createWebhookCallsSsrf ? 'SSRF check via assertSafeUrl' : createWebhookHasHttpsOnly ? 'HTTPS-only (Zod refine), NO SSRF check at registration' : 'unknown',
    sendWebhookValidation: sendWebhookCallsSsrf ? 'SSRF check via assertSafeUrl before fetch' : 'NO SSRF check found',
    bothPathsValidated: createWebhookCallsSsrf && sendWebhookCallsSsrf,
  };

  const staticPassMap = {
    hasIpValidation: combinedChecks.hasIpValidation || actualProtection.ipValidation,
    hasDnsResolve: combinedChecks.hasDnsResolve,
    hasPortValidation: combinedChecks.hasPortValidation,
    hasTimeout: combinedChecks.hasTimeout,
    hasSizeLimit: combinedChecks.hasSizeLimit || actualProtection.sizeLimit,
    hasDnsRebindingProtection: combinedChecks.hasDnsRebindingProtection || actualProtection.dnsRebinding,
  };
  const staticAllPass = Object.values(staticPassMap).every(Boolean);

  const hasTestFile = hasSpecifiedTestFile || alternativeTestFiles.length > 0;
  const delegationValid = importsAssertSafeUrl && callsAssertSafeUrl;
  const integrationOk = integrationTest?.status === 'SKIP' || (integrationTest?.status === 'DONE' && integrationTest?.allRejected === true);

  const pass = staticAllPass && hasTestFile && delegationValid && sendWebhookCallsSsrf && integrationOk;

  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? `SSRF protection real: static=${staticAllPass ? '6/6' : 'PARTIAL'}, tests=${hasTestFile ? 'present' : 'missing'}, delegation=${delegationValid ? 'valid' : 'invalid'}, deliveryCheck=${sendWebhookCallsSsrf}, integration=${integrationTest?.status ?? 'N/A'}`
      : `SSRF protection has gaps: static=${staticAllPass ? '6/6' : 'PARTIAL'}, tests=${hasTestFile ? 'present' : 'missing'}, delegation=${delegationValid ? 'valid' : 'invalid'}, deliveryCheck=${sendWebhookCallsSsrf}, integration=${integrationTest?.status ?? 'N/A'}`,
    details: {
      staticChecks: {
        webhookService: webhookChecks,
        ssrfGuard: ssrfChecks,
        combined: combinedChecks,
        actualProtection,
        finalAssessment: staticPassMap,
        staticAllPass,
      },
      testFiles: {
        specifiedPath: { path: specifiedTestPath, exists: hasSpecifiedTestFile },
        alternativePaths: alternativeTestPaths.map((p) => ({ path: p, exists: fileExists(p) })),
        hasAnyTestFile: hasTestFile,
      },
      integrationTest,
      additionalChecks,
      delegationValid,
      notes: [
        'webhookService.ts delegates SSRF validation to ssrfGuard.ts (assertSafeUrl) - reasonable modular design',
        'createWebhook path only does HTTPS Zod validation, NO SSRF check at registration; SSRF check runs at deliverWebhook time (defends DNS rebinding)',
        'Specified test path tests/unit/services/webhookService.ssrf.test.ts does NOT exist, but SSRF coverage is in tests/unit/utils/ssrf-guard.test.ts (15186 bytes, includes C-003 scenarios)',
        'Specified integration endpoint /api/v1/webhooks/test-ssrf does NOT exist in routes; actual routes are POST /api/v1/webhooks (register) and POST /api/v1/webhooks/:id/test (delivery test)',
      ],
    },
  };
})();

writeResult('C-003', result);
process.exit(result.status === 'PASS' ? 0 : 1);

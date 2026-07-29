// scripts/verify/C-007-k8s-overlays.mjs
// Verify K8s kustomize overlays build successfully (C-007/D12-001)
// Three overlays (dev/staging/production) must kustomize build OK
// Overlays must reference ../../base (no trailing slash)
import {
  writeResult,
  runCmd,
  fileExists,
  readFileContent,
} from './_lib.mjs';

const ISSUE_ID = 'C-007';
const OVERLAYS = ['dev', 'staging', 'production'];
// base/kustomization.yaml comment states overlays need --load-restrictor LoadRestrictionsNone
const LOAD_RESTRICTOR_FLAG = '--load-restrictor LoadRestrictionsNone';

const details = {
  overlays: {},
  pathCheck: {},
  kubectlVersion: null,
  kubectlInstalled: false,
};

// 1. Check kubectl installed
const kubectlVersionResult = runCmd('kubectl version --client', { timeout: 15000 });
if (kubectlVersionResult.code !== 0) {
  writeResult(ISSUE_ID, {
    status: 'SKIP',
    summary: 'kubectl not installed, cannot run kustomize build',
    details: { error: kubectlVersionResult.err || kubectlVersionResult.out, kubectlInstalled: false },
  });
  process.exit(0);
}
details.kubectlInstalled = true;
details.kubectlVersion = kubectlVersionResult.out.trim().split('\n')[0];

// 2. Verify overlay kustomization.yaml exist
let allDirsExist = true;
for (const env of OVERLAYS) {
  const exists = fileExists(`k8s/overlays/${env}/kustomization.yaml`);
  details.overlays[env] = details.overlays[env] || {};
  details.overlays[env].kustomizationExists = exists;
  if (!exists) allDirsExist = false;
}
if (!allDirsExist) {
  writeResult(ISSUE_ID, {
    status: 'FAIL',
    summary: 'Some overlay kustomization.yaml missing',
    details,
  });
  process.exit(0);
}

// 3. Verify overlays reference ../../base (not ../../base/)
//    Line format: "  - ../../base # comment" (indented, with optional comment)
let pathCheckAllPass = true;
for (const env of OVERLAYS) {
  const content = readFileContent(`k8s/overlays/${env}/kustomization.yaml`);
  // Match: optional indent, dash, ../../base optionally followed by / or space or # or EOL
  const baseRefMatch = content.match(/^\s*-\s+(\.\.\/\.\.\/base)([\s\/#].*)?$/m);
  const baseRef = baseRefMatch ? baseRefMatch[1] : null;
  // Check if there is a trailing slash right after base (../../base/...)
  const hasTrailingSlash = baseRefMatch
    ? /\.\.\/\.\.\/base\//.test(baseRefMatch[0])
    : false;
  const referencesBase = baseRef !== null;
  const pass = referencesBase && !hasTrailingSlash;
  details.pathCheck[env] = {
    referencesBase,
    baseRef,
    hasTrailingSlash,
    matchedLine: baseRefMatch ? baseRefMatch[0].trim() : null,
    pass,
  };
  if (!pass) pathCheckAllPass = false;
}

// 4. Run kubectl kustomize (with flag, as base/kustomization.yaml documents)
let buildAllPass = true;
for (const env of OVERLAYS) {
  const dir = `k8s/overlays/${env}/`;
  const plainResult = runCmd(`kubectl kustomize ${dir}`, { timeout: 60000 });
  const flaggedResult = runCmd(`kubectl kustomize ${LOAD_RESTRICTOR_FLAG} ${dir}`, { timeout: 60000 });
  const flaggedLineCount = flaggedResult.code === 0 ? flaggedResult.out.split('\n').length : 0;
  details.overlays[env] = {
    ...details.overlays[env],
    plainBuild: {
      code: plainResult.code,
      outLines: plainResult.code === 0 ? plainResult.out.split('\n').length : 0,
      errSnippet: plainResult.err.slice(0, 300),
    },
    flaggedBuild: {
      code: flaggedResult.code,
      outLines: flaggedLineCount,
      errSnippet: flaggedResult.err.slice(0, 300),
    },
    pass: flaggedResult.code === 0 && flaggedLineCount > 0,
  };
  if (!details.overlays[env].pass) buildAllPass = false;
}

// 5. Final verdict
const allPass = pathCheckAllPass && buildAllPass;
const failedEnvs = OVERLAYS.filter(env => !details.overlays[env].pass);
const failedPaths = OVERLAYS.filter(env => !details.pathCheck[env].pass);

let summary;
if (allPass) {
  summary = `All 3 overlays (dev/staging/production) kustomize build OK (with --load-restrictor flag), all reference ../../base (no trailing slash)`;
} else {
  const reasons = [];
  if (failedPaths.length) reasons.push(`path check failed: ${failedPaths.join(', ')}`);
  if (failedEnvs.length) reasons.push(`build failed: ${failedEnvs.join(', ')}`);
  summary = reasons.join('; ');
}

writeResult(ISSUE_ID, { status: allPass ? 'PASS' : 'FAIL', summary, details });

// scripts/verify/C-009-network-policy.mjs
// Verify NetworkPolicy with prometheus podSelector uses ports 5001/5003/5004 not 9090
// Search k8s/network-policies/*.yaml for prometheus-related NetworkPolicy
import { writeResult, readFileContent } from './_lib.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ISSUE_ID = 'C-009';
const ALLOWED_PORTS = [5001, 5003, 5004];
const FORBIDDEN_PORT = 9090;

// 1. List network-policies yaml files
const NP_DIR = 'k8s/network-policies';
let npFiles = [];
try {
  const absDir = join(process.cwd(), NP_DIR);
  npFiles = readdirSync(absDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => `${NP_DIR}/${f}`);
} catch (e) {
  writeResult(ISSUE_ID, {
    status: 'FAIL',
    summary: `Cannot read ${NP_DIR}: ${e.message}`,
    details: { error: e.message },
  });
  process.exit(0);
}

// 2. Parse each file, find NetworkPolicy docs containing prometheus
const details = {
  networkPolicyFiles: npFiles,
  prometheusPolicies: [],
  forbiddenPortFound: false,
  allowedPortsUsed: [],
  forbiddenPortsUsed: [],
};

for (const file of npFiles) {
  let content;
  try {
    content = readFileContent(file);
  } catch {
    continue;
  }
  // Split by --- for multi-doc YAML
  const docs = content.split(/^---\s*$/m);
  for (let docIdx = 0; docIdx < docs.length; docIdx++) {
    const doc = docs[docIdx];
    if (!doc.trim()) continue;
    const isNetworkPolicy = /^kind:\s*NetworkPolicy\s*$/m.test(doc);
    if (!isNetworkPolicy) continue;
    const hasPrometheus = /prometheus/i.test(doc);
    if (!hasPrometheus) continue;

    // Extract all port: fields
    const ports = [];
    const lines = doc.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const portMatch = lines[i].match(/^\s*port:\s*(\d+)\s*$/);
      if (portMatch) {
        ports.push(parseInt(portMatch[1], 10));
      }
    }

    const nameMatch = doc.match(/^metadata:\s*\n\s*name:\s*(\S+)\s*$/m);
    const policyName = nameMatch ? nameMatch[1] : '<unknown>';

    const hasForbidden = ports.includes(FORBIDDEN_PORT);
    const allAllowed = ports.length > 0 && ports.every(p => ALLOWED_PORTS.includes(p));
    details.prometheusPolicies.push({
      file,
      docIdx,
      policyName,
      ports,
      hasForbiddenPort: hasForbidden,
      allPortsAllowed: allAllowed,
    });
    if (hasForbidden) details.forbiddenPortFound = true;
    for (const p of ports) {
      if (ALLOWED_PORTS.includes(p) && !details.allowedPortsUsed.includes(p)) {
        details.allowedPortsUsed.push(p);
      }
      if (p === FORBIDDEN_PORT && !details.forbiddenPortsUsed.includes(p)) {
        details.forbiddenPortsUsed.push(p);
      }
    }
  }
}

// 3. Verdict
const hasPrometheusPolicy = details.prometheusPolicies.length > 0;
const noForbiddenPort = !details.forbiddenPortFound;
const allPoliciesUseAllowedPorts = details.prometheusPolicies.every(p => p.allPortsAllowed);

let status;
let summary;
if (!hasPrometheusPolicy) {
  status = 'FAIL';
  summary = 'No NetworkPolicy with prometheus found';
} else if (!noForbiddenPort) {
  status = 'FAIL';
  summary = `Forbidden port ${FORBIDDEN_PORT} found (expected ${ALLOWED_PORTS.join('/')})`;
} else if (!allPoliciesUseAllowedPorts) {
  status = 'FAIL';
  summary = `Some prometheus NetworkPolicy ports not in allowed list ${ALLOWED_PORTS.join('/')}`;
} else {
  status = 'PASS';
  summary = `${details.prometheusPolicies.length} prometheus NetworkPolicy port(s) all ${details.allowedPortsUsed.join('/')} (no ${FORBIDDEN_PORT})`;
}

writeResult(ISSUE_ID, { status, summary, details });

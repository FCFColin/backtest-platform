// scripts/verify/C-011-hpa.mjs
// HPA stabilizationScaleDownSeconds should be absent; stabilizationWindowSeconds should be present
import { writeResult, grepInCode } from './_lib.mjs';

const ISSUE_ID = 'C-011';
const WRONG_FIELD = 'stabilizationScaleDownSeconds';
const RIGHT_FIELD = 'stabilizationWindowSeconds';

const wrongFieldMatches = grepInCode(new RegExp(`\\b${WRONG_FIELD}\\b`), 'k8s', {
  extensions: ['.yaml', '.yml'],
});
const rightFieldMatches = grepInCode(new RegExp(`\\b${RIGHT_FIELD}\\b`), 'k8s', {
  extensions: ['.yaml', '.yml'],
});

const details = {
  wrongField: {
    name: WRONG_FIELD,
    expectedCount: 0,
    actualCount: wrongFieldMatches.length,
    occurrences: wrongFieldMatches.map(m => ({ file: m.file, line: m.line, text: m.text })),
  },
  rightField: {
    name: RIGHT_FIELD,
    expectedMin: 1,
    actualCount: rightFieldMatches.length,
    occurrences: rightFieldMatches.map(m => ({ file: m.file, line: m.line, text: m.text })),
  },
};

const noWrongField = wrongFieldMatches.length === 0;
const hasRightField = rightFieldMatches.length > 0;

let status;
let summary;
if (noWrongField && hasRightField) {
  status = 'PASS';
  summary = `HPA fields OK: no ${WRONG_FIELD} (${rightFieldMatches.length} uses of ${RIGHT_FIELD})`;
} else if (!noWrongField && hasRightField) {
  status = 'FAIL';
  summary = `${wrongFieldMatches.length} wrong field ${WRONG_FIELD} still present (though ${RIGHT_FIELD} also exists)`;
} else if (noWrongField && !hasRightField) {
  status = 'FAIL';
  summary = `Correct field ${RIGHT_FIELD} not found (no wrong field either, HPA config may be missing)`;
} else {
  status = 'FAIL';
  summary = `Wrong field ${WRONG_FIELD} present ${wrongFieldMatches.length} times, correct field ${RIGHT_FIELD} missing`;
}

writeResult(ISSUE_ID, { status, summary, details });

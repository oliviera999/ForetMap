import { validateGlMascotPack } from './glMascotPack.js';
import {
  extractZodValidationIssues,
  toValidationIssueLines,
} from '../../shared/mascot-pack/validationUi.js';

export function validateGlMascotPackForUi(payload) {
  const parsed = validateGlMascotPack(payload);
  if (parsed.success) {
    return { ok: true, pack: parsed.data, issues: [], issueLines: [] };
  }
  const issues = extractZodValidationIssues(parsed.error);
  return {
    ok: false,
    pack: null,
    issues,
    issueLines: toValidationIssueLines(issues),
  };
}

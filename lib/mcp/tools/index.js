'use strict';

/** Catalogue des outils du serveur MCP distant (ordre = ordre de `tools/list`). */

const { buildDiagnosticsTools } = require('./diagnostics');
const { buildContentTools } = require('./content');
const { buildAuditTools } = require('../audits');
const { buildUsageTools } = require('./usage');
const { buildSqlSelectTools } = require('./sqlSelect');
const { buildSqlExecuteTools } = require('./sqlExecute');
const { buildWriteTools } = require('./write');
const { buildPrivacyTools } = require('./privacy');
const { buildOpsTools } = require('./ops');

function buildServerTools() {
  const { createInternalDiagnosticsSource } = require('./diagnosticsInternal');
  return [
    ...buildDiagnosticsTools(createInternalDiagnosticsSource()),
    ...buildContentTools(),
    ...buildAuditTools(),
    ...buildUsageTools(),
    ...buildSqlSelectTools(),
    ...buildSqlExecuteTools(),
    ...buildWriteTools(),
    ...buildPrivacyTools(),
    ...buildOpsTools(),
  ];
}

module.exports = { buildServerTools };

'use strict';

const cluster = require('cluster');

/**
 * Instantané sûr du processus Node pour GET /api/admin/diagnostics.
 * Aide à interpréter Socket.IO (état en mémoire par processus) vs configuration
 * Passenger / PM2 (plusieurs processus = adaptateur Redis nécessaire pour diffuser entre eux).
 *
 * @returns {{
 *   pid: number,
 *   cluster: { isWorker: boolean, workerId: number | null },
 *   envHints: { nodeAppInstance: string | null, passengerAppEnv: string | null }
 * }}
 */
function getRuntimeProcessSnapshot() {
  const w = cluster.worker;
  const nodeApp = process.env.NODE_APP_INSTANCE;
  const passEnv = process.env.PASSENGER_APP_ENV;
  return {
    pid: process.pid,
    cluster: {
      isWorker: cluster.isWorker === true,
      workerId: w != null && typeof w.id === 'number' ? w.id : null,
    },
    envHints: {
      nodeAppInstance:
        nodeApp != null && String(nodeApp).trim() ? String(nodeApp).trim() : null,
      passengerAppEnv: passEnv != null && String(passEnv).trim() ? String(passEnv).trim() : null,
    },
  };
}

module.exports = { getRuntimeProcessSnapshot };

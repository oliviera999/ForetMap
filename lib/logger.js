const pino = require('pino');
const { teeStream } = require('./logBuffer');

const logger = pino(
  {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },
  teeStream
);

module.exports = logger;

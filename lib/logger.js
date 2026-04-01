const pino = require('pino');
const { teeStream } = require('./logBuffer');

const logger = pino(
  {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.password_hash',
        'password',
        '*.secret',
        '*.token',
        '*.refreshToken',
        '*.accessToken',
      ],
      remove: true,
    },
  },
  teeStream
);

module.exports = logger;

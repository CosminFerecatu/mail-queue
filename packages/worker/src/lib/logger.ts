import pino from 'pino';
import { config, isDevelopment } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  ...(isDevelopment() && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    service: 'mail-queue-worker',
    version: process.env['npm_package_version'] ?? '0.0.1',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

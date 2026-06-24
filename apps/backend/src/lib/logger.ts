import pino from 'pino';
import { config } from '../config/index.js';

/**
 * Error serializer that captures everything we need to diagnose a failure from
 * logs alone: the standard fields, our AppError metadata, the stderr/stdout of
 * failed child processes (ffmpeg, etc.), and any nested `cause`. Without this,
 * pino's default serializer drops `stderr`, leaving only a generic
 * "Command failed" message.
 */
function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { type: typeof err, value: String(err) };
  }
  const e = err as Error & Record<string, unknown>;
  const out: Record<string, unknown> = {
    type: e.name,
    message: e.message,
    stack: e.stack,
  };
  if (e['code'] !== undefined) out['code'] = e['code'];
  if (e['statusCode'] !== undefined) out['statusCode'] = e['statusCode'];
  if (e['isOperational'] !== undefined) out['isOperational'] = e['isOperational'];
  if (e['stderr']) out['stderr'] = String(e['stderr']).trim().split('\n').slice(-12).join('\n');
  if (e['stdout']) out['stdout'] = String(e['stdout']).trim().split('\n').slice(-12).join('\n');
  if (e['cause']) out['cause'] = serializeError(e['cause']);
  return out;
}

export const logger = pino({
  level: config.LOG_LEVEL,
  serializers: { err: serializeError },
  ...(config.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

import type { JobErrorCode } from '@shortstory/shared';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: JobErrorCode | 'NOT_FOUND' | 'BAD_REQUEST',
    message: string,
    /** true = safe to return to client; false = collapse to 500 */
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'BAD_REQUEST', message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static invalidUrl(message = 'The provided URL is not a valid YouTube Short.'): AppError {
    return new AppError(422, 'INVALID_URL', message);
  }

  static videoTooLong(): AppError {
    return new AppError(422, 'VIDEO_TOO_LONG', 'Video exceeds the 90-second limit.');
  }

  static internal(message = 'An unexpected error occurred.'): AppError {
    return new AppError(500, 'INTERNAL', message, false);
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiError } from '@proofvault/shared';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
};

/** Every error leaves the api as { error: { code, message } }. Throw AppError for a custom code. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('ApiError');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

    if (err instanceof AppError) {
      status = err.getStatus();
      body = { error: { code: err.code, message: err.message } };
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      body = { error: { code: CODES[status] ?? `HTTP_${status}`, message: err.message } };
    } else {
      this.log.error(err);
    }
    res.status(status).json(body);
  }
}

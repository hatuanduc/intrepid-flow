import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe trả về object { message: string[], error, statusCode }
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as Record<string, unknown>).message;
        return res.status(status).json({
          statusCode: status,
          code: Array.isArray(msg) ? 'VALIDATION_ERROR' : String(msg),
          message: Array.isArray(msg) ? msg[0] : String(msg),
        });
      }

      return res.status(status).json({
        statusCode: status,
        code: String(body),
        message: String(body),
      });
    }

    // Unhandled error
    console.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

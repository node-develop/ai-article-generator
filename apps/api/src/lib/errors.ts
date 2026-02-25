export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const createNotFoundError = (resource: string) =>
  new AppError(404, `${resource} not found`, 'NOT_FOUND');

export const createUnauthorizedError = (message = 'Unauthorized') =>
  new AppError(401, message, 'UNAUTHORIZED');

export const createForbiddenError = (message = 'Forbidden') =>
  new AppError(403, message, 'FORBIDDEN');

export const createBadRequestError = (message: string) =>
  new AppError(400, message, 'BAD_REQUEST');

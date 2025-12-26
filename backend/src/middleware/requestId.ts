import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to generate and attach a unique request ID to each request
 * This helps with request correlation between frontend and backend logs
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Use client-provided request ID if available, otherwise generate one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Attach to request object for use in controllers
  (req as any).requestId = requestId;
  
  // Return in response headers for client verification
  res.setHeader('X-Request-Id', requestId);
  
  next();
};

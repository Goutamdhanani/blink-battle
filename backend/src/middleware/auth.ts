import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[Auth] No token provided in request to', req.path);
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    (req as any).userId = decoded.userId;
    (req as any).walletAddress = decoded.walletAddress;
    
    console.log('[Auth] Request authenticated for user:', decoded.userId, 'to', req.path);

    next();
  } catch (error) {
    console.error('[Auth] Token verification failed for request to', req.path, ':', error instanceof Error ? error.message : error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

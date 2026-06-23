import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  req.id = (Array.isArray(existing) ? existing[0] : existing) ?? uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

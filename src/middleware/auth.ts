import jwt from 'jsonwebtoken';
import { RequestHandler } from 'express';
import { config } from '../config';
import { Role } from '../types';
import { HttpError } from './errors';

export interface TokenPayload {
  id: string;
  role: Role;
}

// Adds req.user to Express requests
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecrets[payload.role], {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

// Allows only the given roles. The token must be signed with that role's secret,
// so an employer token fails on candidate routes and the other way round.
export function requireAuth(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new HttpError(401, 'Missing token');

    for (const role of roles) {
      try {
        const payload = jwt.verify(token, config.jwtSecrets[role]) as TokenPayload;
        if (payload.role === role) {
          req.user = payload;
          return next();
        }
      } catch {
        // wrong secret or expired: try the next allowed role
      }
    }
    throw new HttpError(401, 'Invalid or expired token');
  };
}

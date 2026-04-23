import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string; role: string };
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Token expired or invalid" });
    return;
  }

  req.user = decoded;
  next();
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

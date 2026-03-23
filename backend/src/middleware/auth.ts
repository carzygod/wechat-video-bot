import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

const COOKIE_NAME = "91bot_auth";

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function signAdminToken(username: string): string {
  return jwt.sign({ sub: username, role: "admin" }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

function getRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken;
  }

  return null;
}

export function readAuthUserId(req: Request): string | null {
  const token = getRequestToken(req);
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = readAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.auth = { userId };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = getRequestToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; role?: string };
    if (payload.role !== "admin" || !payload.sub) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.admin = { username: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

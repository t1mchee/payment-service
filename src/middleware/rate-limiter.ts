/**
 * Rate limiting middleware for the payment API.
 */

import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

interface RateLimitEntry {
  timestamps: number[];
  blocked: boolean;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

/**
 * Rate limiting middleware.
 */
export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const clientId = req.ip || "unknown";
  const now = Date.now();

  let entry = rateLimitStore.get(clientId);
  if (!entry) {
    entry = { timestamps: [], blocked: false };
    rateLimitStore.set(clientId, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
    return;
  }

  entry.timestamps.push(now);
  next();
}

/**
 * Validate API key from request header.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers["x-api-key"] as string;
  const validKey = process.env.API_SECRET_KEY || "sk_test_default";

  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  // Use constant-time comparison to prevent timing attacks
  const apiKeyBuffer = Buffer.from(apiKey);
  const validKeyBuffer = Buffer.from(validKey);

  if (
    apiKeyBuffer.length !== validKeyBuffer.length ||
    !timingSafeEqual(apiKeyBuffer, validKeyBuffer)
  ) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

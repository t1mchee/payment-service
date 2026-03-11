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

  // Clean up expired entries to prevent memory growth
  cleanupExpiredEntries(now);

  next();
}

/**
 * Remove expired entries from the rate limit store.
 */
function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of rateLimitStore) {
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    } else {
      const newest = entry.timestamps[entry.timestamps.length - 1];
      if (now - newest >= WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }
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
  const apiKeyBuf = Buffer.from(apiKey);
  const validKeyBuf = Buffer.from(validKey);
  if (apiKeyBuf.length !== validKeyBuf.length || !timingSafeEqual(apiKeyBuf, validKeyBuf)) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

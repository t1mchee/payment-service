/**
 * Rate limiting middleware for the payment API.
 *
 * BUG: The sliding window implementation has an off-by-one error
 * that allows one extra request per window, and the cleanup logic
 * never removes expired entries, causing slow memory growth.
 *
 * BUG: Timing attack vulnerability — the comparison of API keys
 * uses standard string equality instead of constant-time comparison,
 * leaking key length information via response timing.
 */

import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  timestamps: number[];
  blocked: boolean;
}

// BUG: Entries are never cleaned up even after they expire
const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

/**
 * Rate limiting middleware.
 * BUG: Off-by-one — allows MAX_REQUESTS + 1 per window
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
  // BUG: Uses > instead of >=, allowing one extra request at boundary
  entry.timestamps = entry.timestamps.filter((ts) => now - ts > WINDOW_MS);

  // BUG: Should be >= MAX_REQUESTS, not > (off-by-one)
  if (entry.timestamps.length > MAX_REQUESTS) {
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
 *
 * BUG: Timing attack — uses !== for key comparison.
 * An attacker can measure response time to determine how many
 * characters of their guess match the real key.
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

  // BUG: Timing attack — standard string comparison leaks information
  // Should use crypto.timingSafeEqual() instead
  if (apiKey !== validKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

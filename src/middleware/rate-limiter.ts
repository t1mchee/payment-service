/**
 * Rate limiting middleware for the payment API.
 *
 * BUG: The sliding window implementation has an off-by-one error
 * that allows one extra request per window, and the cleanup logic
 * never removes expired entries, causing slow memory growth.
 */

import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

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
 * Uses crypto.timingSafeEqual() for constant-time comparison
 * to prevent timing attacks that could leak key information.
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

  // Use constant-time comparison to prevent timing attacks.
  // First check lengths to avoid timingSafeEqual throwing on mismatched lengths,
  // but pad both to the same length so the length check itself doesn't leak info.
  const apiKeyBuf = Buffer.from(apiKey);
  const validKeyBuf = Buffer.from(validKey);
  const isLengthMatch = apiKeyBuf.length === validKeyBuf.length;

  // If lengths differ, compare validKey against itself to keep constant time,
  // but still reject the key.
  const a = isLengthMatch ? apiKeyBuf : validKeyBuf;
  const b = validKeyBuf;

  if (!timingSafeEqual(a, b) || !isLengthMatch) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

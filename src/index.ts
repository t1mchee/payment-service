/**
 * Payment Service — Express application entry point.
 *
 * A sample microservice with a deliberate bug for DevinGuard demos.
 * The bug: customer cache TTL was reduced, causing null returns
 * during retry logic that doesn't null-check.
 */

import express from "express";
import { handleCreateCharge, errorHandler } from "./handlers/charge-handler";
import { handleCreateRefund } from "./handlers/refund-handler";
import { handleSendWebhook } from "./handlers/webhook-handler";
import { rateLimiter, validateApiKey } from "./middleware/rate-limiter";
import { logAuditEvent, getAuditLogSize } from "./services/audit-logger";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Rate limiting on all routes
app.use(rateLimiter);

// Audit log middleware — logs every request (must be before routes)
app.use((req, _res, next) => {
  logAuditEvent(
    `${req.method} ${req.path}`,
    req.headers["x-user-id"] as string || "anonymous",
    req.path,
    { query: req.query },
    req.ip || "0.0.0.0"
  );
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "payment-service",
    auditLogSize: getAuditLogSize(),
  });
});

// Payment endpoints (API key required)
app.post("/charges", validateApiKey, handleCreateCharge);
app.post("/refunds", validateApiKey, handleCreateRefund);

// Webhook delivery
app.post("/webhooks/deliver", handleSendWebhook);

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Payment service running on port ${PORT}`);
});

export default app;

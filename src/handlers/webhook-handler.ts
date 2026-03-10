/**
 * Express handler for the /webhooks endpoint.
 */

import { Request, Response, NextFunction } from "express";
import { queueWebhook, deliverWebhook } from "../services/webhook-service";

export async function handleSendWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { url, type, payload } = req.body;

    if (!url || !type) {
      res.status(400).json({ error: "Missing required fields: url, type" });
      return;
    }

    const event = queueWebhook(type, payload || {});

    // Fire-and-forget delivery — catch any rejection to prevent crashing the process
    deliverWebhook(url, event).catch((err) => {
      console.error(`Webhook ${event.id} initial delivery failed:`, err);
    });

    res.status(202).json({
      webhookId: event.id,
      status: "queued",
    });
  } catch (err) {
    next(err);
  }
}

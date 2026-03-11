/**
 * Webhook delivery service.
 *
 * BUG: Unhandled promise rejection in webhook retry loop.
 * When a webhook delivery fails and the retry also fails with a
 * network error, the error is not caught, causing an unhandled
 * promise rejection that crashes the process.
 */

import { AppError } from "../errors";

interface WebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  deliveredAt?: Date;
  attempts: number;
}

const webhookQueue: WebhookEvent[] = [];

/**
 * Deliver a webhook to a customer's endpoint.
 *
 * BUG: The retry logic uses fire-and-forget (no await, no .catch()),
 * so if the retry itself throws, it becomes an unhandled promise rejection.
 */
export async function deliverWebhook(
  url: string,
  event: WebhookEvent
): Promise<void> {
  event.attempts += 1;

  try {
    // Simulate HTTP POST to customer webhook URL
    const success = await simulateHTTPPost(url, event.payload);

    if (!success) {
      throw new AppError("Webhook delivery failed: non-2xx response", 502);
    }

    event.deliveredAt = new Date();
    removeFromQueue(event);
  } catch (err) {
    if (event.attempts < 3) {
      // BUG: fire-and-forget retry — no await, no .catch()
      // If simulateHTTPPost throws during retry, it's an unhandled rejection
      setTimeout(() => {
        deliverWebhook(url, event); // no .catch() here!
      }, 1000 * event.attempts);
    } else {
      // TODO: send to dead letter queue
      console.error(`Webhook ${event.id} failed after ${event.attempts} attempts`);
      removeFromQueue(event);
    }
  }
}

/**
 * Queue a webhook for delivery.
 */
export function queueWebhook(
  type: string,
  payload: Record<string, unknown>
): WebhookEvent {
  const event: WebhookEvent = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    attempts: 0,
  };
  webhookQueue.push(event);
  return event;
}

/** Remove a delivered or permanently-failed event from the queue. */
function removeFromQueue(event: WebhookEvent): void {
  const idx = webhookQueue.indexOf(event);
  if (idx !== -1) {
    webhookQueue.splice(idx, 1);
  }
}

/** Simulate an HTTP POST — fails ~40% of the time */
async function simulateHTTPPost(
  _url: string,
  _payload: Record<string, unknown>
): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (Math.random() < 0.4) {
    throw new Error("ECONNREFUSED: Connection refused");
  }
  return true;
}

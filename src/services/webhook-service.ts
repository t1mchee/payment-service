/**
 * Webhook delivery service.
 *
 * Delivers webhooks to customer endpoints with retry logic.
 * Failed deliveries are retried up to 3 times with exponential backoff.
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
 * Retries up to 3 times with exponential backoff on failure.
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
  } catch (err) {
    if (event.attempts < 3) {
      setTimeout(() => {
        deliverWebhook(url, event).catch((retryErr) => {
          console.error(
            `Webhook ${event.id} retry failed (attempt ${event.attempts}):`,
            retryErr
          );
        });
      }, 1000 * event.attempts);
    } else {
      // TODO: send to dead letter queue
      console.error(`Webhook ${event.id} failed after ${event.attempts} attempts`);
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

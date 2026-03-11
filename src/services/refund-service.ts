/**
 * Refund processing service.
 *
 * Uses a per-charge lock to prevent race conditions in concurrent
 * refund processing. The lock ensures that the "already refunded?"
 * check and the "mark as refunded" update are atomic across async
 * boundaries.
 */

import { v4 as uuidv4 } from "uuid";
import { PaymentError } from "../errors";

interface RefundRecord {
  refundId: string;
  chargeId: string;
  amountCents: number;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
}

// In-memory refund store (simulating a database)
const refundStore = new Map<string, RefundRecord>();
const chargeRefundStatus = new Map<string, boolean>();

// Per-charge lock to serialize concurrent refund requests
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-charge lock so that only one refund request
 * for a given chargeId is processed at a time.
 */
function withChargeLock<T>(
  chargeId: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = chargeLocks.get(chargeId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Store the lock chain (void) so the next caller waits for us
  chargeLocks.set(
    chargeId,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

/**
 * Process a refund for a charge.
 *
 * Serialized per chargeId via withChargeLock to prevent the TOCTOU
 * race condition where two concurrent requests could both pass the
 * "already refunded?" check before either marks the charge.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate (no lock needed for pure input validation)
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  return withChargeLock(chargeId, async () => {
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    chargeRefundStatus.set(chargeId, true);

    const refund: RefundRecord = {
      refundId: `re_${uuidv4().slice(0, 12)}`,
      chargeId,
      amountCents,
      status: "completed",
      createdAt: new Date(),
    };

    refundStore.set(refund.refundId, refund);
    return refund;
  });
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

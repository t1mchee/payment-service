/**
 * Refund processing service.
 *
 * Uses an atomic check-and-set pattern to prevent concurrent refund
 * requests from creating duplicate refunds for the same charge.
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

/**
 * Process a refund for a charge.
 *
 * The check for "already refunded" and the "mark as refunded" are
 * performed synchronously (no await in between) so they execute
 * atomically within Node.js's single-threaded event loop, preventing
 * TOCTOU race conditions.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: no await between the check and the set,
  // so no other async operation can interleave in the event loop.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
  chargeRefundStatus.set(chargeId, true);

  // Simulate processing delay — the charge is already marked as
  // refunded, so concurrent requests will be rejected above.
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const refund: RefundRecord = {
      refundId: `re_${uuidv4().slice(0, 12)}`,
      chargeId,
      amountCents,
      status: "completed",
      createdAt: new Date(),
    };

    refundStore.set(refund.refundId, refund);
    return refund;
  } catch (err) {
    // Roll back the refund flag so the charge can be retried
    chargeRefundStatus.set(chargeId, false);
    throw err;
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

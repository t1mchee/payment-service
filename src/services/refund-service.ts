/**
 * Refund processing service.
 *
 * Uses synchronous check-and-set to prevent concurrent refund requests
 * from both passing the "already refunded?" check before either marks
 * the charge as refunded.
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
 * performed atomically (synchronously) before any async operation,
 * preventing TOCTOU race conditions.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: mark as refunded immediately (synchronously)
  // before any async work, so concurrent requests will see the flag.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
  chargeRefundStatus.set(chargeId, true);

  // Simulate processing delay
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (err) {
    // Roll back the refund status on failure so the charge can be retried
    chargeRefundStatus.set(chargeId, false);
    throw err;
  }

  const refund: RefundRecord = {
    refundId: `re_${uuidv4().slice(0, 12)}`,
    chargeId,
    amountCents,
    status: "completed",
    createdAt: new Date(),
  };

  refundStore.set(refund.refundId, refund);
  return refund;
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

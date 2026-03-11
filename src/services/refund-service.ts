/**
 * Refund processing service.
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
 * The check and the mark are performed synchronously (before any await)
 * so they execute atomically within a single tick of the Node.js event
 * loop, preventing concurrent requests from both passing the guard.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: both operations are synchronous, so no other
  // async handler can interleave between the check and the mark.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Mark as refunded immediately, before any async work, to close the
  // race window that previously existed between the check and the set.
  chargeRefundStatus.set(chargeId, true);

  try {
    // Simulate processing delay
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
  } catch (error) {
    // Roll back the refund status so the charge can be retried
    chargeRefundStatus.set(chargeId, false);
    throw error;
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

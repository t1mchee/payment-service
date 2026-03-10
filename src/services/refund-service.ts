/**
 * Refund processing service.
 *
 * Uses an atomic check-and-set pattern to prevent concurrent refund
 * requests for the same charge from both succeeding (double refunds).
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
const chargeRefundStatus = new Map<string, "processing" | "refunded">();

/**
 * Process a refund for a charge.
 *
 * The check-and-set of the refund status is performed synchronously
 * (before any await) so the event loop cannot interleave another
 * request between the check and the lock acquisition.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: reject if already refunded or currently processing
  const currentStatus = chargeRefundStatus.get(chargeId);
  if (currentStatus === "refunded") {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
  if (currentStatus === "processing") {
    throw new PaymentError(`Charge ${chargeId} is already being refunded`);
  }

  // Mark as processing synchronously before any async work, so concurrent
  // requests will see this status and be rejected immediately.
  chargeRefundStatus.set(chargeId, "processing");

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mark as fully refunded
    chargeRefundStatus.set(chargeId, "refunded");

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
    // Roll back the lock so the charge can be retried
    chargeRefundStatus.delete(chargeId);
    throw err;
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

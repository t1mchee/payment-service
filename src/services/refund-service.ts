/**
 * Refund processing service.
 *
 * Processes refunds for charges with protection against concurrent
 * duplicate refund requests using atomic check-and-set.
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
 * Uses atomic (synchronous) check-and-set on chargeRefundStatus to
 * prevent concurrent requests from both passing the duplicate check.
 * The flag is set immediately before any async work, and rolled back
 * if processing fails.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: both the check and the flag update are
  // synchronous, so no other async request can interleave between them.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
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

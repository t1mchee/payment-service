/**
 * Refund processing service.
 *
 * BUG: Race condition in concurrent refund processing.
 * When two refund requests arrive for the same charge simultaneously,
 * both can pass the "already refunded?" check before either marks
 * the charge as refunded, resulting in double refunds.
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
 * performed atomically (in the same synchronous tick) to prevent
 * concurrent requests from both passing the check.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check-and-set: both the check and the flag update happen
  // synchronously (no await in between), so no other async request
  // can interleave and pass the same check.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
  chargeRefundStatus.set(chargeId, true);

  // Simulate processing delay — the flag is already set, so any
  // concurrent request arriving here will see it and be rejected.
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
    // Roll back the flag if processing fails so the refund can be retried
    chargeRefundStatus.set(chargeId, false);
    throw err;
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

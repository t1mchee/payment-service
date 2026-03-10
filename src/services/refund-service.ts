/**
 * Refund processing service.
 *
 * Processes refunds for charges with protection against concurrent
 * duplicate refund requests using an in-flight processing lock.
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

// Lock set to track charges currently being processed for refund.
// This prevents the TOCTOU race where two concurrent requests both
// pass the "already refunded?" check before either marks the charge.
const refundsInProgress = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * Uses an in-flight lock to make the "already refunded?" check and
 * the "mark as processing" step atomic (both synchronous), closing
 * the race window that previously existed across the async delay.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomic check: reject if already refunded or currently in progress
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  if (refundsInProgress.has(chargeId)) {
    throw new PaymentError(`Refund for charge ${chargeId} is already being processed`);
  }

  // Mark as in-progress synchronously (before any await) to lock out
  // concurrent requests. This is safe because Node.js executes
  // synchronous code in a single tick — no other request can interleave
  // between the check above and this set.
  refundsInProgress.add(chargeId);

  try {
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
  } finally {
    // Always release the in-progress lock, whether we succeeded or failed
    refundsInProgress.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

/**
 * Refund processing service.
 *
 * Uses a synchronous lock to prevent concurrent refund processing
 * for the same charge, avoiding TOCTOU race conditions.
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

// Lock map to prevent concurrent refund processing for the same charge.
// When a chargeId is in this set, a refund is already being processed for it.
const processingLocks = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * The check, lock acquisition, and status update are performed
 * synchronously (before any await) to prevent TOCTOU race conditions.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Synchronous check-and-lock: no await between check and lock acquisition,
  // so no other async task can interleave and pass the same check.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  if (processingLocks.has(chargeId)) {
    throw new PaymentError(`Charge ${chargeId} is already being refunded`);
  }

  // Acquire the lock synchronously before any async work
  processingLocks.add(chargeId);

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mark the charge as refunded
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
    // Always release the lock so a retry is possible if processing failed
    processingLocks.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

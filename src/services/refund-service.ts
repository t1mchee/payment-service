/**
 * Refund processing service.
 *
 * Uses a lock set to prevent concurrent refund processing for the
 * same charge, eliminating the TOCTOU race condition.
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

// Lock set to prevent concurrent refund processing for the same charge
const processingLocks = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * Uses a lock set to make the check-and-mark operation atomic,
 * preventing double refunds from concurrent requests.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Atomically check if already refunded
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Acquire a processing lock to prevent concurrent refunds for the same charge
  if (processingLocks.has(chargeId)) {
    throw new PaymentError(`Charge ${chargeId} is already being refunded`);
  }
  processingLocks.add(chargeId);

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Re-check after async work in case another request completed
    if (chargeRefundStatus.get(chargeId)) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Mark as refunded
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
    processingLocks.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

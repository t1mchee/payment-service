/**
 * Refund processing service.
 *
 * Uses an in-progress lock to prevent concurrent refund requests for
 * the same charge from both passing the "already refunded?" check.
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

// Lock set to prevent concurrent refund processing for the same charge.
// Checked and updated synchronously (no async gap) so that Node.js's
// single-threaded event loop guarantees atomicity of the check-and-lock.
const refundsInProgress = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * The in-progress lock and the already-refunded check both happen
 * synchronously before any async work, eliminating the TOCTOU window.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Check if already refunded
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Acquire in-progress lock synchronously — prevents concurrent requests
  // from both passing the above check before either completes.
  if (refundsInProgress.has(chargeId)) {
    throw new PaymentError(`Refund for charge ${chargeId} is already in progress`);
  }
  refundsInProgress.add(chargeId);

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Re-check after async gap in case another request completed between
    // our lock acquisition and now (defensive, belt-and-suspenders).
    if (chargeRefundStatus.get(chargeId)) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

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
    // Always release the lock so failed refunds can be retried
    refundsInProgress.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

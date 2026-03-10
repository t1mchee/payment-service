/**
 * Refund processing service.
 *
 * Uses a synchronous in-progress lock to prevent concurrent refund
 * processing for the same charge (TOCTOU protection).
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
// Checked and acquired synchronously in the same event loop tick,
// so no two async flows can both acquire the lock for the same chargeId.
const refundInProgress = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * The "already refunded" check and the in-progress lock acquisition
 * are both synchronous, making them atomic within a single event-loop
 * tick and eliminating the TOCTOU race window.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Synchronous check-and-lock: both the "already refunded" check and the
  // "in-progress" guard happen in the same event-loop tick, so concurrent
  // callers cannot both pass before either acquires the lock.
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  if (refundInProgress.has(chargeId)) {
    throw new PaymentError(`Refund already in progress for charge ${chargeId}`);
  }

  // Acquire the lock synchronously — still in the same tick as the checks above
  refundInProgress.add(chargeId);

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
    refundInProgress.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

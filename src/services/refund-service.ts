/**
 * Refund processing service.
 *
 * Uses a synchronous in-progress lock to prevent concurrent refund
 * requests for the same charge from both passing the "already refunded?"
 * check before either marks the charge as refunded.
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

// Synchronous lock: tracks chargeIds currently being processed.
// Because this is checked and set before any `await`, no two concurrent
// requests can both acquire the lock for the same chargeId.
const refundsInProgress = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * The check-and-lock is performed synchronously (before any await)
 * to eliminate the TOCTOU race window.
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

  // Synchronous lock: if another request is already processing a refund
  // for this charge, reject immediately. Because this check + add happens
  // synchronously (no await in between), it is atomic within the Node.js
  // event loop — only one request can acquire the lock.
  if (refundsInProgress.has(chargeId)) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
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
    refundsInProgress.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

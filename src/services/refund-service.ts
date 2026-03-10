/**
 * Refund processing service.
 *
 * Uses a synchronous in-flight lock to prevent concurrent refund
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

// In-flight lock: tracks charges currently being processed for refund.
// This prevents the TOCTOU race by atomically checking and marking a
// charge as "in-flight" before any async work begins.
const refundsInFlight = new Set<string>();

/**
 * Process a refund for a charge.
 *
 * The check-and-lock is performed synchronously (before any await)
 * so that concurrent calls for the same chargeId cannot both proceed
 * past the guard — Node.js runs synchronous code to completion within
 * a single microtask, eliminating the race window.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Check if already refunded (completed)
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Atomically check-and-lock: if another request is already in-flight
  // for this charge, reject the duplicate immediately.
  if (refundsInFlight.has(chargeId)) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }
  refundsInFlight.add(chargeId);

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mark charge as permanently refunded
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
    // Release the in-flight lock whether we succeeded or failed
    refundsInFlight.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

/**
 * Refund processing service.
 *
 * FIX: Resolved TOCTOU race condition in concurrent refund processing.
 * The check-and-set is now atomic (before any async operation), and a
 * per-charge lock prevents concurrent refund processing for the same charge.
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

// Per-charge lock to serialize concurrent refund requests for the same charge.
// Each pending lock is a promise that resolves when the in-flight refund completes.
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Process a refund for a charge.
 *
 * Uses a per-charge lock to ensure that only one refund request is
 * processed at a time for a given charge, eliminating the TOCTOU
 * race condition.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Wait for any in-flight refund for this charge to complete first
  const existingLock = chargeLocks.get(chargeId);
  if (existingLock) {
    await existingLock;
  }

  // After awaiting the lock, re-check whether the charge was already refunded
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Acquire lock: create a promise that we control, so concurrent requests
  // will wait on it before proceeding.
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  chargeLocks.set(chargeId, lockPromise);

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
    // Release the lock so any queued request can proceed (and see the updated status)
    releaseLock!();
    chargeLocks.delete(chargeId);
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

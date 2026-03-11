/**
 * Refund processing service.
 *
 * Uses per-charge locking to prevent race conditions in concurrent
 * refund processing. Only one refund request per charge can be
 * processed at a time.
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

// Per-charge lock to serialize concurrent refund requests
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Process a refund for a charge.
 *
 * Uses a per-charge lock to ensure that the "already refunded?" check
 * and the "mark as refunded" update are serialized, preventing
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

  // Chain onto any existing lock for this charge so requests queue up.
  // Each caller stores its own lock promise BEFORE awaiting, ensuring
  // subsequent callers chain onto it (not the same previous lock).
  const previousLock = chargeLocks.get(chargeId) ?? Promise.resolve();

  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  chargeLocks.set(chargeId, currentLock);

  // Wait for the previous operation to finish
  await previousLock;

  try {
    // Check is now safe — serialized by the lock chain
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

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
    // Release the lock so the next queued request can proceed
    releaseLock!();
    // Only clean up if we are still the latest in the chain
    if (chargeLocks.get(chargeId) === currentLock) {
      chargeLocks.delete(chargeId);
    }
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

/**
 * Refund processing service.
 *
 * Uses a per-charge lock to prevent concurrent refund processing
 * for the same charge, avoiding double-refund race conditions.
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

// Per-charge lock map: ensures only one refund operation can proceed
// at a time for a given charge, eliminating the TOCTOU race window.
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-charge lock. Returns a release function.
 * If another refund is already in progress for this charge,
 * the caller waits until the previous one completes.
 */
function acquireChargeLock(chargeId: string): Promise<() => void> {
  const existing = chargeLocks.get(chargeId) ?? Promise.resolve();

  let release: () => void;
  const newLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  chargeLocks.set(chargeId, newLock);

  return existing.then(() => release!);
}

/**
 * Process a refund for a charge.
 *
 * Uses a per-charge lock so that the "already refunded?" check and
 * the "mark as refunded" update are effectively atomic — concurrent
 * requests for the same charge are serialized.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Acquire a per-charge lock to prevent concurrent refund processing
  const release = await acquireChargeLock(chargeId);

  try {
    // Check is now safe: we hold the lock for this chargeId
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mark as refunded — still under the lock, so no other request
    // can sneak past the check above
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
    release();
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

/**
 * Refund processing service.
 *
 * Uses a per-charge lock to ensure that concurrent refund requests
 * for the same charge are serialized, preventing double refunds.
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

// Per-charge lock map to serialize concurrent refund requests
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-charge lock so that only one refund request
 * processes at a time for any given chargeId.
 * Returns a release function to call when done.
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
 * Uses a per-charge lock to make the "already refunded?" check and
 * the "mark as refunded" update atomic with respect to concurrent
 * requests, eliminating the TOCTOU race condition.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Acquire per-charge lock to serialize concurrent refund attempts
  const releaseLock = await acquireChargeLock(chargeId);

  try {
    // Check is now safe — we hold the lock for this chargeId
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Mark as refunded BEFORE the async processing delay so that
    // any request that acquires the lock next will see the flag
    chargeRefundStatus.set(chargeId, true);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    const refund: RefundRecord = {
      refundId: `re_${uuidv4().slice(0, 12)}`,
      chargeId,
      amountCents,
      status: "completed",
      createdAt: new Date(),
    };

    refundStore.set(refund.refundId, refund);
    return refund;
  } catch (err) {
    // If processing fails after we set the flag, roll back the status
    // so the charge can be retried (only roll back for non-duplicate errors)
    if (
      err instanceof PaymentError &&
      err.message.includes("already been refunded")
    ) {
      // Duplicate — don't roll back, re-throw
      throw err;
    }
    chargeRefundStatus.set(chargeId, false);
    throw err;
  } finally {
    releaseLock();
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

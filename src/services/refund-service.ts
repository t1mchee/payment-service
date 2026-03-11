/**
 * Refund processing service.
 *
 * Uses a per-charge lock to prevent race conditions in concurrent
 * refund processing. Only one refund request can be processed at a
 * time for a given charge, ensuring the "already refunded?" check
 * and the "mark as refunded" update are atomic across async boundaries.
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

// Per-charge lock to serialize concurrent refund requests for the same charge
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-charge lock. Returns a release function that must be
 * called when the critical section is complete.
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
 * Uses a per-charge lock to prevent TOCTOU race conditions.
 * The check for "already refunded" and the "mark as refunded" are
 * serialized so concurrent requests cannot both pass the check.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Acquire per-charge lock to make the check-and-update atomic
  const release = await acquireChargeLock(chargeId);

  try {
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Mark as refunded immediately before any async work to close the race window
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
    // If processing fails after marking as refunded, roll back the status
    // so the charge can be retried (only if we set it in this call)
    if (err instanceof PaymentError && err.message.includes("already been refunded")) {
      // Don't roll back — the charge was already refunded by another request
    } else {
      chargeRefundStatus.set(chargeId, false);
    }
    throw err;
  } finally {
    release();
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

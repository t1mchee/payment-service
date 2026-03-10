/**
 * Refund processing service.
 *
 * Uses a per-charge lock to ensure that the "already refunded?" check
 * and the "mark as refunded" update are atomic, preventing double refunds
 * when concurrent requests arrive for the same charge.
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

// Per-charge lock to prevent concurrent refund processing for the same charge.
// Each lock is a promise chain: new requests wait for the previous one to finish.
const chargeLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-charge lock. Returns a release function that must be called
 * when the critical section is complete.
 */
function acquireChargeLock(chargeId: string): Promise<() => void> {
  let releaseFn: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  const previousLock = chargeLocks.get(chargeId) ?? Promise.resolve();
  chargeLocks.set(chargeId, newLock);

  return previousLock.then(() => releaseFn!);
}

/**
 * Process a refund for a charge.
 *
 * Uses a per-charge lock so that the "already refunded?" check and the
 * "mark as refunded" update are serialized, eliminating the TOCTOU race.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Acquire per-charge lock to make check-and-set atomic
  const release = await acquireChargeLock(chargeId);

  try {
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Mark as refunded BEFORE the async processing delay so that any
    // concurrent request that acquires the lock next will see the updated status.
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
  } finally {
    release();
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

/**
 * Refund processing service.
 *
 * Uses a per-charge lock to prevent race conditions in concurrent
 * refund processing. The lock ensures that only one refund request
 * can be processed at a time for a given charge.
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
 * Acquire a per-charge lock so that only one refund can be processed
 * at a time for a given chargeId. Returns a release function.
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
 * A per-charge mutex ensures the "already refunded?" check and the
 * "mark as refunded" update are atomic across async boundaries,
 * preventing double refunds from concurrent requests.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Acquire per-charge lock to prevent concurrent refund processing
  const releaseLock = await acquireChargeLock(chargeId);

  try {
    // Check is now safe — we hold the lock for this chargeId
    const alreadyRefunded = chargeRefundStatus.get(chargeId);
    if (alreadyRefunded) {
      throw new PaymentError(`Charge ${chargeId} has already been refunded`);
    }

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mark as refunded while still holding the lock
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
    releaseLock();
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

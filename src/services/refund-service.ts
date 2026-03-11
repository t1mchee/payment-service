/**
 * Refund processing service.
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
 * Process a refund for a charge.
 *
 * Uses a per-charge promise chain to ensure that the "already refunded?"
 * check and the "mark as refunded" update are serialized, preventing
 * concurrent requests from both passing the check. This correctly
 * handles any number of concurrent requests by chaining them.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate (before acquiring lock to fail fast)
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Chain this request after any in-flight refund for the same charge.
  // Each new caller appends to the chain, so N>2 requests are serialized.
  const previous = chargeLocks.get(chargeId) ?? Promise.resolve();

  let releaseLock: () => void;
  const lock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  chargeLocks.set(chargeId, lock);

  // Wait for the previous request to finish (success or failure)
  await previous;

  try {
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
    releaseLock!();
    // Only clean up if we are still the latest in the chain
    if (chargeLocks.get(chargeId) === lock) {
      chargeLocks.delete(chargeId);
    }
  }
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

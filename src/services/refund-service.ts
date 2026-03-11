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

async function withChargeLock<T>(
  chargeId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Wait for any existing lock on this charge to resolve
  const existing = chargeLocks.get(chargeId);
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  chargeLocks.set(chargeId, lockPromise);

  if (existing) {
    await existing;
  }

  try {
    return await fn();
  } finally {
    releaseLock!();
    // Clean up lock if it's still ours
    if (chargeLocks.get(chargeId) === lockPromise) {
      chargeLocks.delete(chargeId);
    }
  }
}

/**
 * Process a refund for a charge.
 *
 * Uses a per-charge lock to prevent concurrent refund requests from
 * racing past the "already refunded?" check.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  return withChargeLock(chargeId, async () => {
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
  });
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

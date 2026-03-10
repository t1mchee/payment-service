/**
 * Refund processing service.
 *
 * BUG: Race condition in concurrent refund processing.
 * When two refund requests arrive for the same charge simultaneously,
 * both can pass the "already refunded?" check before either marks
 * the charge as refunded, resulting in double refunds.
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

/**
 * Process a refund for a charge.
 *
 * BUG: Time-of-check to time-of-use (TOCTOU) race condition.
 * The check for "already refunded" and the "mark as refunded" are
 * not atomic. Two concurrent requests can both pass the check.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // BUG: Race condition — check is not atomic with the update below
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Simulate processing delay (this is where the race window opens)
  await new Promise((resolve) => setTimeout(resolve, 50));

  // BUG: Another request could have refunded while we were waiting
  // This should re-check, but doesn't
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
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

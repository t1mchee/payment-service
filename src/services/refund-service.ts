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

/**
 * Process a refund for a charge.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Simulate processing delay (this is where the race window opens)
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Re-check after async delay to prevent double refunds
  const alreadyRefundedAfterWait = chargeRefundStatus.get(chargeId);
  if (alreadyRefundedAfterWait) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

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

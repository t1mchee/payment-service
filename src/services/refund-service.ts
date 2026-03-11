/**
 * Refund processing service.
 *
 * Handles refund processing with protection against concurrent
 * duplicate refund requests for the same charge.
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
 * Atomically checks and marks a charge as refunded before any async
 * work to prevent concurrent duplicate refunds.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Check and immediately mark as refunded to prevent concurrent requests
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Mark as refunded before the async gap to close the race window
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
}

/** Get refund by ID */
export function getRefund(refundId: string): RefundRecord | undefined {
  return refundStore.get(refundId);
}

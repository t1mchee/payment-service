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
 *
 * Marks the charge as refunded atomically (before any async gap)
 * to prevent concurrent requests from issuing double refunds.
 */
export async function processRefund(
  chargeId: string,
  amountCents: number
): Promise<RefundRecord> {
  // Validate
  if (amountCents <= 0) {
    throw new PaymentError("Refund amount must be positive");
  }

  // Check if charge has already been refunded or is being processed
  const alreadyRefunded = chargeRefundStatus.get(chargeId);
  if (alreadyRefunded) {
    throw new PaymentError(`Charge ${chargeId} has already been refunded`);
  }

  // Mark as refunded immediately before the async gap to prevent
  // concurrent requests from passing the check above
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

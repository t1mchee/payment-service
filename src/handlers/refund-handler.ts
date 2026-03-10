/**
 * Express handler for the /refunds endpoint.
 */

import { Request, Response, NextFunction } from "express";
import { processRefund } from "../services/refund-service";
import { AppError } from "../errors";

export async function handleCreateRefund(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chargeId, amountCents } = req.body;

    if (!chargeId || !amountCents) {
      throw new AppError("Missing required fields: chargeId, amountCents", 400);
    }

    const refund = await processRefund(chargeId, Number(amountCents));
    res.status(201).json(refund);
  } catch (err) {
    next(err);
  }
}

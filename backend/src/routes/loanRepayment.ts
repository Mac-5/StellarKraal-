import { Router, Request, Response } from 'express';
import { TransactionBuilder, Networks, Transaction } from '@stellar/stellar-sdk';
import { config } from '../config';
import { auditMiddleware } from '../middleware/audit';
import { writeLimiter } from '../middleware/rateLimit';
import { timeoutMiddleware } from '../middleware/timeout';
import { asyncHandler } from '../utils/asyncHandler';
import { submitLoanRepayment } from '../services/repaymentService';

export const loanRepaymentRouter = Router();

/**
 * @openapi
 * /loans/{id}/repay:
 *   post:
 *     tags:
 *       - loan
 *     summary: Submit pre-signed XDR for loan repayment
 *     description: Locks the loan in a database transaction before checking status and submitting signed XDR. Returns 409 for terminal loans or an already pending repayment.
 *     operationId: repayLoanOnChain
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Loan ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: Object containing the base64-encoded signed XDR transaction string.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Repayment payload with signed XDR string.
 *             required:
 *               - signedXdr
 *             properties:
 *               signedXdr:
 *                 type: string
 *                 description: Base64-encoded signed Stellar transaction XDR
 *                 example: AAAAAG...
 *     responses:
 *       '200':
 *         description: Transaction submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Transaction submission result containing transaction hash and status.
 *               properties:
 *                 hash:
 *                   type: string
 *                   description: Stellar transaction hash
 *                   example: 8f4a...
 *                 status:
 *                   type: string
 *                   description: Submission status
 *                   example: PENDING
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '404':
 *         description: Loan not found
 *       '409':
 *         description: Loan is not repayable or a repayment is already pending
 *       '502':
 *         description: The network did not accept the transaction
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
loanRepaymentRouter.post(
  '/loans/:id/repay',
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const signedXdr = req.body.signedXdr;
    if (!signedXdr || typeof signedXdr !== 'string') {
      return res.status(400).json({ error: 'signedXdr is required and must be a string' });
    }

    let tx: Transaction;
    try {
      tx = TransactionBuilder.fromXDR(
        signedXdr,
        config.NEXT_PUBLIC_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
      ) as Transaction;
    } catch (err) {
      return res.status(400).json({ error: 'Invalid XDR structure' });
    }

    if (!tx || !tx.operations || tx.operations.length === 0) {
      return res.status(400).json({ error: 'Transaction contains no operations' });
    }

    const response = await submitLoanRepayment(req.params.id as string, tx);
    res.json(response);
  })
);


import { Router, Request, Response } from 'express';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import { loanService } from '../services/loanService';

const router = Router();

const LOAN_FIELDS = [
  'id',
  'borrowerId',
  'borrowerName',
  'principal',
  'interestRate',
  'termMonths',
  'status',
  'collateralId',
  'collateralValue',
  'amountFunded',
  'amountRepaid',
  'outstandingBalance',
  'createdAt',
  'updatedAt',
  'dueDate',
];

async function* streamLoans(batchSize = 500): AsyncGenerator<Record<string, unknown>> {
  let offset = 0;
  while (true) {
    const batch = await loanService.listLoans({ limit: batchSize, offset });
    if (!batch || batch.length === 0) break;
    for (const loan of batch) {
      yield loan as Record<string, unknown>;
    }
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
}

async function exportCsv(res: Response): Promise<void> {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="loans-export.csv"');

  const parser = new Parser({ fields: LOAN_FIELDS });
  let headerWritten = false;

  for await (const loan of streamLoans()) {
    const csv = parser.parse(loan);
    if (!headerWritten) {
      res.write(csv + '\n');
      headerWritten = true;
    } else {
      const lines = csv.split('\n');
      res.write(lines.slice(1).join('\n') + '\n');
    }
  }

  if (!headerWritten) {
    res.write(parser.parse([]) + '\n');
  }

  res.end();
}

async function exportPdf(res: Response): Promise<void> {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="loans-export.pdf"');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1a1a2e').text('StellarKraal', { align: 'center' });
  doc.fontSize(12).fillColor('#555555').text('Loan Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(9).fillColor('#888888').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
  doc.moveDown(2);

  let count = 0;
  for await (const loan of streamLoans()) {
    count += 1;
    doc.fontSize(11).fillColor('#1a1a2e').text(`Loan #${loan.id ?? count}`);
    doc.fontSize(9).fillColor('#333333');
    for (const field of LOAN_FIELDS) {
      if (field === 'id') continue;
      const value = loan[field];
      if (value === undefined || value === null) continue;
      doc.text(`${field}: ${String(value)}`);
    }
    doc.moveDown();

    if (doc.y > 720) {
      doc.addPage();
    }
  }

  if (count === 0) {
    doc.fontSize(11).fillColor('#333333').text('No loans found.');
  }

  doc.end();
}

router.get('/export', async (req: Request, res: Response) => {
  const format = String(req.query.format || 'csv').toLowerCase();

  try {
    if (format === 'csv') {
      await exportCsv(res);
    } else if (format === 'pdf') {
      await exportPdf(res);
    } else {
      res.status(400).json({ error: 'Unsupported format. Use csv or pdf.' });
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export loans' });
    } else {
      res.end();
    }
  }
});

export default router;

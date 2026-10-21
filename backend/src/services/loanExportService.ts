import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

export interface LoanRecord {
  id: string | number;
  borrowerId?: string | number;
  borrowerName?: string;
  amount?: number;
  currency?: string;
  interestRate?: number;
  termMonths?: number;
  status?: string;
  collateralId?: string | number;
  createdAt?: string | Date;
  dueDate?: string | Date;
  [key: string]: unknown;
}

const CSV_FIELDS = [
  'id',
  'borrowerId',
  'borrowerName',
  'amount',
  'currency',
  'interestRate',
  'termMonths',
  'status',
  'collateralId',
  'createdAt',
  'dueDate',
];

export type ExportFormat = 'csv' | 'pdf';

export interface ExportResult {
  stream: Readable;
  contentType: string;
  filename: string;
}

function buildFilename(format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `loans-export-${stamp}.${format}`;
}

/**
 * Streams loans as CSV with headers. Uses json2csv's streaming parser so large
 * exports are not buffered fully in memory.
 */
export function createCsvExportStream(loans: LoanRecord[]): Readable {
  const parser = new Parser<LoanRecord>({ fields: CSV_FIELDS, header: true });
  const source = Readable.from(loans, { objectMode: true });
  return source.pipe(parser);
}

/**
 * Streams a branded PDF loan summary. Rows are written incrementally to the
 * PDFDocument, which is itself a readable stream, avoiding full buffering.
 */
export function createPdfExportStream(loans: LoanRecord[]): Readable {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  doc.fontSize(20).fillColor('#1a1a2e').text('StellarKraal', { align: 'left' });
  doc
    .fontSize(12)
    .fillColor('#555555')
    .text('Loan Report Summary', { align: 'left' });
  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor('#888888')
    .text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown(1);

  doc.fontSize(10).fillColor('#000000');
  loans.forEach((loan, index) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
    }
    doc.text(
      `${index + 1}. Loan #${loan.id} | Borrower: ${loan.borrowerName ?? loan.borrowerId ?? 'N/A'} | ` +
        `Amount: ${loan.amount ?? 'N/A'} ${loan.currency ?? ''} | Status: ${loan.status ?? 'N/A'}`,
    );
    doc.moveDown(0.3);
  });

  doc.end();
  return doc as unknown as Readable;
}

export function createLoanExport(loans: LoanRecord[], format: ExportFormat): ExportResult {
  if (format === 'pdf') {
    return {
      stream: createPdfExportStream(loans),
      contentType: 'application/pdf',
      filename: buildFilename('pdf'),
    };
  }
  return {
    stream: createCsvExportStream(loans),
    contentType: 'text/csv; charset=utf-8',
    filename: buildFilename('csv'),
  };
}

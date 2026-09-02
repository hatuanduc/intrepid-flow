import PDFDocument from 'pdfkit';
import * as path from 'path';

// PDFKit's built-in 14 standard fonts (Helvetica etc.) only support WinAnsi/Latin-1
// encoding — Vietnamese diacritics (ệ, ố, ĩ, ...) fall outside that and render as
// overlapping garbage glyphs instead of throwing, which is what a real HSBC PDF (this
// mock's whole point is to imitate) would never do.
//
// NOTE: a per-script "vietnamese" subset font (tried first, e.g. Fontsource's
// noto-sans vietnamese-400-normal.ttf) is NOT enough on its own — Google
// Fonts/Fontsource split files by unicode-range for web-performance reasons, so the
// "vietnamese" subset only contains the accented characters and is MISSING plain
// ASCII (a-z, spaces, punctuation), rendering those as blank boxes. DejaVu Sans is a
// single unsubsetted TTF with full Unicode coverage (ASCII + Vietnamese combining
// diacritics together) — bundled directly (~700KB/weight) rather than depending on a
// system font that may not exist in the container this runs in.
const FONT_DIR = path.join(process.cwd(), 'src/app/api/mock-hsbc/export-transaction-pdf/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

// Mirrors the real HSBCnet "Export PDF" button inside the "Chi tiết giao dịch" popup:
// opens the PDF *inline* (Content-Disposition: inline, not attachment) so the browser
// renders it in its own native PDF viewer in a new tab — that's exactly the surface the
// worker's Playwright automation targets by intercepting the `application/pdf` network
// response, rather than driving Chrome's internal viewer UI (see bank-sync PDF-export plan).
export const runtime = 'nodejs';

// Real HSBC filenames look like "AITRANPRINT2026-08-31-04.38.26.760000" — a
// generation-timestamp, not a stable per-transaction id (re-exporting the same
// transaction later produces a different name). Only used here for realism/audit;
// the worker's dedup key is the underlying BankTransaction row, not this filename.
function buildFileName(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const micros = `${pad(d.getMilliseconds(), 3)}000`;
  return `AITRANPRINT${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-`
    + `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.${micros}.pdf`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key) ?? '';

  const accountName   = get('name');
  const accountNumber = get('acc');
  const bankName      = get('bank');
  const currency      = get('cur');
  const bankRef       = get('ref');
  const customerRef   = get('cref') || bankRef;
  const narrative     = get('narrative');
  const postDate      = get('date');
  const amount        = get('amount');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('DejaVuSans', FONT_REGULAR);
  doc.registerFont('DejaVuSans-Bold', FONT_BOLD);
  doc.font('DejaVuSans');
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.fontSize(18).text('HSBC  |  Chi tiết giao dịch', { align: 'left' });
  doc.moveDown(1.5);

  doc.fontSize(11);
  const row = (label: string, value: string) => {
    doc.font('DejaVuSans-Bold').text(label, { continued: true, width: 220 });
    doc.font('DejaVuSans').text(`  ${value || 'Không có sẵn'}`);
  };
  row('Tên tài khoản', accountName);
  row('Số tài khoản', accountNumber);
  row('Tên ngân hàng', bankName);
  row('Tiền tệ', currency);
  doc.moveDown();
  doc.fontSize(13).font('DejaVuSans-Bold').text(`Thông tin chi tiết vào ${postDate}`);
  doc.moveDown(0.5);
  doc.fontSize(11);
  row('Mã tham chiếu khách hàng', customerRef);
  row('Mã tham chiếu ngân hàng', bankRef);
  row('Mã tham chiếu liên quan', bankRef);
  row('Chú giải bổ sung', narrative);
  row('Số tiền', amount);

  // Second page — mirrors the real popup's multi-page PDF (screenshot showed "1/2"),
  // which the worker must be able to walk past without assuming a single-page document.
  doc.addPage();
  doc.fontSize(13).font('DejaVuSans-Bold').text('Chi tiết ghi nợ');
  doc.moveDown(0.5);
  doc.fontSize(11);
  row('Mã tham chiếu khách hàng', customerRef);
  row('Ngày hiệu lực', postDate);
  row('Số tiền ròng', amount);

  doc.end();
  const buffer = await done;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${buildFileName()}"`,
      'Cache-Control': 'no-store',
    },
  });
}

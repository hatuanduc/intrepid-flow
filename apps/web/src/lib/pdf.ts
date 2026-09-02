import { downloadTransactionPdf } from './api';

// Shared by BankJobDetailPage and BankMetricsPage's transaction tables — both render
// a "PDF" icon that opens the fetched transaction PDF in a new tab. Goes through an
// authenticated fetch + Blob URL (see downloadTransactionPdf's comment) rather than a
// plain <a href>, since the endpoint requires the Bearer auth header a passive link
// navigation can't send.
export async function openTransactionPdfInNewTab(
  transactionId: number,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const { blob } = await downloadTransactionPdf(transactionId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke after a delay rather than immediately — the new tab needs the URL to
    // still be valid by the time it finishes loading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    onError('PDF_OPEN_FAILED');
  }
}

// Minimal, memory-lean .xlsx row reader — deliberately bypasses ExcelJS's object model (styles,
// number formats, merged-cell tracking, formula objects) entirely.
//
// Why this exists: some real invoice-listing exports (seen from what looks like a tax e-invoice
// portal) write every text cell as an *inline string* instead of using the shared-strings table
// Excel normally dedupes repeated text into. A 27MB file like that parsed to ~3.8 million
// individually-allocated string objects under ExcelJS's plain loader, peaking around 2GB+ of
// heap — despite being roughly the same byte size as another file that parsed fine (which *did*
// use shared strings). ExcelJS's own streaming reader was also ruled out separately (proven flaky
// even as a single isolated read — see invoice-file-worker.ts's history). This reader extracts
// only raw cell values row-by-row via a streaming XML (SAX) parser, so peak memory is bounded by
// how much of the *filtered output* the caller chooses to retain, not by the shape of the input
// file's string encoding.
import * as unzipper from 'unzipper';
import { SaxesParser, type SaxesTagPlain } from 'saxes';

export type XlsxCellValue = string | number | null;

async function openSheetEntries(filePath: string) {
  const dir = await unzipper.Open.file(filePath);
  const sharedStringsEntry = dir.files.find(e => e.path === 'xl/sharedStrings.xml');
  const sheetEntry = dir.files.find(e => /^xl\/worksheets\/sheet1\.xml$/.test(e.path));
  if (!sheetEntry) throw new Error('Không tìm thấy sheet dữ liệu trong file.');
  return { sharedStringsEntry, sheetEntry };
}

// 1-based, matching ExcelJS's Row.values convention (index 0 unused, index 1 = column A) — see
// readXlsxRows()'s doc comment for why this reader deliberately mirrors that instead of using a
// more natural 0-based array.
function columnRefToIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n || 1;
}

// Parses xl/sharedStrings.xml into an index -> string array. Each <si> entry's full text content
// is the concatenation of every <t> within it (handles both plain <si><t> and rich-text-run
// <si><r><t>...</r><r><t>...</r></si> forms identically, since we only care about the text).
function parseSharedStrings(stream: NodeJS.ReadableStream): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const strings: string[] = [];
    let current = '';
    let inText = false;

    const parser = new SaxesParser();
    parser.on('opentag', (tag: SaxesTagPlain) => {
      if (tag.name === 'si') current = '';
      if (tag.name === 't') inText = true;
    });
    parser.on('text', text => { if (inText) current += text; });
    parser.on('closetag', (tag: SaxesTagPlain) => {
      if (tag.name === 't') inText = false;
      if (tag.name === 'si') strings.push(current);
    });
    parser.on('error', reject);

    stream.on('data', (chunk: Buffer) => {
      try { parser.write(chunk.toString('utf8')); } catch (err) { reject(err); }
    });
    stream.on('end', () => {
      try { parser.close(); resolve(strings); } catch (err) { reject(err); }
    });
    stream.on('error', reject);
  });
}

// Streams xl/worksheets/sheet1.xml, invoking onRow(rowNum, values) once per complete <row> — the
// row's cell array is discarded immediately after the callback returns, so memory only grows with
// whatever the callback itself chooses to retain (matches ProcessSingleFile's old row-by-row
// contract exactly).
function streamSheetRows(
  stream: NodeJS.ReadableStream,
  sharedStrings: string[],
  onRow: (rowNum: number, values: XlsxCellValue[]) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let rowNum = 0;
    let rowValues: XlsxCellValue[] = [];
    let cellCol = 1;
    let cellType: string | null = null;
    let cellText = '';
    let inValueOrText = false;
    let sawValueForCell = false;

    const parser = new SaxesParser();

    parser.on('opentag', (tag: SaxesTagPlain) => {
      if (tag.name === 'row') {
        const r = Number(tag.attributes.r);
        rowNum = Number.isFinite(r) && r > 0 ? r : rowNum + 1;
        rowValues = [];
      } else if (tag.name === 'c') {
        cellCol = columnRefToIndex(tag.attributes.r ?? '');
        cellType = tag.attributes.t ?? null;
        cellText = '';
        sawValueForCell = false;
      } else if (tag.name === 'v' || tag.name === 't') {
        inValueOrText = true;
        cellText = '';
      }
    });

    parser.on('text', text => { if (inValueOrText) cellText += text; });

    parser.on('closetag', (tag: SaxesTagPlain) => {
      if (tag.name === 'v' || tag.name === 't') {
        inValueOrText = false;
        sawValueForCell = true;
      } else if (tag.name === 'c') {
        let value: XlsxCellValue = null;
        if (sawValueForCell) {
          if (cellType === 's') {
            const idx = Number(cellText);
            value = Number.isFinite(idx) ? (sharedStrings[idx] ?? null) : null;
          } else if (cellType === 'inlineStr' || cellType === 'str') {
            value = cellText;
          } else if (cellText !== '') {
            const n = Number(cellText);
            value = Number.isFinite(n) ? n : cellText;
          }
        }
        // 1-based placement (rowValues[0] stays unused) to mirror ExcelJS's Row.values shape.
        while (rowValues.length <= cellCol) rowValues.push(null);
        rowValues[cellCol] = value;
      } else if (tag.name === 'row') {
        onRow(rowNum, rowValues);
      }
    });

    parser.on('error', reject);

    stream.on('data', (chunk: Buffer) => {
      try { parser.write(chunk.toString('utf8')); } catch (err) { reject(err); }
    });
    stream.on('end', () => {
      try { parser.close(); resolve(); } catch (err) { reject(err); }
    });
    stream.on('error', reject);
  });
}

// Public entry point: reads the first worksheet of an .xlsx file, calling onRow(rowNum, values)
// for each row in document order. `values` is 1-indexed, matching ExcelJS's `Row.values`
// convention exactly (index 0 unused, index 1 = column A) — so callers migrating from ExcelJS's
// `worksheet.eachRow((row, rowNum) => { const values = row.values; ... })` need no index math
// changes (see invoice-file-worker.ts).
export async function readXlsxRows(
  filePath: string,
  onRow: (rowNum: number, values: XlsxCellValue[]) => void,
): Promise<void> {
  const { sharedStringsEntry, sheetEntry } = await openSheetEntries(filePath);
  const sharedStrings = sharedStringsEntry ? await parseSharedStrings(sharedStringsEntry.stream()) : [];
  await streamSheetRows(sheetEntry.stream(), sharedStrings, onRow);
}

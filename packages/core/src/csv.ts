/**
 * CSV helpers for subscriber export/import. The record separator is a comma
 * and cells may be quoted (RFC 4180): quoted cells may contain commas, CRLF
 * or doubled quotes. Splitting on "," naively breaks such files.
 */

/** Split a CSV document into rows of cells, handling quotes, CRLF and BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (inQuotes) {
    row.push(cell);
    rows.push(row);
  } else if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Escape a value as a quoted CSV cell (always quoted for safety). */
export function csvCell(value: string | null | undefined): string {
  const str = value ?? "";
  return `"${str.replace(/"/g, '""')}"`;
}
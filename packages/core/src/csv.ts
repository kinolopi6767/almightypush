/**
 * CSV helpers for subscriber export/import. The record separator is a comma
 * and cells may be quoted (RFC 4180): quoted cells may contain commas, CRLF
 * or doubled quotes. Splitting on "," naively breaks such files.
 */

/** Split a CSV document into rows of cells, handling quotes, CRLF and BOM. */
export function parseCsv(text: string, opts: { maxBytes?: number; maxRows?: number } = {}): string[][] {
  const maxBytes = opts.maxBytes ?? 10_000_000;
  const maxRows = opts.maxRows ?? 100_000;
  if (typeof text !== "string") throw new Error("Invalid CSV input");
  if (text.length > maxBytes) throw new Error(`CSV too large (max ${maxBytes} bytes)`);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  // Row cap is enforced at every point a row is committed — the previous
  // check lived only in the generic-character branch, so a document whose
  // delimiters/row-breaks consumed the whole input (e.g. "\n" x 1M) bypassed
  // maxRows entirely and could allocate millions of row arrays.
  const pushRow = (): void => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    if (rows.length > maxRows) throw new Error(`CSV has too many rows (max ${maxRows})`);
  };

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
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (inQuotes) {
    // Truncated export/import: silently accepting the partial tail produced
    // a plausible-looking final row. Fail instead so callers can reject.
    throw new Error("CSV has an unterminated quoted cell");
  }
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

/** Escape a value as a quoted CSV cell (always quoted for safety). */
export function csvCell(value: string | null | undefined): string {
  let str = value ?? "";
  // CSV formula injection defense: spreadsheet apps interpret cells starting
  // with = + - @ TAB CR LF as formulas/DDE. Attacker-controlled fields
  // (browser, os, city… via the public subscribe API) must never execute on
  // export. Newline included: a quoted cell can begin with one. Excel also
  // trims leading spaces, so " =1+1" executes — check after stripping.
  if (/^[\s]*[=+\-@\t\r\n]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/** One row of the campaign analytics export (E9), pre-aggregated. */
export interface CampaignAnalyticsRow {
  id: number;
  title: string;
  domain: string | null;
  status: string;
  sent_at: string | null;
  delivered: number;
  failed: number;
  clicked: number;
  buttons: string[]; // labels in order
  per_button: Record<string, number>;
}

/** RFC-4180 export of campaign analytics with a header row. */
export function campaignAnalyticsCsv(rows: CampaignAnalyticsRow[]): string {
  const header = ["id", "title", "domain", "status", "sent_at", "delivered", "failed", "clicked", "click_rate_pct", "buttons", "clicks_per_button"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const clicksPerButton = Object.keys(r.per_button).length > 0 ? JSON.stringify(r.per_button) : "";
    const rate = r.delivered > 0 ? ((r.clicked / r.delivered) * 100).toFixed(2) : "";
    lines.push(
      [r.id, r.title, r.domain, r.status, r.sent_at, r.delivered, r.failed, r.clicked, rate, r.buttons.join(" | "), clicksPerButton]
        // Nulls (domain/sent_at on unsent campaigns) must export as empty —
        // String(null) would write the literal text "null" into the file.
        .map((v) => csvCell(v == null ? "" : String(v)))
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
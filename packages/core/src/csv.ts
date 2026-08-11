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
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
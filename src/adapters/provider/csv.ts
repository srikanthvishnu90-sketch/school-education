/**
 * A small, dependency-free CSV parser (RFC 4180 subset) — enough for SIS/LMS
 * gradebook exports: quoted fields, embedded commas and newlines, doubled quotes,
 * and CRLF or LF line endings. Rows are keyed by the header row. No new dependency
 * for the pilot's universal fallback ingestion path.
 */

export interface ParsedCsv {
  header: string[];
  rows: Record<string, string>[];
}

/** Split CSV text into a matrix of string cells, honoring quotes. */
function toMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue; // swallow CR; the LF triggers the row
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush a trailing field/row that had no closing newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/**
 * Parse CSV text into header + keyed rows. Blank lines are skipped. Cells beyond
 * the header width are dropped; missing trailing cells become "".
 */
export function parseCsv(text: string): ParsedCsv {
  const matrix = toMatrix(text).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  if (matrix.length === 0) return { header: [], rows: [] };

  const header = matrix[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (const cells of matrix.slice(1)) {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = (cells[idx] ?? "").trim();
    });
    rows.push(record);
  }
  return { header, rows };
}

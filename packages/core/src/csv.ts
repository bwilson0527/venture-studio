/** Minimal RFC 4180 reader and writer shared by imports and exports. */

/** Parse CSV text: quoted fields, escaped quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Spreadsheets run a cell that starts with = + - @ (or a tab or carriage
 * return) as a formula. Names and addresses here are typed by outside
 * parties, so such cells get a leading apostrophe to keep them as text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvCell = string | number | null | undefined;

/**
 * Serialize rows to CSV with CRLF line endings. Text cells are protected
 * against formula injection; numbers are written as-is.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return String(cell);
          return escapeCell(neutralizeFormula(cell));
        })
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

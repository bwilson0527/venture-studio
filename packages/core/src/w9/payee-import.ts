import { parseCsv } from "../csv";

/**
 * Turn a vendor list (typically a "payments by vendor" export from the
 * client's bookkeeping software) into payees to request W-9s from.
 */

export type ImportedPayee = {
  name: string;
  email: string | null;
  /** Total paid in the tax year, in cents. Null when the file has no amount. */
  amountPaidCents: number | null;
};

export type ImportIssue = { line: number; message: string };
export type PayeeImportResult = { payees: ImportedPayee[]; issues: ImportIssue[] };

export const MAX_IMPORT_ROWS = 5000;

type Column = "name" | "email" | "amount";

const HEADER_ALIASES: Record<string, Column> = {
  name: "name",
  vendor: "name",
  "vendor name": "name",
  payee: "name",
  "payee name": "name",
  contractor: "name",
  "contractor name": "name",
  "display name": "name",
  company: "name",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  "main email": "email",
  amount: "amount",
  "amount paid": "amount",
  total: "amount",
  "total paid": "amount",
  paid: "amount",
  payments: "amount",
  "total payments": "amount",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a money cell into cents without floating point: "$1,234.50",
 * "1234.5", "(250.00)" and "-250" all work. Returns null for anything else.
 */
export function parseMoneyToCents(value: string): number | null {
  let v = value.trim();
  if (v === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[$,\s]/g, "");
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function importPayeesFromCsv(text: string): PayeeImportResult {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) {
    return { payees: [], issues: [{ line: 1, message: "The file is empty." }] };
  }

  const columns = header.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!columns.includes("name")) {
    return {
      payees: [],
      issues: [
        { line: 1, message: 'No vendor name column found. Add a "Vendor" or "Name" column.' },
      ],
    };
  }

  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      payees: [],
      issues: [
        {
          line: 1,
          message: `The file has ${body.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
        },
      ],
    };
  }

  const payees: ImportedPayee[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const raw: Partial<Record<Column, string>> = {};
    columns.forEach((key, col) => {
      // The first matching column wins when a file has, say, both "Vendor" and "Company".
      if (key && raw[key] === undefined) raw[key] = (cells[col] ?? "").trim();
    });

    const name = (raw.name ?? "").trim();
    if (!name) {
      issues.push({ line, message: "Skipped: no vendor name." });
      return;
    }
    // Bookkeeping exports end with a totals row.
    if (/^(grand )?total$/i.test(name)) return;

    let email: string | null = raw.email ? raw.email.toLowerCase() : null;
    if (email && !EMAIL_PATTERN.test(email)) {
      issues.push({
        line,
        message: `"${raw.email}" is not a valid email, so ${name} was imported without one.`,
      });
      email = null;
    }

    const key = email ?? `name:${name.toLowerCase()}`;
    if (seen.has(key)) {
      issues.push({ line, message: `Skipped: ${name} appears more than once in the file.` });
      return;
    }
    seen.add(key);

    let amountPaidCents: number | null = null;
    if (raw.amount !== undefined && raw.amount !== "") {
      amountPaidCents = parseMoneyToCents(raw.amount);
      if (amountPaidCents === null) {
        issues.push({
          line,
          message: `"${raw.amount}" is not an amount, so ${name} was imported without one.`,
        });
      }
    }

    payees.push({ name: name.slice(0, 200), email, amountPaidCents });
  });

  return { payees, issues };
}

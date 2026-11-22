/**
 * Turn a pasted or uploaded CSV of clients into validated rows. Header names
 * are matched loosely so exports from common tax software work unchanged.
 */

export const RETURN_TYPES = [
  "1040_w2",
  "1040_sched_c",
  "1040_rental",
  "1065",
  "1120s",
] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export type ImportedClient = {
  name: string;
  email: string | null;
  phone: string | null;
  returnType: ReturnType;
};

export type ImportIssue = { line: number; message: string };

export type ImportResult = {
  clients: ImportedClient[];
  issues: ImportIssue[];
};

export const MAX_IMPORT_ROWS = 2000;

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  name: "name",
  "client name": "name",
  client: "name",
  "full name": "name",
  taxpayer: "name",
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  "return type": "returnType",
  returntype: "returnType",
  return: "returnType",
  type: "returnType",
  form: "returnType",
};

type RawRow = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  returnType?: string;
};

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF. */
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

/** Map free-text return types ("1040", "Schedule C", "S-Corp") to ours. */
export function normalizeReturnType(value: string | undefined): ReturnType {
  const v = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (v === "") return "1040_w2";
  if (v.includes("1120") || v.includes("scorp")) return "1120s";
  if (v.includes("1065") || v.includes("partner")) return "1065";
  if (v.includes("rental") || v.includes("schede") || v.includes("schedulee")) {
    return "1040_rental";
  }
  if (
    v.includes("schedc") ||
    v.includes("schedulec") ||
    v.includes("selfemployed") ||
    v.includes("soleprop")
  ) {
    return "1040_sched_c";
  }
  return "1040_w2";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keep digits; accept 10-digit US numbers with an optional leading 1. */
export function normalizePhone(value: string | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function importClientsFromCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const issues: ImportIssue[] = [];
  const header = rows[0];
  if (!header) {
    return { clients: [], issues: [{ line: 1, message: "The file is empty." }] };
  }

  const columns = header.map(
    (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null,
  );
  const hasName =
    columns.includes("name") ||
    (columns.includes("firstName") && columns.includes("lastName"));
  if (!hasName) {
    return {
      clients: [],
      issues: [
        {
          line: 1,
          message:
            'No name column found. Add a "Name" column, or "First name" and "Last name".',
        },
      ],
    };
  }

  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      clients: [],
      issues: [
        {
          line: 1,
          message: `The file has ${body.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
        },
      ],
    };
  }

  const clients: ImportedClient[] = [];
  const seenEmails = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const raw: RawRow = {};
    columns.forEach((key, col) => {
      if (key) raw[key] = (cells[col] ?? "").trim();
    });

    const name = (
      raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(" ")
    ).trim();
    if (!name) {
      issues.push({ line, message: "Skipped: no name." });
      return;
    }

    let email: string | null = raw.email ? raw.email.toLowerCase() : null;
    if (email && !EMAIL_PATTERN.test(email)) {
      issues.push({
        line,
        message: `"${raw.email}" is not a valid email, so ${name} was imported without one.`,
      });
      email = null;
    }
    if (email && seenEmails.has(email)) {
      issues.push({
        line,
        message: `Skipped: ${email} appears more than once in the file.`,
      });
      return;
    }
    if (email) seenEmails.add(email);

    const phone = normalizePhone(raw.phone);
    if (raw.phone && !phone) {
      issues.push({
        line,
        message: `"${raw.phone}" is not a valid US phone number, so it was left out.`,
      });
    }

    clients.push({
      name: name.slice(0, 200),
      email,
      phone,
      returnType: normalizeReturnType(raw.returnType),
    });
  });

  return { clients, issues };
}

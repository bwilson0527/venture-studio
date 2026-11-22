import { describe, expect, it } from "vitest";

import { parseCsv } from "../csv";
import { buildW9ExportCsv, formatTin, w9ExportFileName, w9ExportHeader, type ExportVendor } from "./export";

const signed: NonNullable<ExportVendor["w9"]> = {
  legalName: "Okafor Electric Inc",
  businessName: null,
  classification: "c_corp",
  otherClassification: null,
  exemptPayeeCode: null,
  fatcaCode: null,
  addressLine1: "12 Elm St",
  addressLine2: "Suite 4, Rear",
  city: "Portland",
  state: "ME",
  postalCode: "04101",
  tinType: "ein",
  tinLast4: "4321",
  tin: "207654321",
  backupWithholding: false,
  signedName: "Ada Okafor",
  signedAt: "2026-11-22T15:04:05.000Z",
};

const vendors: ExportVendor[] = [
  { name: "Okafor Electric", email: "okafor@example.com", amountPaidCents: 1_290_000, legalOrMedical: false, w9: signed },
  { name: "J. Castellano", email: null, amountPaidCents: 320_050, legalOrMedical: false, w9: null },
];

/** Parse the export back into objects keyed by column name. */
function read(csv: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  return rows.map((cells) => Object.fromEntries(header!.map((name, i) => [name, cells[i] ?? ""])));
}

describe("formatTin", () => {
  it("writes SSNs and EINs the way forms show them", () => {
    expect(formatTin("ssn", "212456789")).toBe("212-45-6789");
    expect(formatTin("ein", "207654321")).toBe("20-7654321");
  });

  it("refuses anything that is not nine digits", () => {
    expect(() => formatTin("ssn", "21245678")).toThrow();
    expect(() => formatTin("ein", "20-7654321")).toThrow();
  });
});

describe("buildW9ExportCsv", () => {
  it("starts with a byte-order mark and one header row", () => {
    const csv = buildW9ExportCsv(vendors, 2026);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv.slice(1))[0]).toEqual(w9ExportHeader(2026));
    expect(w9ExportHeader(2026)).toContain("Paid in 2026");
  });

  it("writes a signed vendor with the full taxpayer ID and W-9 details", () => {
    const [row] = read(buildW9ExportCsv(vendors, 2026));
    expect(row).toMatchObject({
      Vendor: "Okafor Electric",
      Email: "okafor@example.com",
      "Paid in 2026": "12900",
      "1099 sort": "No 1099 likely",
      "W-9": "Received",
      "Name on W-9": "Okafor Electric Inc",
      "Tax classification": "C corporation",
      Address: "12 Elm St",
      "Address line 2": "Suite 4, Rear",
      City: "Portland",
      State: "ME",
      ZIP: "04101",
      "TIN type": "EIN",
      TIN: "20-7654321",
      "Backup withholding": "No",
      "Attorney or medical": "No",
      "Signed by": "Ada Okafor",
      "Signed on": "2026-11-22",
    });
  });

  it("leaves the W-9 columns empty for a vendor who has not signed", () => {
    const row = read(buildW9ExportCsv(vendors, 2026))[1]!;
    expect(row).toMatchObject({
      Vendor: "J. Castellano",
      Email: "",
      "Paid in 2026": "3200.5",
      "1099 sort": "W-9 needed",
      "W-9": "Missing",
      "Name on W-9": "",
      TIN: "",
      "Backup withholding": "",
    });
  });

  it("shows only the last four digits when the full ID is withheld", () => {
    const masked = [{ ...vendors[0]!, w9: { ...signed, tin: null } }];
    const csv = buildW9ExportCsv(masked, 2026);
    expect(read(csv)[0]!.TIN).toBe("**-***4321");
    expect(csv).not.toContain("207654321");
    expect(csv).not.toContain("20-7654321");
  });

  it("names the classification an LLC or an 'other' payee gave", () => {
    const llc = { ...vendors[0]!, w9: { ...signed, classification: "llc_p" as const } };
    const other = {
      ...vendors[0]!,
      w9: { ...signed, classification: "other" as const, otherClassification: "Tribal government" },
    };
    const rows = read(buildW9ExportCsv([llc, other], 2026));
    expect(rows[0]!["Tax classification"]).toBe("LLC taxed as partnership");
    expect(rows[1]!["Tax classification"]).toBe("Other: Tribal government");
  });

  it("flags backup withholding and attorney or medical payments", () => {
    const vendor = { ...vendors[0]!, legalOrMedical: true, w9: { ...signed, backupWithholding: true } };
    const [row] = read(buildW9ExportCsv([vendor], 2026));
    expect(row).toMatchObject({
      "Backup withholding": "Yes",
      "Attorney or medical": "Yes",
      "1099 sort": "1099 likely",
    });
  });

  it("keeps text a vendor typed from running as a spreadsheet formula", () => {
    const hostile = {
      ...vendors[0]!,
      name: "=HYPERLINK(\"http://evil.example\")",
      w9: { ...signed, legalName: "+1 (555) 010-0000", signedName: "@cmd" },
    };
    const csv = buildW9ExportCsv([hostile], 2026);
    const [row] = read(csv);
    expect(row?.Vendor?.startsWith("'=")).toBe(true);
    expect(row?.["Name on W-9"]?.startsWith("'+")).toBe(true);
    expect(row?.["Signed by"]?.startsWith("'@")).toBe(true);
  });

  it("writes only a header for a client with no vendors", () => {
    expect(parseCsv(buildW9ExportCsv([], 2026).slice(1))).toHaveLength(1);
  });
});

describe("w9ExportFileName", () => {
  it("builds a safe file name from the client's name", () => {
    expect(w9ExportFileName("Harbor Street Bakery", 2026, true)).toBe("harbor-street-bakery-2026-w9s.csv");
    expect(w9ExportFileName("Café \"Ñandú\" & Sons/..\\", 2026, false)).toBe("cafe-nandu-sons-2026-w9s-last4.csv");
    expect(w9ExportFileName("日本", 2026, true)).toBe("client-2026-w9s.csv");
  });
});

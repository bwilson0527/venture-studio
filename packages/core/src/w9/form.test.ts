import { describe, expect, it } from "vitest";
import { W9_CERTIFICATION, validateW9Form, type W9FormInput } from "./form";

const individual: W9FormInput = {
  legalName: "  Dana   Rivera ",
  classification: "individual",
  addressLine1: "12 Elm St",
  city: "Austin",
  state: "tx",
  postalCode: "78701",
  tinType: "ssn",
  tin: "212-45-6789",
  certify: "on",
  signedName: "Dana Rivera",
};

const llc: W9FormInput = {
  ...individual,
  legalName: "Rivera Design LLC",
  classification: "llc",
  llcClassification: "p",
  tinType: "ein",
  tin: "20-7654321",
};

function errorsOf(input: W9FormInput) {
  const result = validateW9Form(input);
  if (result.ok) throw new Error("expected the form to be refused");
  return result.errors;
}

describe("validateW9Form", () => {
  it("accepts an individual and tidies the answers", () => {
    const result = validateW9Form(individual);
    expect(result).toEqual({
      ok: true,
      warnings: {},
      value: {
        legalName: "Dana Rivera",
        businessName: null,
        taxClassification: "individual",
        otherClassification: null,
        hasForeignPartners: false,
        exemptPayeeCode: null,
        fatcaExemptionCode: null,
        addressLine1: "12 Elm St",
        addressLine2: null,
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        tinType: "ssn",
        tin: "212456789",
        tinLast4: "6789",
        backupWithholding: false,
        signedName: "Dana Rivera",
        certificationVersion: W9_CERTIFICATION.version,
      },
    });
  });

  it.each([
    ["c", "llc_c"],
    ["S", "llc_s"],
    ["p", "llc_p"],
  ])("maps an LLC taxed as %s to %s", (letter, expected) => {
    const result = validateW9Form({ ...llc, llcClassification: letter });
    expect(result.ok && result.value.taxClassification).toBe(expected);
  });

  it("asks how an LLC is taxed", () => {
    expect(errorsOf({ ...llc, llcClassification: "" })).toHaveProperty("llcClassification");
  });

  it("requires a description for the Other classification", () => {
    expect(errorsOf({ ...individual, classification: "other" })).toHaveProperty(
      "otherClassification",
    );
    const result = validateW9Form({
      ...individual,
      classification: "other",
      otherClassification: "Nonprofit corporation",
    });
    expect(result.ok && result.value.otherClassification).toBe("Nonprofit corporation");
  });

  it("refuses an unknown classification", () => {
    expect(errorsOf({ ...individual, classification: "llc_p" })).toHaveProperty("classification");
    expect(errorsOf({ ...individual, classification: undefined })).toHaveProperty("classification");
  });

  it("keeps line 3b only where the form allows it", () => {
    const partnership = validateW9Form({ ...llc, hasForeignPartners: "on" });
    expect(partnership.ok && partnership.value.hasForeignPartners).toBe(true);
    const person = validateW9Form({ ...individual, hasForeignPartners: "on" });
    expect(person.ok && person.value.hasForeignPartners).toBe(false);
  });

  it("requires an EIN from corporations, partnerships and LLCs taxed as one", () => {
    for (const classification of ["c_corp", "s_corp", "partnership"]) {
      expect(errorsOf({ ...individual, classification })).toHaveProperty("tinType");
    }
    expect(errorsOf({ ...llc, tinType: "ssn", tin: "212-45-6789" })).toHaveProperty("tinType");
  });

  it("lets a sole proprietor or a trust use either number", () => {
    expect(validateW9Form({ ...individual, tinType: "ein", tin: "20-7654321" }).ok).toBe(true);
    expect(validateW9Form({ ...individual, classification: "trust_estate" }).ok).toBe(true);
  });

  it("checks the taxpayer ID", () => {
    expect(errorsOf({ ...individual, tin: "" }).tin).toMatch(/enter/i);
    expect(errorsOf({ ...individual, tin: "123-45-6789" }).tin).toMatch(/placeholder/i);
    expect(errorsOf({ ...individual, tinType: "" })).toHaveProperty("tinType");
  });

  it("passes along a warning about an unusual EIN", () => {
    const result = validateW9Form({ ...llc, tin: "07-7654321" });
    expect(result.ok && result.warnings.tin).toMatch(/double-check/);
  });

  it("checks the address", () => {
    const errors = errorsOf({
      ...individual,
      addressLine1: " ",
      city: "",
      state: "ZZ",
      postalCode: "7870",
    });
    expect(Object.keys(errors).sort()).toEqual(["addressLine1", "city", "postalCode", "state"]);
    expect(validateW9Form({ ...individual, postalCode: "78701-1234", state: "PR" }).ok).toBe(true);
  });

  it("checks the exemption codes", () => {
    expect(errorsOf({ ...llc, exemptPayeeCode: "14" })).toHaveProperty("exemptPayeeCode");
    expect(errorsOf({ ...llc, exemptPayeeCode: "0" })).toHaveProperty("exemptPayeeCode");
    expect(errorsOf({ ...individual, exemptPayeeCode: "5" })).toHaveProperty("exemptPayeeCode");
    expect(errorsOf({ ...llc, fatcaCode: "N" })).toHaveProperty("fatcaCode");
    const result = validateW9Form({ ...llc, exemptPayeeCode: "5", fatcaCode: "m" });
    expect(result.ok && [result.value.exemptPayeeCode, result.value.fatcaExemptionCode]).toEqual([
      "5",
      "M",
    ]);
  });

  it("requires the certification and a signature", () => {
    expect(errorsOf({ ...individual, certify: undefined })).toHaveProperty("certify");
    expect(errorsOf({ ...individual, signedName: "  " })).toHaveProperty("signedName");
  });

  it("records a payee who is subject to backup withholding", () => {
    const result = validateW9Form({ ...individual, backupWithholding: "on" });
    expect(result.ok && result.value.backupWithholding).toBe(true);
  });

  it("refuses overlong answers", () => {
    expect(errorsOf({ ...individual, legalName: "x".repeat(201) })).toHaveProperty("legalName");
  });

  it("never returns the taxpayer ID in an error", () => {
    const errors = errorsOf({ ...individual, tin: "212-45-6789", city: "" });
    expect(JSON.stringify(errors)).not.toContain("6789");
  });
});

describe("W9_CERTIFICATION", () => {
  it("carries the four statements of the paper form, with item 2 as the one to strike", () => {
    expect(W9_CERTIFICATION.items).toHaveLength(4);
    expect(W9_CERTIFICATION.items[W9_CERTIFICATION.backupWithholdingItem]).toContain(
      "not subject to backup withholding",
    );
    expect(W9_CERTIFICATION.leadIn).toBe("Under penalties of perjury, I certify that:");
  });
});

import { describe, expect, it } from "vitest";
import { assessPayee, thresholdCents } from "./needs1099";

const base = { taxYear: 2026, amountPaidCents: 500_000 };

describe("thresholdCents", () => {
  it("is $600 through 2025 and $2,000 for 2026", () => {
    expect(thresholdCents(2025)).toEqual({ cents: 60_000, confirmed: true });
    expect(thresholdCents(2026)).toEqual({ cents: 200_000, confirmed: true });
  });

  it("marks later years as unconfirmed until entered", () => {
    expect(thresholdCents(2027).confirmed).toBe(false);
  });
});

describe("assessPayee", () => {
  it("is below threshold at $1,999.99 and over it at exactly $2,000", () => {
    expect(assessPayee({ ...base, amountPaidCents: 199_999, w9: null }).verdict).toBe(
      "below_threshold",
    );
    expect(assessPayee({ ...base, amountPaidCents: 200_000, w9: null }).verdict).toBe(
      "w9_missing",
    );
  });

  it("uses the $600 threshold for 2025", () => {
    expect(
      assessPayee({ taxYear: 2025, amountPaidCents: 60_000, w9: null }).verdict,
    ).toBe("w9_missing");
  });

  it.each(["individual", "partnership", "trust_estate", "llc_p"] as const)(
    "likely requires a form for %s",
    (classification) => {
      expect(assessPayee({ ...base, w9: { classification } }).verdict).toBe("likely_required");
    },
  );

  it.each(["c_corp", "s_corp", "llc_c", "llc_s"] as const)(
    "likely needs no form for %s",
    (classification) => {
      expect(assessPayee({ ...base, w9: { classification } }).verdict).toBe(
        "likely_not_required",
      );
    },
  );

  it("still requires a form for a corporation paid for legal or medical services", () => {
    expect(
      assessPayee({ ...base, w9: { classification: "c_corp" }, legalOrMedical: true }).verdict,
    ).toBe("likely_required");
  });

  it("sends exemption claims and 'Other' to review", () => {
    expect(
      assessPayee({ ...base, w9: { classification: "individual", exemptPayeeCode: "1" } }).verdict,
    ).toBe("review");
    expect(assessPayee({ ...base, w9: { classification: "other" } }).verdict).toBe("review");
  });

  it("asks for review when the year's threshold is not confirmed", () => {
    expect(
      assessPayee({ taxYear: 2027, amountPaidCents: 500_000, w9: null }).verdict,
    ).toBe("review");
  });

  it("below threshold wins even without a W-9", () => {
    expect(assessPayee({ ...base, amountPaidCents: 10_000, w9: null }).reason).toMatch(
      /less than \$2,000/,
    );
  });
});

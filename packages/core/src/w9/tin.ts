/**
 * Format checks for US taxpayer identification numbers as entered on a W-9.
 *
 * These catch typos and placeholder numbers. They do not confirm that a
 * number belongs to the named payee; only IRS TIN Matching does that.
 */

export type TinType = "ssn" | "ein";

export type TinCheck =
  | { ok: true; digits: string; formatted: string; last4: string; warning?: string }
  | { ok: false; error: string };

const PLACEHOLDERS = new Set(["123456789", "987654321", "078051120", "219099999"]);

/**
 * EIN prefixes the IRS has assigned to its campuses. A prefix outside this
 * list is unusual rather than impossible, so it produces a warning, not an
 * error.
 */
const EIN_PREFIXES = new Set(
  [
    [1, 6],
    [10, 16],
    [20, 27],
    [30, 48],
    [50, 68],
    [71, 77],
    [80, 88],
    [90, 95],
    [98, 99],
  ].flatMap(([from, to]) =>
    Array.from({ length: to! - from! + 1 }, (_, i) => String(from! + i).padStart(2, "0")),
  ),
);

function digitsOnly(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  return trimmed.replace(/\D/g, "");
}

function isRepeated(digits: string): boolean {
  return /^(\d)\1{8}$/.test(digits);
}

/** ITINs are issued in the 9xx range with these middle-digit groups. */
function isItin(digits: string): boolean {
  if (!digits.startsWith("9")) return false;
  const group = Number(digits.slice(3, 5));
  return (
    (group >= 50 && group <= 65) ||
    (group >= 70 && group <= 88) ||
    (group >= 90 && group <= 92) ||
    (group >= 94 && group <= 99)
  );
}

export function checkSsn(input: string): TinCheck {
  const digits = digitsOnly(input);
  if (digits === null) {
    return { ok: false, error: "Use digits only, like 123-45-6789." };
  }
  if (digits.length !== 9) {
    return { ok: false, error: "A Social Security number has 9 digits." };
  }
  if (isRepeated(digits) || PLACEHOLDERS.has(digits)) {
    return { ok: false, error: "That looks like a placeholder, not a real number." };
  }

  const area = digits.slice(0, 3);
  const group = digits.slice(3, 5);
  const serial = digits.slice(5);
  const formatted = `${area}-${group}-${serial}`;
  const result = { ok: true as const, digits, formatted, last4: serial };

  if (area.startsWith("9")) {
    // 9xx is never an SSN, but it is the range used for ITINs, which a W-9
    // accepts in the same box.
    return isItin(digits)
      ? result
      : { ok: false, error: "That is not a valid SSN or ITIN. Please check the number." };
  }
  if (area === "000" || area === "666" || group === "00" || serial === "0000") {
    return { ok: false, error: "That is not a valid Social Security number. Please check it." };
  }
  return result;
}

export function checkEin(input: string): TinCheck {
  const digits = digitsOnly(input);
  if (digits === null) {
    return { ok: false, error: "Use digits only, like 12-3456789." };
  }
  if (digits.length !== 9) {
    return { ok: false, error: "An EIN has 9 digits." };
  }
  if (isRepeated(digits) || PLACEHOLDERS.has(digits)) {
    return { ok: false, error: "That looks like a placeholder, not a real number." };
  }
  const prefix = digits.slice(0, 2);
  if (prefix === "00") {
    return { ok: false, error: "That is not a valid EIN. Please check the number." };
  }
  const result = {
    ok: true as const,
    digits,
    formatted: `${prefix}-${digits.slice(2)}`,
    last4: digits.slice(5),
  };
  return EIN_PREFIXES.has(prefix)
    ? result
    : { ...result, warning: `EINs rarely start with ${prefix}. Please double-check it.` };
}

export function checkTin(type: TinType, input: string): TinCheck {
  return type === "ssn" ? checkSsn(input) : checkEin(input);
}

/** What staff see by default: the last four digits only. */
export function maskTin(type: TinType, last4: string): string {
  return type === "ssn" ? `***-**-${last4}` : `**-***${last4}`;
}

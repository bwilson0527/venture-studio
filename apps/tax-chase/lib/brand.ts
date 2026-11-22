/** The product name in one place, so a rename is a one-line change. */
export const BRAND = {
  name: "FormStickler",
  tagline: "W-9s collected before 1099 season, without the chasing.",
} as const;

/**
 * Who stands behind the privacy policy and the terms. While `company` is
 * null both pages show as drafts and are hidden from search engines, so set
 * every value here before the first real deploy (see `ops/launch.md`).
 */
export const LEGAL: {
  /** The registered company that runs the product, for example "Example Co LLC". */
  company: string | null;
  /** The US state whose law governs the terms, for example "Ohio". */
  state: string | null;
  /** Where privacy and account requests go. */
  contactEmail: string | null;
  /** A postal address for the company. */
  postalAddress: string | null;
  /** The day these versions take effect, for example "December 1, 2026". */
  effective: string | null;
  /** How many days after paying a firm can ask for its money back. */
  refundDays: number;
} = {
  company: null,
  state: null,
  contactEmail: null,
  postalAddress: null,
  effective: null,
  refundDays: 14,
};

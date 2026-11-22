import { form1099Status, w9Status, type StatusLine } from "@studio/core/w9/vendor-status";

import type { Vendor } from "@/lib/firm-store";

/** What one row of the vendor board shows. Built on the server; holds no taxpayer ID. */
export type VendorView = {
  id: string;
  name: string;
  email: string;
  paid: string;
  /** The amount as the edit field shows it, for example "2450.00". */
  amountInput: string;
  legalOrMedical: boolean;
  onHold: boolean;
  hasW9: boolean;
  w9: StatusLine;
  form1099: StatusLine;
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function toVendorView(vendor: Vendor, taxYear: number, timeZone: string): VendorView {
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone });
  const day = (iso: string) => format.format(new Date(iso));
  return {
    id: vendor.id,
    name: vendor.name,
    email: vendor.email ?? "",
    paid: vendor.amountPaidCents === null ? "Not entered" : money(vendor.amountPaidCents),
    amountInput: vendor.amountPaidCents === null ? "" : (vendor.amountPaidCents / 100).toFixed(2),
    legalOrMedical: vendor.legalOrMedical,
    onHold: vendor.onHold,
    hasW9: vendor.w9 !== null,
    w9: w9Status(vendor, day),
    form1099: form1099Status(vendor, taxYear),
  };
}

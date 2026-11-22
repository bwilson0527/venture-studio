"use client";

import { useActionState, useState, useTransition } from "react";

import { removeVendor, saveVendor, showVendorLink } from "../../actions";
import { FormStatus } from "../../form-status";
import { errorText, inputClass, primaryButton, quietButton, toneClass } from "../../styles";
import type { VendorView } from "./vendor-view";

const COLUMNS = "md:grid md:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1.5fr)_minmax(0,1.5fr)_4rem] md:gap-4";

export function VendorBoard({
  businessId,
  taxYear,
  vendors,
}: {
  businessId: string;
  taxYear: number;
  vendors: VendorView[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div
        aria-hidden="true"
        className={`hidden border-b border-line px-5 py-2.5 text-xs font-medium text-muted ${COLUMNS}`}
      >
        <span>Vendor</span>
        <span className="text-right">Paid in {taxYear}</span>
        <span>W-9</span>
        <span>1099</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {vendors.map((vendor) => (
          <li key={vendor.id} className="px-5 py-3.5">
            <div className={`space-y-2 md:space-y-0 md:items-start ${COLUMNS}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{vendor.name}</p>
                <p className="truncate text-sm text-muted">{vendor.email || "No email address"}</p>
              </div>
              <p className="font-mono text-sm md:text-right">
                <span className="text-muted md:hidden">Paid in {taxYear}: </span>
                {vendor.paid}
              </p>
              <Status title="W-9" status={vendor.w9} />
              <Status title="1099" status={vendor.form1099} />
              <div className="md:text-right">
                <button
                  type="button"
                  aria-expanded={openId === vendor.id}
                  aria-controls={`edit-${vendor.id}`}
                  onClick={() => setOpenId(openId === vendor.id ? null : vendor.id)}
                  className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
                >
                  {openId === vendor.id ? "Close" : "Edit"}
                  <span className="sr-only"> {vendor.name}</span>
                </button>
              </div>
            </div>
            {openId === vendor.id ? (
              <div id={`edit-${vendor.id}`} className="mt-4 rounded-lg border border-line bg-background p-4">
                <EditVendor businessId={businessId} vendor={vendor} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Status({ title, status }: { title: string; status: VendorView["w9"] }) {
  return (
    <div className="min-w-0">
      <p>
        <span className="sr-only">{title}: </span>
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[status.tone]}`}>
          {status.label}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted">{status.detail}</p>
    </div>
  );
}

function EditVendor({ businessId, vendor }: { businessId: string; vendor: VendorView }) {
  const [saveState, saveAction, saving] = useActionState(saveVendor.bind(null, vendor.id), {
    status: "idle",
  });
  const [removeState, removeAction, removing] = useActionState(removeVendor.bind(null, vendor.id), {
    status: "idle",
  });

  return (
    <div className="space-y-5">
      <form action={saveAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Name
            <input name="name" required maxLength={200} defaultValue={vendor.name} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" defaultValue={vendor.email} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block text-sm font-medium">
            Amount paid
            <input name="amount" inputMode="decimal" defaultValue={vendor.amountInput} className={`mt-1 ${inputClass}`} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="legalOrMedical" defaultChecked={vendor.legalOrMedical} className="mt-1" />
          <span>
            Paid for attorney fees or medical services
            <span className="block text-xs text-muted">These are reportable even when paid to a corporation.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="onHold" defaultChecked={vendor.onHold} className="mt-1" />
          <span>
            On hold
            <span className="block text-xs text-muted">No requests or reminders are sent while this is ticked.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : "Save"}
          </button>
          <FormStatus state={saveState} />
        </div>
      </form>

      <div className="border-t border-line pt-4">
        <PrivateLink businessId={businessId} vendorId={vendor.id} />
      </div>

      <div className="border-t border-line pt-4">
        {vendor.hasW9 ? (
          <p className="text-sm text-muted">
            This vendor has signed a W-9, which has to be kept, so the vendor cannot be removed.
          </p>
        ) : (
          <form action={removeAction} className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={removing} className={`${quietButton} text-red-700 dark:text-red-400`}>
              {removing ? "Removing…" : "Remove vendor"}
            </button>
            <FormStatus state={removeState} />
          </form>
        )}
      </div>
    </div>
  );
}

/** The vendor's own W-9 address, shown on request so the firm can send it by text or their own email. */
function PrivateLink({ businessId, vendorId }: { businessId: string; vendorId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, startLoading] = useTransition();

  if (link) {
    return (
      <div>
        <label className="block text-sm font-medium">
          Private W-9 link
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className={`mt-1 font-mono text-sm ${inputClass}`}
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={quietButton}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            Copy link
          </button>
          <p role="status" className="text-xs text-muted">
            {copied ? "Copied. " : ""}Anyone with this link can fill in this vendor&apos;s W-9, so send it
            only to them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={loading}
        className={quietButton}
        onClick={() =>
          startLoading(async () => {
            const result = await showVendorLink(businessId, vendorId);
            setLink(result);
            setFailed(result === null);
          })
        }
      >
        {loading ? "Getting link…" : "Show private W-9 link"}
      </button>
      {failed ? (
        <p role="alert" className={errorText}>
          The link could not be shown. Please try again.
        </p>
      ) : (
        <p className="text-xs text-muted">To send the request yourself, by text or from your own email.</p>
      )}
    </div>
  );
}

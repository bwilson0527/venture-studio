"use client";

import Link from "next/link";
import { useActionState } from "react";

import { addVendor, sendRequests, uploadVendors, type ImportState } from "../../actions";
import { FormStatus } from "../../form-status";
import { errorText, inputClass, primaryButton, quietButton } from "../../styles";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function UploadVendors({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    uploadVendors.bind(null, businessId),
    { status: "idle" },
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm font-medium">
        Vendor list (CSV)
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3.5 file:py-2 file:text-sm file:font-medium"
        />
      </label>
      <p className="text-xs text-muted">
        Export &ldquo;payments by vendor&rdquo; from the client&apos;s bookkeeping. The file needs a
        vendor name column. Email and amount paid columns are used when present. Uploading an
        updated list later will not add anyone twice.
      </p>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Uploading…" : "Upload vendors"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className={errorText}>
          {state.message}
          {state.upgrade ? (
            <>
              {" "}
              <Link href="/dashboard/plan" className="font-medium underline">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm text-accent">
          {count(state.counts.added, "vendor", "vendors")} added, {state.counts.updated} updated,{" "}
          {state.counts.unchanged} already up to date.
        </p>
      ) : null}
      {state.status !== "idle" && state.issues.length > 0 ? (
        <div className="rounded-lg border border-line bg-background p-3 text-sm">
          <p className="font-medium">Rows to check</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {state.issues.map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                Line {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

export function AddVendor({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(addVendor.bind(null, businessId), {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Name
          <input name="name" required maxLength={200} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm font-medium">
          Email <span className="font-normal text-muted">(optional)</span>
          <input name="email" type="email" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm font-medium">
          Amount paid <span className="font-normal text-muted">(optional)</span>
          <input name="amount" inputMode="decimal" placeholder="2,450.00" className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={quietButton}>
          {pending ? "Adding…" : "Add vendor"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function SendRequests({ businessId, ready }: { businessId: string; ready: number }) {
  const [state, formAction, pending] = useActionState(sendRequests.bind(null, businessId), {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || ready === 0} className={primaryButton}>
          {pending
            ? "Sending…"
            : ready === 0
              ? "Send W-9 requests"
              : `Send W-9 requests to ${count(ready, "vendor", "vendors")}`}
        </button>
        <FormStatus state={state} />
      </div>
      <p className="text-xs text-muted">
        {ready === 0
          ? "Nobody is waiting to be asked. Vendors need an email address and must not be on hold."
          : "Each gets an email with a private link to the form, then polite reminders until it arrives."}
      </p>
    </form>
  );
}

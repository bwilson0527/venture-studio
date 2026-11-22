"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { CLIENT_COUNT_CHOICES } from "@studio/core/leads";

import { requestEarlyAccess } from "./actions";

const inputClass =
  "block w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none " +
  "focus:border-foreground focus:ring-2 focus:ring-foreground/15 aria-[invalid=true]:border-red-600";

export function EarlyAccessForm() {
  const [state, formAction, pending] = useActionState(requestEarlyAccess, { status: "idle" });
  const id = useId();
  const source = useRef<HTMLInputElement>(null);

  // Remember which campaign brought the visitor, without making the page
  // itself depend on the query string.
  useEffect(() => {
    const tag = new URLSearchParams(window.location.search).get("utm_source");
    if (tag && source.current) source.current.value = tag;
  }, []);

  if (state.status === "done") {
    return (
      <div role="status" className="rounded-lg border border-accent/40 bg-accent-soft p-5">
        <p className="font-semibold">You are on the list.</p>
        <p className="mt-1 text-sm text-muted">
          We will email you when your account is ready, ahead of January. Nothing else will be sent
          to this address.
        </p>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.errors : {};

  return (
    <form action={formAction} noValidate className="space-y-3">
      <div>
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">
          Work email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
          className={`mt-1 ${inputClass}`}
        />
        {errors.email ? (
          <p id={`${id}-email-error`} className="mt-1 text-sm text-red-700 dark:text-red-400">
            {errors.email}
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-firm`} className="block text-sm font-medium">
            Firm <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`${id}-firm`}
            name="firmName"
            autoComplete="organization"
            aria-invalid={Boolean(errors.firmName)}
            aria-describedby={errors.firmName ? `${id}-firm-error` : undefined}
            className={`mt-1 ${inputClass}`}
          />
          {errors.firmName ? (
            <p id={`${id}-firm-error`} className="mt-1 text-sm text-red-700 dark:text-red-400">
              {errors.firmName}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${id}-count`} className="block text-sm font-medium">
            Clients that issue 1099s <span className="font-normal text-muted">(optional)</span>
          </label>
          <select id={`${id}-count`} name="clientCount" defaultValue="" className={`mt-1 ${inputClass}`}>
            <option value="">Choose</option>
            {CLIENT_COUNT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Hidden from people; bots tend to fill every field. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input ref={source} type="hidden" name="source" />
      {state.status === "failed" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          That did not go through. Please try again in a moment.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-5 py-3 text-base font-semibold text-background hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding you…" : "Get early access"}
      </button>
      <p className="text-xs text-muted">
        Free for one client business. No card needed. We use your email only to tell you when your
        account is ready.
      </p>
    </form>
  );
}

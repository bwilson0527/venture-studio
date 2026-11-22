"use client";

import { useActionState } from "react";

import { startFirm } from "../actions";
import { FormStatus } from "../form-status";
import { inputClass, primaryButton } from "../styles";

export function StartForm() {
  const [state, formAction, pending] = useActionState(startFirm, { status: "idle" });
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="firm-name" className="block text-sm font-medium">
          Firm name
        </label>
        <input
          id="firm-name"
          name="name"
          required
          maxLength={200}
          autoComplete="organization"
          className={`mt-1 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-muted">
          Vendors see this name in the emails asking for their W-9.
        </p>
      </div>
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Setting up…" : "Continue"}
      </button>
    </form>
  );
}

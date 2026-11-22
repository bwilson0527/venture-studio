"use client";

import { useActionState } from "react";

import { addBusiness } from "./actions";
import { FormStatus } from "./form-status";
import { inputClass, primaryButton } from "./styles";

export function AddBusinessForm({ taxYears }: { taxYears: number[] }) {
  const [state, formAction, pending] = useActionState(addBusiness, { status: "idle" });
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <div>
          <label htmlFor="business-name" className="block text-sm font-medium">
            Client business
          </label>
          <input
            id="business-name"
            name="name"
            required
            maxLength={200}
            placeholder="Harbor Street Bakery"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="business-year" className="block text-sm font-medium">
            Payments made in
          </label>
          <select id="business-year" name="taxYear" defaultValue={taxYears[0]} className={`mt-1 ${inputClass}`}>
            {taxYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Adding…" : "Add client"}
        </button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

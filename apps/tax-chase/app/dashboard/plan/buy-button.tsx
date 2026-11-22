"use client";

import { useActionState } from "react";

import { buyPlan } from "../actions";
import { FormStatus } from "../form-status";
import { primaryButton } from "../styles";

/** Sends the owner to Stripe's payment page for one plan. */
export function BuyButton({ plan, label }: { plan: string; label: string }) {
  const [state, formAction, pending] = useActionState(buyPlan.bind(null, plan), { status: "idle" });
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={pending} className={`w-full ${primaryButton}`}>
        {pending ? "Opening the payment page…" : label}
      </button>
      <FormStatus state={state} />
    </form>
  );
}

"use client";

import { useActionState, useId } from "react";

import { signIn, type SignInState } from "./actions";

const inputClass =
  "block w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none " +
  "focus:border-foreground focus:ring-2 focus:ring-foreground/15 aria-[invalid=true]:border-red-600";
const primaryButton =
  "w-full rounded-md bg-foreground px-5 py-3 text-base font-semibold text-background hover:opacity-90 disabled:opacity-60";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {
    step: "email",
  });
  const id = useId();

  if (state.step === "code") {
    return (
      <form action={formAction} noValidate className="space-y-4">
        <input type="hidden" name="email" value={state.email} />
        <p role="status" className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm">
          {state.resent ? "We sent a new code to " : "We sent a code to "}
          <span className="font-semibold">{state.email}</span>. It can take a minute to arrive.
        </p>
        <div>
          <label htmlFor={`${id}-code`} className="block text-sm font-medium">
            Sign-in code
          </label>
          <input
            id={`${id}-code`}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? `${id}-error` : undefined}
            className={`mt-1 font-mono tracking-widest ${inputClass}`}
          />
          {state.error ? (
            <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {state.error}
            </p>
          ) : null}
        </div>
        <button type="submit" name="intent" value="verify" disabled={pending} className={primaryButton}>
          {pending ? "Checking…" : "Sign in"}
        </button>
        <div className="flex justify-between text-sm">
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            className="text-muted underline underline-offset-2 hover:text-foreground"
          >
            Send a new code
          </button>
          <button
            type="submit"
            name="intent"
            value="restart"
            disabled={pending}
            className="text-muted underline underline-offset-2 hover:text-foreground"
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">
          Work email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email ?? ""}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={`mt-1 ${inputClass}`}
        />
        {state.error ? (
          <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
            {state.error}
          </p>
        ) : null}
      </div>
      <button type="submit" name="intent" value="send" disabled={pending} className={primaryButton}>
        {pending ? "Sending…" : "Email me a sign-in code"}
      </button>
      <p className="text-xs text-muted">
        No password to remember. New here? The same step creates your account, free for one client
        business.
      </p>
    </form>
  );
}

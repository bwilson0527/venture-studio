"use client";

import { useActionState } from "react";

import type { StopState } from "./actions";

type Props = {
  action: () => Promise<StopState>;
  firmName: string;
  businessName: string;
  formPath: string;
  alreadyStopped: boolean;
};

export function StopForm({ action, firmName, businessName, formPath, alreadyStopped }: Props) {
  const [state, formAction, pending] = useActionState<StopState>(action, {
    status: alreadyStopped ? "done" : "idle",
  });

  if (state.status === "done") {
    return (
      <div role="status" className="mt-6 rounded-lg border border-line bg-surface p-5">
        <p className="font-semibold">Reminders are off.</p>
        <p className="mt-2 text-sm text-muted">
          We will not email you about this request again. {businessName} may still need your W-9,
          so {firmName} may contact you directly. Your{" "}
          <a href={formPath} className="underline">
            form link
          </a>{" "}
          keeps working if you would like to complete it.
        </p>
      </div>
    );
  }

  if (state.status === "gone") {
    return (
      <p role="status" className="mt-6 text-muted">
        This link is no longer valid, so there are no reminders to stop.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      {state.status === "failed" ? (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          That did not go through. Please try again.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-5 py-3 font-semibold text-background hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Stopping…" : "Stop reminder emails"}
      </button>
      <p className="mt-4 text-sm text-muted">
        Or{" "}
        <a href={formPath} className="underline">
          complete the form now
        </a>
        . It takes about two minutes and ends the reminders too.
      </p>
    </form>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { BRAND } from "@/lib/brand";
import { findPayeeByToken } from "@/lib/portal-store";

import { stopW9Reminders } from "./actions";
import { StopForm } from "./stop-form";

export const metadata: Metadata = {
  title: `Stop W-9 reminders | ${BRAND.name}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function StopPage({ params }: PageProps<"/w9/[token]/stop">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <p className="text-sm font-semibold tracking-tight">{BRAND.name}</p>
      <Suspense
        fallback={
          <div className="mt-8 text-sm text-muted">
            <p>Loading…</p>
            <noscript>This page needs JavaScript. Please turn it on, or try another browser.</noscript>
          </div>
        }
      >
        <Stop params={params} />
      </Suspense>
    </main>
  );
}

async function Stop({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payee = await findPayeeByToken(token);

  if (!payee) {
    return (
      <section className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">This link is not valid</h1>
        <p className="mt-3 text-muted">
          It may have been replaced by a newer one, so there are no reminders to stop here.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Stop reminders about your W-9?
      </h1>
      <p className="mt-3 text-muted">
        {payee.firmName} has been emailing{" "}
        <span className="font-medium text-foreground">{payee.payeeName}</span> on behalf of{" "}
        {payee.businessName}, which needs a Form W-9 for payments made in {payee.taxYear}.
      </p>
      <StopForm
        action={stopW9Reminders.bind(null, token)}
        firmName={payee.firmName}
        businessName={payee.businessName}
        formPath={`/w9/${token}`}
        alreadyStopped={payee.remindersStopped}
      />
    </section>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { BRAND } from "@/lib/brand";
import { findPayeeByToken } from "@/lib/portal-store";

import { submitW9 } from "./actions";
import { W9Form } from "./w9-form";

export const metadata: Metadata = {
  title: `Form W-9 request | ${BRAND.name}`,
  // The address is the payee's credential: keep it out of search engines and
  // out of the Referer header of anything this page links to.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function W9Page({ params }: PageProps<"/w9/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <p className="text-sm font-semibold tracking-tight">{BRAND.name}</p>
      <Suspense
        fallback={
          <div className="mt-8 text-sm text-neutral-500">
            <p>Loading your form…</p>
            <noscript>This form needs JavaScript. Please turn it on, or try another browser.</noscript>
          </div>
        }
      >
        <Request params={params} />
      </Suspense>
    </main>
  );
}

async function Request({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payee = await findPayeeByToken(token);

  if (!payee) {
    return (
      <section className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">This link is not valid</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          It may have been replaced by a newer one. Please ask the firm that sent it to you for a
          new link.
        </p>
      </section>
    );
  }

  return (
    <>
      <header className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {payee.businessName} needs your Form W-9
        </h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          {payee.firmName} prepares tax forms for {payee.businessName} and is collecting a W-9 from{" "}
          <span className="font-medium text-foreground">{payee.payeeName}</span> for payments made
          in {payee.taxYear}. It takes about two minutes, and there is nothing to print or scan.
        </p>
      </header>
      <W9Form
        action={submitW9.bind(null, token)}
        firmName={payee.firmName}
        businessName={payee.businessName}
        existing={payee.submitted}
      />
      <footer className="mt-12 border-t border-neutral-200 pt-5 text-xs text-neutral-500 dark:border-neutral-800">
        {BRAND.name} collects this form on behalf of {payee.firmName}. Your taxpayer ID is encrypted
        before it is stored and is shared only with {payee.firmName} and {payee.businessName}.
        Questions about why you received this request should go to them.
      </footer>
    </>
  );
}

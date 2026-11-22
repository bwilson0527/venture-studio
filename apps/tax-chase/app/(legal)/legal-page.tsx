import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND, LEGAL } from "@/lib/brand";

export type LegalSection = {
  heading: string;
  /** Paragraphs, and lists where an entry is an array. */
  body: (ReactNode | ReactNode[])[];
};

/** Values for the wording, with a visible gap wherever one is not set yet. */
export const legal = {
  company: LEGAL.company ?? "[company name]",
  state: LEGAL.state ?? "[state]",
  contactEmail: LEGAL.contactEmail ?? "[contact email]",
  postalAddress: LEGAL.postalAddress ?? "[postal address]",
  effective: LEGAL.effective ?? "[date]",
  refundDays: LEGAL.refundDays,
  isDraft:
    !LEGAL.company || !LEGAL.state || !LEGAL.contactEmail || !LEGAL.postalAddress || !LEGAL.effective,
};

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="flex-1">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-base font-semibold tracking-tight">
          {BRAND.name}
        </Link>
        <nav aria-label="Legal" className="flex items-center gap-5 text-sm">
          <Link href="/privacy" className="text-muted hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted hover:text-foreground">
            Terms
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pt-6 pb-16">
        {legal.isDraft ? (
          <p role="note" className="mb-8 rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">
            Draft. This page is not in effect yet and some details are still to be filled in.
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Effective {legal.effective}</p>
        <div className="mt-6 text-muted">{intro}</div>

        {sections.map((section, index) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight">
              {index + 1}. {section.heading}
            </h2>
            {section.body.map((block, at) =>
              Array.isArray(block) ? (
                <ul key={at} className="mt-3 list-disc space-y-2 pl-5 text-muted">
                  {block.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={at} className="mt-3 text-muted">
                  {block}
                </p>
              ),
            )}
          </section>
        ))}
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-3xl px-5 py-8 text-xs text-muted">
          {legal.company} · {legal.postalAddress} · {legal.contactEmail}
        </p>
      </footer>
    </div>
  );
}

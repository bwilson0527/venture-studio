import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { planName, seasonTaxYear } from "@studio/core/billing";

import { getFirm, listBusinesses, type BusinessSummary } from "@/lib/firm-store";
import { requireSession } from "@/lib/session";

import { AddBusinessForm } from "./add-business-form";
import { toneClass } from "./styles";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your clients…</p>}>
      <Overview />
    </Suspense>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The season being worked on now, then the one before it. */
function taxYearChoices(now: Date): number[] {
  const current = seasonTaxYear(now);
  return [current, current - 1];
}

async function Overview() {
  const session = await requireSession();
  const firm = await getFirm(session.db);
  if (!firm) redirect("/dashboard/start");

  const businesses = await listBusinesses(session.db);
  const canAdd = businesses.length < firm.businessLimit;

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{firm.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {businesses.length} of {plural(firm.businessLimit, "client business", "client businesses")} on
          your {planName(firm.plan)} plan
        </p>
      </header>

      {businesses.length === 0 ? (
        <section className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Add your first client business</h2>
          <p className="mt-1 max-w-2xl text-muted">
            A client business is a company you prepare 1099s for. Next you will upload the vendors
            it paid, and we will collect a W-9 from each one.
          </p>
          <div className="mt-5">
            <AddBusinessForm taxYears={taxYearChoices(new Date())} />
          </div>
        </section>
      ) : (
        <>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </ul>
          <section className="mt-10 rounded-xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Add a client business</h2>
            {canAdd ? (
              <div className="mt-4">
                <AddBusinessForm taxYears={taxYearChoices(new Date())} />
              </div>
            ) : (
              <p className="mt-1 text-muted">
                Your plan covers {plural(firm.businessLimit, "client business", "client businesses")}.{" "}
                {firm.plan === "firm" ? null : (
                  <Link href="/dashboard/plan" className="font-medium text-foreground underline">
                    See plans
                  </Link>
                )}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function BusinessCard({ business }: { business: BusinessSummary }) {
  const chips: { text: string; tone: keyof typeof toneClass }[] = [];
  if (business.waiting > 0) chips.push({ text: `${business.waiting} waiting`, tone: "wait" });
  if (business.notAsked > 0) chips.push({ text: `${business.notAsked} not asked`, tone: "skip" });
  if (business.missingEmail > 0) chips.push({ text: `${business.missingEmail} without email`, tone: "wait" });
  if (business.needsAttention > 0) {
    chips.push({ text: `${business.needsAttention} need attention`, tone: "wait" });
  }

  return (
    <li>
      <Link
        href={`/dashboard/clients/${business.id}`}
        className="block rounded-xl border border-line bg-surface p-5 hover:border-foreground"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate text-lg font-semibold">{business.name}</h2>
          <span className="shrink-0 font-mono text-xs text-muted">{business.taxYear}</span>
        </div>
        <p className="mt-2 text-sm">
          {business.vendors === 0 ? (
            <span className="text-muted">No vendors yet. Upload the list to begin.</span>
          ) : (
            <>
              <span className="font-mono font-semibold">
                {business.received} of {business.vendors}
              </span>{" "}
              W-9s in
            </>
          )}
        </p>
        {chips.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip.text}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[chip.tone]}`}
              >
                {chip.text}
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
    </li>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { formatUsd, PLANS, planName, priceCentsFor, seasonTaxYear, type PaidPlan } from "@studio/core/billing";

import { listPurchases } from "@/lib/billing";
import { serverEnv } from "@/lib/env";
import { getFirm, listBusinesses } from "@/lib/firm-store";
import { requireSession } from "@/lib/session";

import { BuyButton } from "./buy-button";

export default function PlanPage({ searchParams }: PageProps<"/dashboard/plan">) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plan</h1>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Loading…</p>}>
        <Plan searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PAID: PaidPlan[] = ["season", "firm"];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

async function Plan({ searchParams }: { searchParams: PageProps<"/dashboard/plan">["searchParams"] }) {
  const session = await requireSession();
  const firm = await getFirm(session.db);
  if (!firm) redirect("/dashboard/start");

  const [{ payment }, businesses, purchases] = await Promise.all([
    searchParams,
    listBusinesses(session.db),
    listPurchases(session),
  ]);
  const season = seasonTaxYear(new Date());
  const open = serverEnv.billingEnabled;
  const isOwner = firm.role === "owner";
  const paidDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: firm.timeZone });

  return (
    <>
      {payment === "paid" && firm.plan !== "free" ? (
        <p role="status" className="mt-6 rounded-lg bg-accent-soft px-4 py-3 text-sm font-medium text-accent">
          Payment received. Your firm is on the {planName(firm.plan)} plan.
        </p>
      ) : null}
      {payment === "pending" ? (
        <p role="status" className="mt-6 rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          We are still waiting for Stripe to confirm the payment. Your plan changes as soon as it
          does. Reload this page in a minute.
        </p>
      ) : null}

      <p className="mt-2 text-sm text-muted">
        {firm.name} is on the {planName(firm.plan)} plan:{" "}
        {plural(firm.businessLimit, "client business", "client businesses")}
        {firm.vendorsPerBusinessLimit === null
          ? ", with no limit on vendors"
          : `, up to ${firm.vendorsPerBusinessLimit} vendors each`}
        . {businesses.length} in use.
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        <li className="flex flex-col rounded-xl border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold text-muted">Free</h2>
          <p className="mt-2 font-mono text-3xl font-semibold">$0</p>
          <p className="mt-4 text-sm">1 client business, up to 10 vendors.</p>
          <p className="mt-1 text-sm text-muted">Run one real client through it before you pay anything.</p>
          {firm.plan === "free" ? <p className="mt-auto pt-5 text-sm font-medium">Your plan now</p> : null}
        </li>
        {PAID.map((plan) => {
          const price = priceCentsFor(plan, firm.plan);
          const fullPrice = PLANS[plan].priceCents;
          return (
            <li key={plan} className="flex flex-col rounded-xl border border-line bg-surface p-6">
              <h2 className="text-sm font-semibold text-muted">{PLANS[plan].name}</h2>
              <p className="mt-2">
                <span className="font-mono text-3xl font-semibold">{formatUsd(fullPrice)}</span>{" "}
                <span className="text-sm text-muted">one payment</span>
              </p>
              <p className="mt-4 text-sm">{PLANS[plan].summary}</p>
              <p className="mt-1 text-sm text-muted">
                Covers the {season} 1099 season. Requests, reminders and exports are all included.
              </p>
              <div className="mt-auto pt-5">
                {firm.plan === plan ? (
                  <p className="text-sm font-medium">Your plan now</p>
                ) : price === null ? (
                  <p className="text-sm text-muted">Included in your plan.</p>
                ) : !open ? (
                  <p className="text-sm text-muted">Paid plans open soon.</p>
                ) : !isOwner ? (
                  <p className="text-sm text-muted">Only your firm&apos;s owner can buy a plan.</p>
                ) : (
                  <BuyButton
                    plan={plan}
                    label={
                      price < fullPrice
                        ? `Move up for ${formatUsd(price)}`
                        : `Buy ${PLANS[plan].name} for ${formatUsd(price)}`
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-sm text-muted">
        Payment is taken by Stripe on its own page. We never see or store your card number.
        {firm.plan === "season" ? " Moving up to Firm costs only the difference." : ""} Buying a
        plan is covered by the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          terms
        </Link>
        .
      </p>

      {purchases.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Payments</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {purchases.map((purchase) => (
              <li
                key={`${purchase.purchasedAt}-${purchase.plan}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
              >
                <span>
                  {planName(purchase.plan)} plan, {purchase.taxYear} season
                </span>
                <span className="text-muted">
                  <span className="font-mono text-foreground">{formatUsd(purchase.amountCents)}</span> on{" "}
                  {paidDate.format(new Date(purchase.purchasedAt))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

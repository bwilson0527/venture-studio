import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { EarlyAccessForm } from "./early-access-form";

export const metadata: Metadata = {
  title: `${BRAND.name}: W-9s collected before 1099 season`,
  description:
    "For CPA and bookkeeping firms. FormStickler asks your clients' vendors for their W-9, reminds them until it arrives, and gives you a clean list for 1099 filing.",
};

const facts = [
  { figure: "Feb 1, 2027", text: "Form 1099-NEC is due for payments made in 2026." },
  { figure: "$2,000", text: "The reporting threshold for 2026 payments, up from $600." },
  { figure: "About 2 min", text: "For a vendor to complete and sign, on a phone." },
];

const steps = [
  {
    title: "List who got paid",
    text: "Add a client business and upload its vendor list from the accounting export. A name, an email and the amount paid is all each vendor needs.",
  },
  {
    title: "We ask, and keep asking",
    text: "Each vendor gets a private link to a Form W-9 they can complete and sign online. No account, nothing to print. Polite reminders go out on a schedule until the form arrives.",
  },
  {
    title: "File from a clean list",
    text: "See who has sent a W-9, who has not, and who is likely to need a 1099 under the 2026 rules. Export the list as a spreadsheet for the filing tool you already use.",
  },
];

const features = [
  {
    title: "E-signed W-9s, done properly",
    text: "The same fields and the same certification wording as the paper form, signed under penalties of perjury, with a time-stamped record of every signature.",
  },
  {
    title: "Taxpayer IDs kept locked",
    text: "Numbers are encrypted before they are stored. Your team sees the last four digits, and every signed form is kept so a copy can be produced.",
  },
  {
    title: "Typos caught at the door",
    text: "A number that cannot be a real SSN or EIN is refused while the vendor is still on the form, not discovered by you in late January.",
  },
  {
    title: "A 1099 worklist, with reasons",
    text: "Payments under the threshold, corporations, attorney fees and medical payments are sorted for you, each with the reason shown. You make the final call.",
  },
  {
    title: "One flat price for the season",
    text: "No per-form, per-request or per-vendor fees. Send as many requests and reminders as it takes.",
  },
  {
    title: "Works beside what you have",
    text: "There is no practice-management suite to move to. It does one job and hands the result to your existing filing process.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    unit: "",
    limit: "1 client business, up to 10 vendors",
    note: "Run one real client through it before you pay anything.",
  },
  {
    name: "Season",
    price: "$149",
    unit: "per season",
    limit: "Up to 25 client businesses",
    note: "No limit on vendors, requests or reminders.",
  },
  {
    name: "Firm",
    price: "$299",
    unit: "per season",
    limit: "Up to 100 client businesses",
    note: "No limit on vendors, requests or reminders.",
  },
];

const questions = [
  {
    q: "Is a W-9 signed online acceptable?",
    a: "Yes. The IRS lets a requester collect Form W-9 electronically when the system meets its conditions, including a signature made under penalties of perjury in the form's own words. Those conditions are set out in the IRS Instructions for the Requester of Form W-9, and FormStickler is built to them.",
  },
  {
    q: "Does it file the 1099s?",
    a: "No. It gets you to a complete, accurate list and exports it. You file with the tool you already use.",
  },
  {
    q: "Does it check taxpayer IDs against IRS records?",
    a: "Not yet. It checks that each number is validly formed, which catches typos and placeholders. Matching a name and number against IRS records is a separate IRS service, and you can still run your list through it.",
  },
  {
    q: "What does a vendor need?",
    a: "A phone or a computer and about two minutes. No account, no app, and nothing to print or scan.",
  },
  {
    q: "Who can see what vendors submit?",
    a: "Your firm only. Each firm's data is walled off from every other firm's, taxpayer IDs are encrypted, and vendors reach nothing but their own form.",
  },
  {
    q: "When can I start?",
    a: "Firms on the early-access list get accounts first, ahead of January. Leave your email and we will write when yours is ready.",
  },
];

const board = [
  { name: "Rivera Design LLC", paid: "$8,450", status: "Received", tone: "done", detail: "EIN ending 4321" },
  { name: "Okafor Electric", paid: "$12,900", status: "Received", tone: "done", detail: "EIN ending 0187" },
  { name: "J. Castellano", paid: "$3,200", status: "Reminded twice", tone: "wait", detail: "Next reminder Thursday" },
  { name: "Northside Hauling", paid: "$2,640", status: "Opened, not finished", tone: "wait", detail: "Next reminder Friday" },
  { name: "M. Petrov", paid: "$950", status: "Under threshold", tone: "skip", detail: "No 1099 expected" },
] as const;

const toneClass = {
  done: "bg-accent-soft text-accent",
  wait: "bg-warn-soft text-warn",
  skip: "bg-line/60 text-muted",
} as const;

function StatusBoard() {
  return (
    <figure className="rounded-xl border border-line bg-surface shadow-sm">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
        <span className="text-sm font-semibold">Harbor Street Bakery · 2026</span>
        <span className="font-mono text-xs text-muted">2 of 4 W-9s in</span>
      </figcaption>
      <ul className="divide-y divide-line">
        {board.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="truncate text-xs text-muted">
                <span className="font-mono">{row.paid}</span> paid · {row.detail}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[row.tone]}`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-2.5 text-xs text-muted">
        Sample data, to show what the dashboard tracks.
      </p>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <p className="text-base font-semibold tracking-tight">{BRAND.name}</p>
        <nav aria-label="Page" className="flex items-center gap-5 text-sm">
          <a href="#pricing" className="hidden text-muted hover:text-foreground sm:inline">
            Pricing
          </a>
          <a href="#questions" className="hidden text-muted hover:text-foreground sm:inline">
            Questions
          </a>
          <Link href="/sign-in" className="text-muted hover:text-foreground">
            Sign in
          </Link>
          <a
            href="#early-access"
            className="rounded-md border border-foreground px-3.5 py-1.5 font-medium hover:bg-foreground hover:text-background"
          >
            Get early access
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pt-16">
          <div>
            <p className="text-sm font-medium text-accent">
              For CPA and bookkeeping firms · 1099 season for tax year 2026
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Every W-9 in hand before January.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              {BRAND.name} asks your clients&apos; vendors for their W-9, keeps reminding them until
              it arrives, and gives you a clean list for 1099 filing. Vendors sign online in about
              two minutes. You stop chasing.
            </p>
            <div id="early-access" className="mt-8 max-w-xl scroll-mt-6">
              <EarlyAccessForm />
            </div>
          </div>
          <StatusBoard />
        </section>

        <section aria-label="Key dates and numbers" className="border-y border-line bg-surface">
          <dl className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.figure}>
                <dt className="font-mono text-2xl font-semibold tracking-tight">{fact.figure}</dt>
                <dd className="mt-1 text-sm text-muted">{fact.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <p className="font-mono text-sm text-accent">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Built for the part of 1099 season nobody enjoys
            </h2>
            <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title}>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-muted">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-6 border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Early-access pricing
            </h2>
            <p className="mt-2 max-w-2xl text-muted">
              One payment covers W-9 collection for tax year 2026. No per-form fees, no
              subscription.
            </p>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {plans.map((plan) => (
                <li key={plan.name} className="rounded-xl border border-line bg-background p-6">
                  <h3 className="text-sm font-semibold text-muted">{plan.name}</h3>
                  <p className="mt-3">
                    <span className="font-mono text-4xl font-semibold tracking-tight">
                      {plan.price}
                    </span>{" "}
                    <span className="text-sm text-muted">{plan.unit}</span>
                  </p>
                  <p className="mt-4 font-medium">{plan.limit}</p>
                  <p className="mt-1 text-sm text-muted">{plan.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="questions" className="scroll-mt-6 border-t border-line">
          <div className="mx-auto w-full max-w-3xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Questions</h2>
            <dl className="mt-8 space-y-7">
              {questions.map((item) => (
                <div key={item.q}>
                  <dt className="font-semibold">{item.q}</dt>
                  <dd className="mt-1.5 text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
            <a
              href="#early-access"
              className="mt-10 inline-block rounded-md bg-foreground px-5 py-3 font-semibold text-background hover:opacity-90"
            >
              Get early access
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-5 py-8 text-xs text-muted">
          {BRAND.name} collects and organizes W-9s. It is not a tax advisor and does not file
          returns; the decision about who receives a 1099 is yours.
        </p>
      </footer>
    </div>
  );
}

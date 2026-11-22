import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getFirm, listBusinesses, listVendors } from "@/lib/firm-store";
import { requireSession } from "@/lib/session";

import { AddVendor, SendRequests, UploadVendors } from "./add-vendors";
import { VendorBoard } from "./vendor-board";
import { toVendorView } from "./vendor-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function ClientPage({ params }: PageProps<"/dashboard/clients/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading vendors…</p>}>
      <Client params={params} />
    </Suspense>
  );
}

async function Client({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!UUID.test(id)) notFound();

  const firm = await getFirm(session.db);
  if (!firm) redirect("/dashboard/start");

  const [businesses, vendors] = await Promise.all([
    listBusinesses(session.db),
    listVendors(session.db, id),
  ]);
  // The database only lists the firm's own client businesses, so this is also the access check.
  const business = businesses.find((b) => b.id === id);
  if (!business) notFound();

  const views = vendors.map((vendor) => toVendorView(vendor, business.taxYear, firm.timeZone));
  const ready = vendors.filter((v) => v.status === "not_requested" && v.email && !v.onHold).length;
  const limit = firm.vendorsPerBusinessLimit;

  return (
    <>
      <p className="text-sm">
        <Link href="/dashboard" className="text-muted underline underline-offset-2 hover:text-foreground">
          Clients
        </Link>
      </p>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{business.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Payments made in {business.taxYear}
            {vendors.length > 0 ? (
              <>
                {" · "}
                <span className="font-mono">
                  {business.received} of {business.vendors}
                </span>{" "}
                W-9s in
              </>
            ) : null}
          </p>
        </div>
        {vendors.length > 0 ? <SendRequests businessId={id} ready={ready} /> : null}
      </header>

      {vendors.length > 0 ? (
        <section aria-label="Vendors" className="mt-6">
          <VendorBoard businessId={id} taxYear={business.taxYear} vendors={views} />
          <p className="mt-2 text-xs text-muted">
            The 1099 column is a first sort to work from, not tax advice. The decision about who
            receives a 1099 is yours.
          </p>
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 rounded-xl border border-line bg-surface p-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">
            {vendors.length === 0 ? "Upload this client's vendors" : "Upload more vendors"}
          </h2>
          {limit !== null ? (
            <p className="mt-1 text-sm text-muted">
              Your plan covers {limit} vendors per client business. {vendors.length} used.
            </p>
          ) : null}
          <div className="mt-4">
            <UploadVendors businessId={id} />
          </div>
        </div>
        <div className="border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <h2 className="text-lg font-semibold">Or add one by hand</h2>
          <div className="mt-4">
            <AddVendor businessId={id} />
          </div>
        </div>
      </section>
    </>
  );
}

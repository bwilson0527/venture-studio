import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getFirm } from "@/lib/firm-store";
import { requireSession } from "@/lib/session";

import { SettingsForm } from "./settings-form";

const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Firm settings</h1>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <Settings />
        </Suspense>
      </div>
    </div>
  );
}

async function Settings() {
  const session = await requireSession();
  const firm = await getFirm(session.db);
  if (!firm) redirect("/dashboard/start");

  if (firm.role !== "owner") {
    return (
      <dl className="space-y-4 rounded-xl border border-line bg-surface p-6 text-sm">
        <div>
          <dt className="text-muted">Firm name</dt>
          <dd className="font-medium">{firm.name}</dd>
        </div>
        <div>
          <dt className="text-muted">Reply-to address</dt>
          <dd className="font-medium">{firm.replyToEmail ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-muted">Signed in as</dt>
          <dd className="font-medium">{session.email ?? "Unknown"}</dd>
        </div>
        <p className="text-muted">Only the firm&apos;s owner can change these.</p>
      </dl>
    );
  }

  // Keep a zone set elsewhere selectable instead of silently changing it on save.
  const zones = TIME_ZONES.some((zone) => zone.value === firm.timeZone)
    ? TIME_ZONES
    : [...TIME_ZONES, { value: firm.timeZone, label: firm.timeZone }];

  return (
    <>
      <SettingsForm
        name={firm.name}
        replyToEmail={firm.replyToEmail ?? ""}
        timeZone={firm.timeZone}
        timeZones={zones}
      />
      <p className="mt-8 border-t border-line pt-5 text-sm text-muted">
        Signed in as {session.email ?? "unknown"} · {firm.plan} plan
      </p>
    </>
  );
}

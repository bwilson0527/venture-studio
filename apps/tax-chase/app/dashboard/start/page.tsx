import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getFirm } from "@/lib/firm-store";
import { requireSession } from "@/lib/session";

import { StartForm } from "./start-form";

export default function StartPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up your firm</h1>
      <p className="mt-2 text-muted">One detail and you are in. You can change it later.</p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <Start />
        </Suspense>
      </div>
    </div>
  );
}

async function Start() {
  const session = await requireSession();
  if (await getFirm(session.db)) redirect("/dashboard");
  return <StartForm />;
}

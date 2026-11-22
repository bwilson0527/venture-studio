import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { signOut } from "./actions";

export const metadata: Metadata = {
  title: `Dashboard | ${BRAND.name}`,
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            {BRAND.name}
          </Link>
          <nav aria-label="Dashboard" className="flex items-center gap-4 text-sm sm:gap-5">
            <Link href="/dashboard" className="text-muted hover:text-foreground">
              Clients
            </Link>
            <Link href="/dashboard/plan" className="text-muted hover:text-foreground">
              Plan
            </Link>
            <Link href="/dashboard/settings" className="text-muted hover:text-foreground">
              Settings
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-muted hover:text-foreground">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">{children}</main>
      <noscript>
        <p className="mx-auto w-full max-w-6xl px-5 pb-8 text-sm text-muted">
          The dashboard needs JavaScript. Please turn it on.
        </p>
      </noscript>
    </div>
  );
}

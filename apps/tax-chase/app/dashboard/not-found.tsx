import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-muted">
        This page does not exist, or it belongs to a firm you are not signed in to.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:border-foreground"
      >
        Back to your clients
      </Link>
    </div>
  );
}

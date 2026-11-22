import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">{BRAND.name}</h1>
      <p className="text-sm text-neutral-600">
        {BRAND.tagline} The landing page and the firm dashboard land in the
        next pull requests.
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: `Sign in | ${BRAND.name}`,
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12 sm:py-20">
      <Link href="/" className="text-base font-semibold tracking-tight">
        {BRAND.name}
      </Link>
      <h1 className="mt-10 text-2xl font-semibold tracking-tight sm:text-3xl">Sign in</h1>
      <p className="mt-2 text-muted">
        Enter your email and we will send you a code. That is all it takes.
      </p>
      <div className="mt-8">
        <SignInForm />
      </div>
      <noscript>
        <p className="mt-6 text-sm text-muted">Signing in needs JavaScript. Please turn it on.</p>
      </noscript>
    </main>
  );
}

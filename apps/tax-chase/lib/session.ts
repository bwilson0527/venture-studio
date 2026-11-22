import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { userClient } from "./supabase-user";

export type Session = {
  userId: string;
  email: string | null;
  /** Acts as this user. Row level security applies. */
  db: SupabaseClient;
};

/**
 * Who is signed in, checked against the auth server (not just read from the
 * cookie). Every page and action that touches firm data starts here.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // A session is only meaningful for a live request. Without this, Next may
  // try to prerender ahead of one, and the auth client reads the clock.
  await connection();
  const db = await userClient();
  const { data, error } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { userId, email, db };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

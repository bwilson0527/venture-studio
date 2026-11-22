import type { NextRequest } from "next/server";

import { stopReminders } from "@/lib/portal-store";

/**
 * One-click unsubscribe (RFC 8058). Mail apps POST here when a payee uses
 * their built-in "unsubscribe" button on a reminder. Only POST changes
 * anything, so a link scanner fetching the address cannot unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  try {
    await stopReminders(token);
  } catch (error) {
    console.error("One-click stop failed:", error instanceof Error ? error.message : "unknown error");
    return new Response(null, { status: 500 });
  }
  // The same answer for a known and an unknown link.
  return new Response(null, { status: 200 });
}

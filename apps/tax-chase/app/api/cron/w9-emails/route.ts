import { isCronRequest } from "@/lib/cron-auth";
import { runW9Emails } from "@/lib/w9-emails";

/** A run sends up to this many emails, paced, so it finishes well inside the limit below. */
const BATCH = 50;

export const maxDuration = 120;

/**
 * Called by the scheduler, about once an hour. Sends W-9 requests that
 * firms have asked for and reminders that have come due.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runW9Emails(new Date(), BATCH));
  } catch (error) {
    console.error("W-9 email run failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "run_failed" }, { status: 500 });
  }
}

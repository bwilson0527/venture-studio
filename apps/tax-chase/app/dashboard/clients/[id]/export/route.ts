import { buildExport } from "@/lib/export-store";
import { getSession } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Download a client business's vendors and W-9s as a CSV for 1099 filing.
 * `?tins=full` includes full taxpayer IDs; anything else gives the last four.
 */
export async function GET(request: Request, { params }: RouteContext<"/dashboard/clients/[id]/export">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Sign in to download this file.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found.", { status: 404 });

  const includeTins = new URL(request.url).searchParams.get("tins") === "full";

  let file: Awaited<ReturnType<typeof buildExport>>;
  try {
    file = await buildExport(session, id, includeTins);
  } catch (error) {
    console.error("Building an export failed:", error instanceof Error ? error.message : "unknown error");
    return new Response("The export could not be built. Please try again.", { status: 500 });
  }
  if (!file) return new Response("Not found.", { status: 404 });

  return new Response(file.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      // Taxpayer IDs: never keep a copy in any cache.
      "Cache-Control": "no-store",
    },
  });
}

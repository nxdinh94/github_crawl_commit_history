import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { repositories } from "@/db/schema";
import { parseGitHubUrl } from "@/lib/monitor";
import { errorMessage, jsonError, logError } from "@/lib/server";

export async function GET() {
  try {
    const rows = await getDb().select().from(repositories).orderBy(asc(repositories.owner), asc(repositories.name));
    return Response.json({ repositories: rows });
  } catch (error) { return jsonError(error, 500, "GET /api/repositories failed"); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { urls?: string | string[] };
    const rawValues = Array.isArray(payload.urls) ? payload.urls : (payload.urls || "").split(/\r?\n|,|;/);
    const values = [...new Set(rawValues.map((value) => value.trim()).filter(Boolean))];
    if (!values.length) { const error = new Error("Add at least one GitHub repository URL."); logError("POST /api/repositories rejected empty URL list", error); return Response.json({ error: error.message }, { status: 400 }); }
    const parsed = values.map(parseGitHubUrl);
    const invalid = parsed.findIndex((item) => !item);
    if (invalid >= 0) { const error = new Error(`Invalid public GitHub repository URL: ${values[invalid]}`); logError("POST /api/repositories rejected invalid URL", error); return Response.json({ error: error.message }, { status: 400 }); }
    const db = getDb();
    for (const repo of parsed) {
      if (!repo) continue;
      await db.insert(repositories).values({ id: `${repo.owner}-${repo.name}`.toLowerCase(), url: repo.url, owner: repo.owner, name: repo.name, active: true }).onConflictDoNothing({ target: repositories.url });
    }
    return Response.json({ ok: true });
  } catch (error) { logError("POST /api/repositories failed", error); return Response.json({ error: errorMessage(error) }, { status: 500 }); }
}

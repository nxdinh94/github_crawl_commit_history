import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rosterMembers } from "@/db/schema";
import { normalizeUsername } from "@/lib/monitor";
import { jsonError } from "@/lib/server";

export async function GET() {
  try { const rows = await getDb().select().from(rosterMembers).where(eq(rosterMembers.active, true)).orderBy(asc(rosterMembers.githubUsername)); return Response.json({ roster: rows }); }
  catch (error) { return jsonError(error); }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { usernames?: string[] };
    const usernames = [...new Set((payload.usernames ?? []).map((value) => normalizeUsername(value)).filter((value) => /^[a-z0-9-]+$/i.test(value)))];
    const db = getDb();
    await db.delete(rosterMembers);
    for (const githubUsername of usernames) await db.insert(rosterMembers).values({ id: `member-${githubUsername}`, githubUsername, active: true });
    return Response.json({ ok: true, count: usernames.length });
  } catch (error) { return jsonError(error); }
}

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { repositories } from "@/db/schema";
import { jsonError } from "@/lib/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await getDb().delete(repositories).where(eq(repositories.id, id)); return Response.json({ ok: true }); }
  catch (error) { return jsonError(error); }
}

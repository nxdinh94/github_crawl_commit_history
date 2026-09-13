import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorMessage, integrationStatus, jsonError, logError, readSettings } from "@/lib/server";

export async function GET() {
  try { return Response.json({ settings: await readSettings(), integrations: integrationStatus() }); }
  catch (error) { logError("GET /api/settings failed", error); return Response.json({ settings: { timezone: "Asia/Bangkok", shallowThreshold: 20, alertEmail: "", notificationsEnabled: true }, integrations: { ...integrationStatus(), database: false }, error: errorMessage(error) }); }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { timezone?: string; shallowThreshold?: number; alertEmail?: string; notificationsEnabled?: boolean };
    const timezone = payload.timezone?.trim() || "Asia/Bangkok";
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch (error) { logError("PUT /api/settings rejected invalid timezone", error); return Response.json({ error: "Choose a valid IANA timezone." }, { status: 400 }); }
    const shallowThreshold = Number(payload.shallowThreshold ?? 20);
    if (!Number.isFinite(shallowThreshold) || shallowThreshold < 0 || shallowThreshold > 10_000_000) { const error = new Error("Threshold must be a number from 0 to 10,000,000."); logError("PUT /api/settings rejected invalid threshold", error); return Response.json({ error: error.message }, { status: 400 }); }
    const alertEmail = (payload.alertEmail ?? "").trim();
    if (alertEmail && !/^\S+@\S+\.\S+$/.test(alertEmail)) { const error = new Error("Enter a valid alert email address."); logError("PUT /api/settings rejected invalid email", error); return Response.json({ error: error.message }, { status: 400 }); }
    const db = getDb();
    await db.insert(settings).values({ id: 1, timezone, shallowThreshold: Math.round(shallowThreshold), alertEmail, notificationsEnabled: payload.notificationsEnabled !== false }).onConflictDoUpdate({ target: settings.id, set: { timezone, shallowThreshold: Math.round(shallowThreshold), alertEmail, notificationsEnabled: payload.notificationsEnabled !== false, updatedAt: new Date().toISOString() } });
    return Response.json({ settings: await readSettings(), integrations: integrationStatus() });
  } catch (error) { return jsonError(error, 500, "PUT /api/settings failed"); }
}

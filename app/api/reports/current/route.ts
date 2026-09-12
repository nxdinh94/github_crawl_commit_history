import { errorMessage, getLatestReport, jsonError, readSettings, reportThreshold } from "@/lib/server";

export async function GET() {
  try { const report = await getLatestReport(); const configured = await readSettings(); return Response.json({ report: report ? reportThreshold(report, configured.shallowThreshold) : null }); }
  catch (error) { return jsonError(error); }
}

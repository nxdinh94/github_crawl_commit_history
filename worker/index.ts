import handler from "vinext/server/fetch-handler";
import { logError, runPreviousWeek } from "@/lib/server";

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    try {
      return await handler.fetch(request, env, ctx);
    } catch (error) {
      logError("Unhandled worker request error", error, { method: request.method, path: new URL(request.url).pathname });
      throw error;
    }
  },
  async scheduled(_controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(runPreviousWeek().catch((error) => {
      logError("Scheduled Commit Watch crawl failed", error);
      throw error;
    }));
  },
};

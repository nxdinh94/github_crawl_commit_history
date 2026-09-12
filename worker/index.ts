import handler from "vinext/server/fetch-handler";
import { runPreviousWeek } from "@/lib/server";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(runPreviousWeek().catch((error) => console.error("Scheduled Commit Watch crawl failed", error)));
  },
};

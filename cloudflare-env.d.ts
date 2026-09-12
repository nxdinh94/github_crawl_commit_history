declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GITHUB_TOKEN?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    ALERT_EMAIL_TO?: string;
    APP_BASE_URL?: string;
  }
}

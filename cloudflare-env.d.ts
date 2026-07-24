declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    APP_ADMIN_EMAILS?: string;
    SEED_DEMO_DATA?: string;
  }
}

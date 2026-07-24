declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: KVNamespace;
    APP_ADMIN_EMAILS?: string;
    APP_SESSION_SECRET?: string;
    SEED_DEMO_DATA?: string;
  }
}

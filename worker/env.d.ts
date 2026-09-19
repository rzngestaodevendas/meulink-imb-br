export interface CloudflareEnv {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  VITE_APP_ID: string;
  OAUTH_SERVER_URL: string;
  VITE_OAUTH_PORTAL_URL: string;
  OWNER_OPEN_ID: string;
  OWNER_NAME: string;
}

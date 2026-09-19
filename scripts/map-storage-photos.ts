import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { properties } from "../drizzle/schema";
import { readFileSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const mapping = new Map<string, string>();
for (const line of readFileSync("storage-upload.txt", "utf8").split("\n")) {
  const match = line.match(/\[SUCCESS\] .*\/([^/]+\.jpg) -> (\/manus-storage\/\S+)/);
  if (match) mapping.set(match[1], match[2]);
}
if (mapping.size === 0) throw new Error("No uploaded photos found");
const db = drizzle(databaseUrl);
const rows = await db.select().from(properties);
let updated = 0;
for (const row of rows) {
  const photos = JSON.parse(row.photos || "[]") as string[];
  const mapped = photos.map(photo => mapping.get(photo) || photo);
  if (JSON.stringify(mapped) !== JSON.stringify(photos)) {
    await db.update(properties).set({ photos: JSON.stringify(mapped) }).where(eq(properties.id, row.id));
    updated += 1;
  }
}
console.log(`mapped ${mapping.size} uploaded photos across ${updated} properties`);

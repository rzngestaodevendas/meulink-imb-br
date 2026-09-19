import { describe, expect, it } from "vitest";
import { auditActionSchema } from "./routers";

describe("auditActionSchema", () => {
  it("accepts critical property, link and team events", () => {
    expect(auditActionSchema.safeParse("property.updated").success).toBe(true);
    expect(auditActionSchema.safeParse("share_link.created").success).toBe(true);
    expect(auditActionSchema.safeParse("team.role_updated").success).toBe(true);
  });

  it("rejects unregistered actions", () => {
    expect(auditActionSchema.safeParse("user.password_read").success).toBe(false);
  });
});

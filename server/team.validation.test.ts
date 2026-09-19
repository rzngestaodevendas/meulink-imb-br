import { describe, expect, it } from "vitest";
import { inviteInput, teamRoleSchema } from "./routers";

describe("teamRoleSchema", () => {
  it("accepts the two supported organization roles", () => {
    expect(teamRoleSchema.safeParse("company_admin").success).toBe(true);
    expect(teamRoleSchema.safeParse("broker").success).toBe(true);
  });

  it("rejects unsupported roles", () => {
    expect(teamRoleSchema.safeParse("owner").success).toBe(false);
    expect(teamRoleSchema.safeParse("viewer").success).toBe(false);
  });
});

describe("inviteInput", () => {
  it("accepts a valid invitation", () => {
    expect(inviteInput.safeParse({ email: "corretor@empresa.com", role: "broker" }).success).toBe(true);
  });

  it("rejects malformed email addresses", () => {
    expect(inviteInput.safeParse({ email: "corretor-at-empresa", role: "broker" }).success).toBe(false);
  });
});

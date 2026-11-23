import { describe, expect, it } from "vitest";
import { devToolRefusal } from "./dev-only.js";

const url = (host: string) => `postgresql://levelup:levelup_dev_password@${host}:5432/levelup`;

describe("devToolRefusal", () => {
  it("allows a local database in development: this machine or the Compose service", () => {
    for (const host of ["localhost", "127.0.0.1", "db"]) {
      expect(devToolRefusal({ NODE_ENV: "development", DATABASE_URL: url(host) })).toBeNull();
    }
  });

  it("refuses a hosted database even when NODE_ENV says development", () => {
    for (const host of ["levelup.abc123.eu-west-1.rds.amazonaws.com", "10.0.0.5", "db.example.com", "localhost.example.com"]) {
      expect(devToolRefusal({ NODE_ENV: "development", DATABASE_URL: url(host) })).toMatch(`"${host}", not a local database`);
    }
  });

  it("refuses production, whatever the host", () => {
    expect(devToolRefusal({ NODE_ENV: "production", DATABASE_URL: url("localhost") })).toBe("Refused: NODE_ENV is production.");
  });
});

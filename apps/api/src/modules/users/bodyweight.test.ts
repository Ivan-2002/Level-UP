import request from "supertest";
import { describe, expect, it } from "vitest";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, signUpUser } from "../../test/helpers.js";

const today = () => new Date().toISOString().slice(0, 10);
const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("POST /bodyweight", () => {
  it("records today's bodyweight by default", async () => {
    const user = await signUpUser();

    const res = await request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg: 81.5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kg: 81.5, measuredOn: today() });
  });

  it("keeps one entry per day: recording the same day again replaces it", async () => {
    const user = await signUpUser();
    const record = (kg: number) =>
      request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg, measuredOn: "2026-11-01" });

    await record(80);
    await record(79.5);

    const entries = await prisma.bodyweightEntry.findMany({ where: { userId: user.userId } });
    expect(entries.map((e) => e.kg.toNumber())).toEqual([79.5]);
  });

  it("stamps when the server received the entry, and moves it when the date is entered again", async () => {
    // The XP bodyweight rule orders and times entries by this, so editing an old date
    // must count as a new entry, not keep its original time.
    const user = await signUpUser();
    const record = (kg: number) =>
      request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg, measuredOn: "2026-11-01" });
    const receivedAt = async () => (await prisma.bodyweightEntry.findFirstOrThrow({ where: { userId: user.userId } })).receivedAt.toISOString();

    setNow("2026-11-02T08:00:00Z");
    await record(80);
    expect(await receivedAt()).toBe("2026-11-02T08:00:00.000Z");

    setNow("2026-11-20T08:00:00Z");
    await record(70);
    expect(await receivedAt()).toBe("2026-11-20T08:00:00.000Z");
    setNow(null);
  });

  it("keeps every write as a receipt: re-entering a date replaces the entry but adds a receipt", async () => {
    // The XP bodyweight rule walks the receipts, so edits can't erase its history.
    const user = await signUpUser();
    const record = (kg: number) =>
      request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg, measuredOn: "2026-11-01" });

    setNow("2026-11-02T08:00:00Z");
    await record(80);
    setNow("2026-11-03T08:00:00Z");
    await record(70);
    setNow(null);

    const receipts = await prisma.bodyweightReceipt.findMany({ where: { userId: user.userId }, orderBy: { receivedAt: "asc" } });
    expect(receipts.map((r) => [r.kg.toNumber(), r.measuredOn.toISOString().slice(0, 10), r.receivedAt.toISOString()])).toEqual([
      [80, "2026-11-01", "2026-11-02T08:00:00.000Z"],
      [70, "2026-11-01", "2026-11-03T08:00:00.000Z"],
    ]);
    expect(await prisma.bodyweightEntry.count({ where: { userId: user.userId } })).toBe(1);
  });

  it("allows tomorrow (already today east of UTC) but not later", async () => {
    const user = await signUpUser();
    const record = (measuredOn: string) =>
      request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg: 80, measuredOn });

    expect((await record(daysFromToday(1))).status).toBe(200);
    const later = await record(daysFromToday(3));
    expect(later.status).toBe(400);
    expect(later.body.error).toBe("FutureDate");
  });

  it("validates the weight and the date format, and needs a session", async () => {
    const user = await signUpUser();

    const tooLight = await request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg: 10 });
    const badDate = await request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg: 80, measuredOn: "11/11/2026" });
    const anonymous = await request(app).post("/v1/bodyweight").send({ kg: 80 });

    expect([tooLight.status, badDate.status, anonymous.status]).toEqual([400, 400, 401]);
  });
});

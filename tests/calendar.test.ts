import { describe, expect, it } from "vitest";
import {
  gregorianEasterDate,
  localDateAt,
  resolveLiturgicalCalendar,
  timeWindowAt
} from "../src/calendar/liturgical.js";

describe("liturgical calendar context", () => {
  it("computes movable feasts and seasons for 2026", () => {
    expect(gregorianEasterDate(2026)).toBe("2026-04-05");

    const ashWednesday = resolveLiturgicalCalendar({
      now: new Date("2026-02-18T12:00:00Z"),
      timeZone: "UTC",
      tradition: "ecumenical"
    });
    expect(ashWednesday.season).toBe("lent");
    expect(ashWednesday.observanceIds).toContain("ash-wednesday");
    expect(ashWednesday.lectionaryRefs).toContain("MAT.6.3-6");

    const easter = resolveLiturgicalCalendar({
      now: new Date("2026-04-05T12:00:00Z"),
      timeZone: "UTC",
      tradition: "ecumenical"
    });
    expect(easter.season).toBe("easter");
    expect(easter.observanceIds).toContain("easter-day");
    expect(easter.lectionaryRefs).toContain("JHN.20.16-18");
  });

  it("uses the user's IANA timezone at civil-date boundaries", () => {
    const instant = new Date("2026-07-21T22:30:00Z");
    expect(localDateAt(instant, "UTC")).toBe("2026-07-21");
    expect(localDateAt(instant, "Europe/Paris")).toBe("2026-07-22");
    expect(timeWindowAt(instant, "Europe/Paris")).toBe("late-evening");

    const paris = resolveLiturgicalCalendar({
      now: instant,
      timeZone: "Europe/Paris",
      tradition: "ecumenical"
    });
    expect(paris.observanceIds).toContain("mary-magdalene");
    expect(paris.lectionaryRefs).toContain("JHN.20.16-18");
  });

  it("filters tradition-specific commemorations", () => {
    const now = new Date("2026-07-23T12:00:00Z");
    const ecumenical = resolveLiturgicalCalendar({
      now, timeZone: "UTC", tradition: "ecumenical"
    });
    const catholic = resolveLiturgicalCalendar({
      now, timeZone: "UTC", tradition: "catholic"
    });
    expect(ecumenical.observanceIds).not.toContain("bridget-of-sweden");
    expect(catholic.observanceIds).toContain("bridget-of-sweden");
    expect(catholic.lectionaryRefs).toContain("JHN.15.4-5");
  });
});

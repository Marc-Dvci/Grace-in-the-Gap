import {
  CalendarContextSchema,
  type CalendarContext,
  type Preferences,
  type WaitEvent
} from "../domain.js";

interface CalendarObservance {
  id: string;
  name: string;
  month: number;
  day: number;
  rank: "commemoration" | "festival" | "principal";
  traditions?: readonly Preferences["tradition"][];
  lectionaryRefs: readonly string[];
}

const FIXED_OBSERVANCES: readonly CalendarObservance[] = [
  {
    id: "epiphany",
    name: "The Epiphany of the Lord",
    month: 1,
    day: 6,
    rank: "principal",
    lectionaryRefs: ["MAT.2.10-11"]
  },
  {
    id: "presentation",
    name: "The Presentation of Christ",
    month: 2,
    day: 2,
    rank: "festival",
    lectionaryRefs: ["LUK.2.29-32"]
  },
  {
    id: "annunciation",
    name: "The Annunciation",
    month: 3,
    day: 25,
    rank: "festival",
    lectionaryRefs: ["LUK.1.30-33"]
  },
  {
    id: "nativity-john-baptist",
    name: "The Nativity of John the Baptist",
    month: 6,
    day: 24,
    rank: "festival",
    lectionaryRefs: ["LUK.1.76-79"]
  },
  {
    id: "peter-and-paul",
    name: "Peter and Paul, Apostles",
    month: 6,
    day: 29,
    rank: "festival",
    lectionaryRefs: ["MAT.16.15-18"]
  },
  {
    id: "mary-magdalene",
    name: "Mary Magdalene",
    month: 7,
    day: 22,
    rank: "festival",
    lectionaryRefs: ["JHN.20.16-18"]
  },
  {
    id: "bridget-of-sweden",
    name: "Bridget of Sweden",
    month: 7,
    day: 23,
    rank: "commemoration",
    traditions: ["catholic", "mainline"],
    lectionaryRefs: ["JHN.15.4-5"]
  },
  {
    id: "james-apostle",
    name: "James the Apostle",
    month: 7,
    day: 25,
    rank: "festival",
    lectionaryRefs: ["MAT.20.26-28"]
  },
  {
    id: "martha-mary-lazarus",
    name: "Martha, Mary and Lazarus",
    month: 7,
    day: 29,
    rank: "commemoration",
    traditions: ["catholic"],
    lectionaryRefs: ["JHN.11.25-27"]
  },
  {
    id: "transfiguration",
    name: "The Transfiguration of the Lord",
    month: 8,
    day: 6,
    rank: "festival",
    lectionaryRefs: ["LUK.9.34-36"]
  },
  {
    id: "assumption",
    name: "The Assumption of Mary",
    month: 8,
    day: 15,
    rank: "principal",
    traditions: ["catholic"],
    lectionaryRefs: ["LUK.1.46-49"]
  },
  {
    id: "holy-cross",
    name: "Holy Cross Day",
    month: 9,
    day: 14,
    rank: "festival",
    lectionaryRefs: ["JHN.3.16-17"]
  },
  {
    id: "all-saints",
    name: "All Saints' Day",
    month: 11,
    day: 1,
    rank: "principal",
    lectionaryRefs: ["MAT.5.8-10"]
  },
  {
    id: "all-souls",
    name: "Commemoration of the Faithful Departed",
    month: 11,
    day: 2,
    rank: "commemoration",
    traditions: ["catholic", "mainline"],
    lectionaryRefs: ["JHN.6.37-40"]
  },
  {
    id: "christmas",
    name: "Christmas Day",
    month: 12,
    day: 25,
    rank: "principal",
    lectionaryRefs: ["LUK.2.10-14"]
  },
  {
    id: "stephen",
    name: "Stephen, Deacon and Martyr",
    month: 12,
    day: 26,
    rank: "festival",
    lectionaryRefs: ["ACT.7.59-60"]
  },
  {
    id: "john-apostle",
    name: "John, Apostle and Evangelist",
    month: 12,
    day: 27,
    rank: "festival",
    lectionaryRefs: ["JHN.21.22-24"]
  }
];

const RANK_ORDER = {
  none: 0,
  commemoration: 1,
  festival: 2,
  principal: 3
} as const;

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function sundayOnOrAfter(year: number, month: number, day: number): string {
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = (7 - value.getUTCDay()) % 7;
  return addDays(isoDate(year, month, day), offset);
}

/** Gregorian computus, valid for the modern civil calendar used by the app. */
export function gregorianEasterDate(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

export function localDateAt(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year ?? "1970"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

export function timeWindowAt(date: Date, timeZone: string): WaitEvent["timeWindow"] {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const hour = Number.parseInt(hourPart ?? "12", 10);
  if (hour < 5 || hour >= 22) return "late-evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function seasonFor(localDate: string): CalendarContext["season"] {
  const year = Number.parseInt(localDate.slice(0, 4), 10);
  const easter = gregorianEasterDate(year);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const pentecost = addDays(easter, 49);
  const advent = sundayOnOrAfter(year, 11, 27);

  if (localDate >= advent && localDate < isoDate(year, 12, 25)) return "advent";
  if (localDate >= isoDate(year, 12, 25) || localDate <= isoDate(year, 1, 5)) return "christmas";
  if (localDate >= palmSunday && localDate < easter) return "holy-week";
  if (localDate >= ashWednesday && localDate < palmSunday) return "lent";
  if (localDate >= easter && localDate <= pentecost) return "easter";
  if (localDate >= isoDate(year, 1, 6) && localDate < ashWednesday) return "epiphany";
  return "ordinary";
}

function movableObservances(year: number): Array<Omit<CalendarObservance, "month" | "day"> & { date: string }> {
  const easter = gregorianEasterDate(year);
  return [
    {
      id: "ash-wednesday",
      name: "Ash Wednesday",
      date: addDays(easter, -46),
      rank: "principal",
      lectionaryRefs: ["MAT.6.3-6"]
    },
    {
      id: "palm-sunday",
      name: "Palm Sunday",
      date: addDays(easter, -7),
      rank: "principal",
      lectionaryRefs: ["MAT.21.8-11"]
    },
    {
      id: "maundy-thursday",
      name: "Maundy Thursday",
      date: addDays(easter, -3),
      rank: "principal",
      lectionaryRefs: ["JHN.13.12-15"]
    },
    {
      id: "good-friday",
      name: "Good Friday",
      date: addDays(easter, -2),
      rank: "principal",
      lectionaryRefs: ["JHN.19.28-30"]
    },
    {
      id: "easter-day",
      name: "Easter Day",
      date: easter,
      rank: "principal",
      lectionaryRefs: ["JHN.20.16-18"]
    },
    {
      id: "ascension",
      name: "The Ascension of the Lord",
      date: addDays(easter, 39),
      rank: "principal",
      lectionaryRefs: ["ACT.1.9-11"]
    },
    {
      id: "pentecost",
      name: "Pentecost",
      date: addDays(easter, 49),
      rank: "principal",
      lectionaryRefs: ["ACT.2.1-4"]
    },
    {
      id: "trinity-sunday",
      name: "Trinity Sunday",
      date: addDays(easter, 56),
      rank: "principal",
      traditions: ["catholic", "mainline"],
      lectionaryRefs: ["MAT.28.18-20"]
    }
  ];
}

export function resolveLiturgicalCalendar(options: {
  now: Date;
  timeZone: string;
  tradition: Preferences["tradition"];
}) {
  const localDate = localDateAt(options.now, options.timeZone);
  const year = Number.parseInt(localDate.slice(0, 4), 10);
  const month = Number.parseInt(localDate.slice(5, 7), 10);
  const day = Number.parseInt(localDate.slice(8, 10), 10);
  const fixed = FIXED_OBSERVANCES.filter((item) => {
    return item.month === month &&
      item.day === day &&
      (!item.traditions || item.traditions.includes(options.tradition));
  });
  const movable = movableObservances(year).filter((item) => {
    return item.date === localDate &&
      (!item.traditions || item.traditions.includes(options.tradition));
  });
  const observances = [...fixed, ...movable].sort((left, right) => {
    return RANK_ORDER[right.rank] - RANK_ORDER[left.rank];
  });
  const rank = observances[0]?.rank ?? "none";

  return CalendarContextSchema.parse({
    localDate,
    timeZone: options.timeZone,
    season: seasonFor(localDate),
    observanceIds: observances.map((item) => item.id),
    observanceNames: observances.map((item) => item.name),
    rank,
    lectionaryRefs: [...new Set(observances.flatMap((item) => item.lectionaryRefs))]
  });
}

// Spoken dates for date fields. Browsers only accept "2026-11-03" (and "2026-11-03T14:30" for date
// and time), so what voice types into a date field is read here first: "November 3", "Nov 3rd
// 2027", "the third of November", "11/3", "tomorrow", "Friday", "next Friday", "in two weeks",
// optionally "at 2 pm". A date without a year is the next one to come (a deadline is not in the
// past), and a weekday is the coming one ("next Friday" too: voice says the date it set).

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Lower case, no stray punctuation ("p.m." → "p m"), ordinals as digits ("twenty third" → "23",
// "3rd" → "3").
function tidy(text: string): string {
  return text
    .toLowerCase()
    .replace(/[,.](?!\d)/g, " ")
    .replace(/\b(twenty|thirty)[\s-]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/g, (_, t: string, o: string) => String((t === "twenty" ? 20 : 30) + ORDINALS[o]))
    .replace(/\b[a-z]+\b/g, (w) => (w in ORDINALS ? String(ORDINALS[w]) : w))
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// A real calendar date (no 31 November), or null.
function valid(y: number, m: number, d: number): Date | null {
  const t = new Date(y, m, d);
  return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d ? t : null;
}

const TIME = /\b(\d{1,2})(?::(\d{2}))? ?([ap]) ?m\b|\bat (\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2}):(\d{2})\b|\b(noon|midday|midnight)\b/;

// "2 pm", "2:30pm", "at 2", "14:00", "noon". "At 2" with no am or pm is in the afternoon (1 to 7).
function timeOf(s: string): string | null {
  const m = TIME.exec(s);
  if (!m) return null;
  if (m[8]) return m[8] === "midnight" ? "00:00" : "12:00";
  let h = +(m[1] ?? m[4] ?? m[6]);
  const min = +(m[2] ?? m[5] ?? m[7] ?? 0);
  if (m[3] === "p" && h < 12) h += 12;
  else if (m[3] === "a" && h === 12) h = 0;
  else if (m[4] && h >= 1 && h <= 7) h += 12;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

function dateOf(s: string, today: Date): Date | null {
  // A day and month without a year: this year's, or next year's once it has passed.
  const year = (y: string | undefined, m: number, d: number) => {
    if (y) return valid(+(y.length === 2 ? `20${y}` : y), m, d);
    const t = valid(today.getFullYear(), m, d);
    return t && t < today ? valid(today.getFullYear() + 1, m, d) : t;
  };
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  if (/\btoday\b/.test(s)) return today;
  if (/\bday after tomorrow\b/.test(s)) return addDays(today, 2);
  if (/\btomorrow\b/.test(s)) return addDays(today, 1);
  m = /\bin (\d+|[a-z]+) (day|week)s?\b/.exec(s);
  const n = m && (/^\d+$/.test(m[1]) ? +m[1] : COUNTS[m[1]]);
  if (m && n) return addDays(today, m[2] === "week" ? n * 7 : n);
  if (/\bnext week\b/.test(s)) return addDays(today, 7);
  m = new RegExp(`\\b(${DAYS.join("|")})\\b`).exec(s);
  if (m) return addDays(today, (DAYS.indexOf(m[1]) - today.getDay() + 7) % 7 || 7);
  const month = `(${MONTHS.map((x) => `${x.slice(0, 3)}(?:${x.slice(3)})?`).join("|")})`;
  const monthOf = (w: string) => MONTHS.findIndex((x) => x.startsWith(w.slice(0, 3)));
  m = new RegExp(`\\b${month} (\\d{1,2})(?: (\\d{4}))?\\b`).exec(s); // November 3 2026
  if (m) return year(m[3], monthOf(m[1]), +m[2]);
  m = new RegExp(`\\b(\\d{1,2}) (?:of )?${month}(?: (\\d{4}))?\\b`).exec(s); // 3 November, the 3 of November
  if (m) return year(m[3], monthOf(m[2]), +m[1]);
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/.exec(s); // 11/3, month first
  if (m) return year(m[3], +m[1] - 1, +m[2]);
  return null;
}

export const DATE_TYPES = new Set(["date", "datetime-local", "time"]);

// The value a "date", "datetime-local" or "time" field accepts for what was said, or null when it
// is not a date. A date and time with no time said gets 9:00.
export function spokenDateValue(text: string, type: string, now = new Date()): string | null {
  const s = tidy(text);
  if (type === "time") return timeOf(s);
  const exact = /^(\d{4}-\d{2}-\d{2})t(\d{2}:\d{2})/.exec(s);
  if (exact) return type === "date" ? exact[1] : `${exact[1]}T${exact[2]}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // The time is read separately, so "at 2" is never taken for the 2nd.
  const day = dateOf(s.replace(new RegExp(TIME.source, "g"), " "), today);
  if (!day) return null;
  return type === "date" ? isoDate(day) : `${isoDate(day)}T${timeOf(s) ?? "09:00"}`;
}

// How a field value is read back: "Tuesday, November 3" (and "at 2:00 PM").
export function sayDateValue(value: string): string {
  const [d, t] = value.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const date = new Date(y, mo - 1, da);
  const day = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  if (!t) return day;
  const [h, m] = t.split(":").map(Number);
  return `${day} at ${new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

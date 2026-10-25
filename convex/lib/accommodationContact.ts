// Finds the listing's own statement about requesting accommodations, and the email address it
// gives for requests, if any. The quote is a verbatim slice of the listing text.
// findAccommodationContact is read-time only. findAccommodationEmails classifies every address
// in the listing; its result is stored on the job (jobs.accommodationEmail) and rechecked when
// the listing text changes.
import type { Infer } from "convex/values";
import type { vAccommodationEmail } from "../schema";
import { verifyQuote } from "../ai/validators";

export interface AccommodationContact {
  quote: string;
  email?: string;
}

const MENTION = /accommodat/i;
const REQUEST = /request|need|require|contact|reach out|let us know|e-?mail|assist|support|ask/i;
// Never surface a sentence that says accommodations are not offered (interface rule A8).
const NEGATIVE = /\b(unable to|cannot|can't|not able to|do(es)? not|don't|doesn't|won't)\b/i;
// Spaces are allowed only around the spelled-out forms ("name [at] example [dot] com"); a bare
// "@" or "." with spaces is prose ("from @ example.com addresses"), not an address.
const EMAIL = /[A-Z0-9._%+-]+(?:@|\s*(?:\[at\]|\(at\))\s*)[A-Z0-9-]+(?:(?:\.|\s*(?:\[dot\]|\(dot\))\s*)[A-Z0-9-]+)*(?:\.|\s*(?:\[dot\]|\(dot\))\s*)[A-Z]{2,}/i;

function cleanEmail(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/\[at\]|\(at\)/gi, "@")
    .replace(/\[dot\]|\(dot\)/gi, ".")
    .replace(/\.$/, "")
    .toLowerCase();
}

// Sentences with their offsets, so the quote can be sliced from the original text.
function sentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  // A "." followed by a letter or digit (an address, a domain, "e.g") does not end a sentence.
  const re = /(?:[^\n.!?]|[.!?](?=[A-Za-z0-9]))+[.!?]*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0].trim()) {
      re.lastIndex++;
      continue;
    }
    const lead = m[0].length - m[0].trimStart().length;
    out.push({ start: m.index + lead, end: m.index + m[0].length, text: m[0].trim() });
  }
  return out;
}

export function findAccommodationContact(descriptionText: string): AccommodationContact | null {
  if (!descriptionText || !MENTION.test(descriptionText)) return null;
  const s = sentences(descriptionText);
  let fallback: AccommodationContact | null = null;
  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    if (!MENTION.test(cur.text) || !REQUEST.test(cur.text) || NEGATIVE.test(cur.text)) continue;
    // The address is usually in the same sentence or the next one or two.
    for (let j = i; j < Math.min(s.length, i + 3); j++) {
      if (j > i && NEGATIVE.test(s[j].text)) break;
      const m = s[j].text.match(EMAIL);
      if (m) {
        const quote = descriptionText.slice(cur.start, s[j].end).trim().slice(0, 500);
        return { quote, email: cleanEmail(m[0]) };
      }
    }
    fallback ??= { quote: cur.text.slice(0, 400) };
  }
  return fallback;
}

// ---------- Accommodation request emails ----------
// Each address in the listing is judged by the listing's own words around it:
// - verified: its sentence asks people to request accommodations (or disability-related help)
//   and gives the address, or a bare "Email x." follows straight after such a sentence;
// - unverified: it sits near accommodation wording, under general application-help wording, or
//   in a mailbox named for accommodations/accessibility, without an explicit purpose;
// - anything else (recruiting, privacy, fraud, support addresses) is not an accommodation email.
// Addresses are never guessed from a domain and nothing is ever sent to them.

export const ACCOMMODATION_EMAIL_METHOD = "listing-rules-v1";
export type AccommodationEmailResult = Infer<typeof vAccommodationEmail>;
export type AccommodationEmailEntry = AccommodationEmailResult["emails"][number];

const ACCOMMODATION_WORDS = /accommodat|reasonable adjustment|disabilit/i;
const LODGING = /\b(housing|lodging|hotel|travel|relocation)\s+accommodat/i;
const WEAK_WORDS = /\bassist(ance)?\b|accessib|\bhelp with (your|the|an?) application/i;
const MAILBOX_HINT = /accommodat|accessib|disabilit/i;
// Wording that gives an address another purpose.
const OTHER_PURPOSE =
  /privacy|personal (data|information)|data protection|gdpr|ccpa|fraud|scam|phishing|security|press|media|investor|unsubscribe|customer|billing|sales|partnership|feedback|technical (issue|support)|general (question|inquir)|questions about (the|this) (role|position|job)/i;
const EMAIL_ALL = new RegExp(EMAIL.source, "gi");
const VALID_EMAIL = /^(?!.*\.\.)[a-z0-9_%+-](?:[a-z0-9._%+-]{0,62}[a-z0-9_%+-])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const MAX_EVIDENCE = 3;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && VALID_EMAIL.test(email);
}

const asksForAccommodation = (s: string) => ACCOMMODATION_WORDS.test(s) && !LODGING.test(s) && REQUEST.test(s) && !NEGATIVE.test(s);
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;

export function findAccommodationEmails(text: string): AccommodationEmailEntry[] {
  if (!text) return [];
  const s = sentences(text);
  const found = new Map<string, AccommodationEmailEntry>();
  const add = (email: string, status: AccommodationEmailEntry["status"], quote: string) => {
    const prev = found.get(email);
    if (!prev) return found.set(email, { email, status, evidence: [quote] });
    // One entry per address; the strongest evidence first.
    if (status === "verified" && prev.status !== "verified") {
      prev.status = "verified";
      prev.evidence.unshift(quote);
    } else prev.evidence.push(quote);
    prev.evidence = [...new Set(prev.evidence)].slice(0, MAX_EVIDENCE);
  };

  for (let j = 0; j < s.length; j++) {
    const cur = s[j];
    const hits = [...cur.text.matchAll(EMAIL_ALL)];
    if (!hits.length) continue;
    const rest = cur.text.replace(EMAIL_ALL, " ");
    const otherPurpose = OTHER_PURPOSE.test(rest);
    // An earlier sentence carries over only if it asks for accommodations, gives no address of its
    // own, and nothing between it and this address gives the address another purpose.
    const carries = (i: number) =>
      i >= 0 && asksForAccommodation(s[i].text) && !EMAIL.test(s[i].text) && s.slice(i + 1, j + 1).every((x) => !OTHER_PURPOSE.test(x.text.replace(EMAIL_ALL, " ")) && !NEGATIVE.test(x.text));
    const prev = carries(j - 1) ? s[j - 1] : null;
    const near = carries(j - 2);
    for (const m of hits) {
      const email = cleanEmail(m[0]);
      if (!isValidEmail(email)) continue; // malformed: never shown, never verified
      if (asksForAccommodation(cur.text)) {
        add(email, otherPurpose ? "unverified" : "verified", cur.text);
      } else if (prev) {
        // "Email x." straight after the request sentence; anything longer is only nearby.
        add(email, wordCount(rest) <= 8 ? "verified" : "unverified", text.slice(prev.start, cur.end).trim());
      } else if (!otherPurpose && !NEGATIVE.test(cur.text) && (near || WEAK_WORDS.test(rest) || MAILBOX_HINT.test(email.split("@")[0]))) {
        add(email, "unverified", cur.text);
      }
    }
  }
  return [...found.values()];
}

// The stored result for a listing. Evidence that is not word for word in the listing is dropped,
// and an address with no evidence left is dropped with it. A detector error is "failed", never a
// checkmark.
export function checkAccommodationEmails(
  descriptionText: string,
  contentHash: string,
  now: number,
  detect: (text: string) => AccommodationEmailEntry[] = findAccommodationEmails,
): AccommodationEmailResult {
  const base = { source: "listing" as const, method: ACCOMMODATION_EMAIL_METHOD, checkedAt: now, contentHash };
  try {
    const emails = detect(descriptionText)
      .map((e) => ({ ...e, evidence: e.evidence.filter((q) => verifyQuote(q, descriptionText)) }))
      .filter((e) => e.evidence.length > 0);
    const status = emails.some((e) => e.status === "verified") ? "verified" : emails.length ? "unverified" : "not_found";
    return { ...base, status, emails };
  } catch {
    return { ...base, status: "failed", emails: [] };
  }
}

// True when the stored result was checked against this exact listing text by this detector.
export function accommodationEmailIsCurrent(job: { contentHash: string; accommodationEmail?: AccommodationEmailResult }): boolean {
  const s = job.accommodationEmail;
  return !!s && s.contentHash === job.contentHash && s.method === ACCOMMODATION_EMAIL_METHOD && s.status !== "failed";
}

// The stored result when current; otherwise a fresh check (older rows, a failed check, or a new detector).
export function currentAccommodationEmail(
  job: { descriptionText: string; contentHash: string; accommodationEmail?: AccommodationEmailResult },
  now = Date.now(),
): AccommodationEmailResult {
  return accommodationEmailIsCurrent(job) ? job.accommodationEmail! : checkAccommodationEmails(job.descriptionText, job.contentHash, now);
}

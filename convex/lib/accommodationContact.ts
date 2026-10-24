// Finds the listing's own statement about requesting accommodations, and the email address it
// gives for requests, if any. The quote is a verbatim slice of the listing text.
// Read-time only: computed from descriptionText, so it needs no stored field or re-scrape.

export interface AccommodationContact {
  quote: string;
  email?: string;
}

const MENTION = /accommodat/i;
const REQUEST = /request|need|require|contact|reach out|let us know|e-?mail|assist|support|ask/i;
// Never surface a sentence that says accommodations are not offered (interface rule A8).
const NEGATIVE = /\b(unable to|cannot|can't|not able to|do(es)? not|don't|doesn't|won't)\b/i;
const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\))\s*[A-Z0-9-]+(?:\s*(?:\.|\[dot\]|\(dot\))\s*[A-Z0-9-]+)*\s*(?:\.|\[dot\]|\(dot\))\s*[A-Z]{2,}/i;

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

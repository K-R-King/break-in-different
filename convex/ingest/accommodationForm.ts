// Finds a link to the employer's own accommodation request form in listing HTML.
// A match needs both: the link's paragraph talks about accommodations, and the link is a form
// (a known form host, or link text / path that says form or request). Email addresses, policy
// pages and unrelated links in the same paragraph do not count.
import { decodeEntities, htmlToText } from "../lib/text";

export interface AccommodationForm {
  url: string;
  quote: string; // the sentence around the link, verbatim from the listing text
}

const FORM_HOSTS = /(^|\.)(forms\.gle|forms\.office\.com|forms\.microsoft\.com|typeform\.com|jotform\.com|surveymonkey\.com|formstack\.com|cognitoforms\.com|wufoo\.com|tally\.so|share\.hsforms\.com|app\.smartsheet\.com|airtable\.com)$/i;
const ACCOMMODATION = /accommodat|adjustments?\b|disabilit/i;
const FORM_WORDS = /\bform\b|request (an? |for )?(reasonable )?(accommodation|adjustment)|accommodation request|submit (a |your )?request/i;
const BLOCK_START = /<(p|li|div|h[1-6]|td|section|br)\b[^>]*>/gi;
const BLOCK_END = /<\/(p|li|div|h[1-6]|td|section)>|<br\b[^>]*>/i;

// Some listings wrap links in a redirect (Google, Outlook safe links); keep the real target.
function unwrapRedirect(href: URL): URL {
  const google = /(^|\.)google\.[a-z.]+$/i.test(href.hostname) && href.pathname === "/url";
  const outlook = /\.safelinks\.protection\.outlook\.com$/i.test(href.hostname);
  const target = google ? (href.searchParams.get("q") ?? href.searchParams.get("url")) : outlook ? href.searchParams.get("url") : null;
  if (!target) return href;
  try {
    return new URL(target);
  } catch {
    return href;
  }
}

function isForm(href: URL, linkText: string): boolean {
  if (FORM_HOSTS.test(href.hostname)) return true;
  if (href.hostname === "docs.google.com" && href.pathname.startsWith("/forms/")) return true;
  if (FORM_WORDS.test(linkText)) return true;
  return /accommodat|adjustment/i.test(href.pathname) && /form|request/i.test(href.pathname);
}

// The sentence that contains the link text, so the quote stays short and checkable.
function sentenceAround(block: string, linkText: string): string {
  const sentences = block.split(/(?<=[.!?])\s+/);
  const hit = linkText ? sentences.find((s) => s.includes(linkText)) : undefined;
  return (hit ?? block).slice(0, 300).trim();
}

export function findAccommodationForm(rawHtml: string): AccommodationForm | null {
  if (!rawHtml) return null;
  const html = decodeEntities(rawHtml); // Greenhouse sends escaped HTML
  const anchor = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = anchor.exec(html); m; m = anchor.exec(html)) {
    let href: URL;
    try {
      href = unwrapRedirect(new URL(decodeEntities(m[1]).trim()));
    } catch {
      continue;
    }
    if (href.protocol !== "https:" && href.protocol !== "http:") continue;
    const linkText = htmlToText(m[2]).replace(/\s+/g, " ").trim();

    // The enclosing paragraph or list item.
    let start = 0;
    for (const b of html.slice(0, m.index).matchAll(BLOCK_START)) start = b.index ?? 0;
    const after = html.slice(m.index + m[0].length);
    const end = after.search(BLOCK_END);
    const blockHtml = html.slice(start, m.index + m[0].length + (end < 0 ? Math.min(after.length, 400) : end));
    const block = htmlToText(blockHtml).replace(/\s+/g, " ").trim();

    if (!ACCOMMODATION.test(block) && !ACCOMMODATION.test(linkText) && !ACCOMMODATION.test(href.pathname)) continue;
    if (!isForm(href, linkText)) continue;
    return { url: href.toString(), quote: sentenceAround(block, linkText) };
  }
  return null;
}

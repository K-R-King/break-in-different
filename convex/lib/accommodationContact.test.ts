// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findAccommodationContact } from "./accommodationContact";
import { verifyQuote } from "../ai/validators";

// Shapes taken from seeded listings (2026-10-24), shortened.
const COINBASE = "• Accommodations: If you are an individual with a disability who needs a reasonable accommodation, email us your request and contact info at accommodations[at]coinbase.com.";
const FIGMA = "We are an equal opportunity workplace.\nWe are committed to providing reasonable accommodations throughout the hiring process. Please contact accommodations-ext@figma.com to request one.";
const TWO_SENTENCES = "Airbnb is committed to working with the broadest talent pool possible. If you need a reasonable accommodation, please let us know. Email reasonableaccommodations@airbnb.com.\n\nBenefits follow.";
const NO_EMAIL = "Candidates who need an accommodation during the interview process should let their recruiter know.";

describe("accommodation contact", () => {
  it.each([
    ["an obfuscated address", COINBASE, "accommodations@coinbase.com"],
    ["an address in the same sentence", FIGMA, "accommodations-ext@figma.com"],
    ["an address in the next sentence", TWO_SENTENCES, "reasonableaccommodations@airbnb.com"],
  ])("finds %s, with a verbatim quote", (_label, text, email) => {
    const c = findAccommodationContact(text);
    expect(c?.email).toBe(email);
    expect(verifyQuote(c?.quote, text)).toBe(true);
  });

  it("keeps the statement when there is no address", () => {
    const c = findAccommodationContact(NO_EMAIL);
    expect(c).toEqual({ quote: NO_EMAIL });
  });

  it("ignores listings that only mention accommodations in passing or negatively", () => {
    expect(findAccommodationContact("Housing accommodations nearby.")).toBeNull();
    expect(findAccommodationContact("We cannot accommodate requests for remote work, contact hr@example.com.")).toBeNull();
    expect(findAccommodationContact("Great team and great snacks.")).toBeNull();
  });
});

import { checkAccommodationEmails, currentAccommodationEmail, findAccommodationEmails, isValidEmail, ACCOMMODATION_EMAIL_METHOD } from "./accommodationContact";

const byEmail = (text: string) => Object.fromEntries(findAccommodationEmails(text).map((e) => [e.email, e.status]));

describe("accommodation emails", () => {
  it.each([
    ["For accommodation requests, contact accommodations@example.com.", "accommodations@example.com"],
    ["If you require an accommodation during the application process, email recruiting-accessibility@example.com.", "recruiting-accessibility@example.com"],
    ["To request an accommodation, please reach out to accessibility@example.com.", "accessibility@example.com"],
    ["Applicants who need assistance or accommodations may contact hr@example.com.", "hr@example.com"],
    ["For disability-related application assistance, contact our recruiting team at recruiting@example.com.", "recruiting@example.com"],
    ["IF YOU REQUIRE ACCOMMODATION, PLEASE REACH OUT TO Accommodations-Ext@Figma.com .", "accommodations-ext@figma.com"],
    [COINBASE, "accommodations@coinbase.com"],
    [TWO_SENTENCES, "reasonableaccommodations@airbnb.com"],
  ])("verifies an address the listing ties to accommodation requests: %s", (text, email) => {
    const r = checkAccommodationEmails(text, "h", 1);
    expect(r.status).toBe("verified");
    expect(r.emails).toEqual([{ email, status: "verified", evidence: [expect.any(String)] }]);
    expect(verifyQuote(r.emails[0].evidence[0], text)).toBe(true); // evidence is the listing's own words
    expect(r.emails[0].evidence[0].toLowerCase()).toContain(email.split("@")[0].toLowerCase().slice(0, 10));
  });

  it("does not treat an unrelated address as an accommodation email", () => {
    for (const text of [
      "Questions about the role? Email jobs@example.com.",
      "Read our privacy notice or write to privacy@example.com.",
      "Beware of recruitment fraud; report scams to security@example.com.",
      "Great team and great snacks. Say hi at hello@example.com.",
      "Housing accommodations are available; contact relocation@example.com.",
    ]) {
      expect(checkAccommodationEmails(text, "h", 1)).toMatchObject({ status: "not_found", emails: [] });
    }
  });

  it("picks the accommodation address over a generic recruiting address, in either order", () => {
    const a = "Questions about the role? Email recruiting@example.com. For accommodation requests, contact accommodations@example.com.";
    const b = "For accommodation requests, contact accommodations@example.com. Questions about the role? Email recruiting@example.com.";
    expect(byEmail(a)).toEqual({ "accommodations@example.com": "verified" });
    expect(byEmail(b)).toEqual({ "accommodations@example.com": "verified" });
  });

  it("does not carry an accommodation sentence over to a following address with another purpose", () => {
    const text = "If you need an accommodation, please let us know. For general questions, email info@example.com.";
    expect(byEmail(text)).toEqual({});
  });

  it("marks weaker wording as detected but unverified, never verified", () => {
    expect(byEmail("If you need assistance with your application, email talent@example.com.")).toEqual({ "talent@example.com": "unverified" });
    expect(byEmail("Questions? accessibility@example.com")).toEqual({ "accessibility@example.com": "unverified" });
    expect(byEmail("For privacy or accommodation questions, contact legal@example.com.")).toEqual({ "legal@example.com": "unverified" });
    const r = checkAccommodationEmails("If you need assistance with your application, email talent@example.com.", "h", 1);
    expect(r.status).toBe("unverified");
  });

  it("never builds an address out of prose around a bare @", () => {
    // From a seeded Airbnb listing, which used to yield "from@airbnb.com".
    const text =
      "If you need assistance, or an accommodation, please let your recruiter know once you are contacted about a role.\n\nOur recruiters correspond only from @ airbnb.com or @ ext.airbnb.com email addresses.";
    expect(findAccommodationEmails(text)).toEqual([]);
    expect(findAccommodationContact(text)?.email).toBeUndefined();
    expect(byEmail("For accommodation requests, email access [at] example [dot] com.")).toEqual({ "access@example.com": "verified" });
  });

  it("never verifies an address in a negative sentence", () => {
    expect(byEmail("We cannot accommodate requests for remote work, contact hr@example.com.")).toEqual({});
  });

  it("deduplicates repeated addresses and keeps each one's evidence", () => {
    const text =
      "To request an accommodation, email accommodations@example.com. Disability-related assistance is also available at ACCOMMODATIONS@example.com. " +
      "If you require an adjustment or accommodation in the interview, contact interview-access@example.com.";
    const r = checkAccommodationEmails(text, "h", 1);
    expect(r.emails.map((e) => e.email)).toEqual(["accommodations@example.com", "interview-access@example.com"]);
    expect(r.emails[0].evidence).toHaveLength(2);
    expect(r.emails[1].evidence).toHaveLength(1);
    for (const e of r.emails) for (const q of e.evidence) expect(verifyQuote(q, text)).toBe(true);
  });

  it("rejects malformed addresses instead of verifying them", () => {
    for (const bad of ["accommodations.@example.com", "accommodations@-example.com", "a..b@example.com", "accommodations@example.c0m"]) {
      expect(isValidEmail(bad)).toBe(false);
      expect(checkAccommodationEmails(`For accommodation requests, contact ${bad} today.`, "h", 1).emails.map((e) => e.email)).not.toContain(bad);
    }
    expect(checkAccommodationEmails("For accommodation requests, contact accommodations@example today.", "h", 1).status).toBe("not_found");
    expect(isValidEmail("accommodations-ext@figma.com")).toBe(true);
  });

  it("finds nothing in a listing with no accommodation information", () => {
    expect(checkAccommodationEmails("Build APIs in TypeScript. Great benefits.", "h", 1)).toMatchObject({ status: "not_found", emails: [] });
    expect(checkAccommodationEmails("", "h", 1).status).toBe("not_found");
  });

  it("reports a failed check without a checkmark, and a later check recovers the listing's address", () => {
    const text = "For accommodation requests, contact accommodations@example.com.";
    const failed = checkAccommodationEmails(text, "h", 1, () => {
      throw new Error("boom");
    });
    expect(failed).toMatchObject({ status: "failed", emails: [] });
    // A stored failure is not trusted: the next read checks the listing again.
    const again = currentAccommodationEmail({ descriptionText: text, contentHash: "h", accommodationEmail: failed }, 2);
    expect(again.status).toBe("verified");
    expect(again.emails[0].email).toBe("accommodations@example.com");
  });

  it("drops evidence that is not word for word in the listing", () => {
    const text = "For accommodation requests, contact accommodations@example.com.";
    const r = checkAccommodationEmails(text, "h", 1, () => [{ email: "accommodations@example.com", status: "verified", evidence: ["Something the listing never said."] }]);
    expect(r).toMatchObject({ status: "not_found", emails: [] });
  });

  it("uses the stored result only while the listing text is unchanged", () => {
    const old = "For accommodation requests, contact old-access@example.com.";
    const stored = checkAccommodationEmails(old, "hash-1", 1);
    const same = currentAccommodationEmail({ descriptionText: old, contentHash: "hash-1", accommodationEmail: stored }, 5);
    expect(same).toBe(stored);
    const changed = "For accommodation requests, contact new-access@example.com.";
    const fresh = currentAccommodationEmail({ descriptionText: changed, contentHash: "hash-2", accommodationEmail: stored }, 5);
    expect(fresh).toMatchObject({ contentHash: "hash-2", checkedAt: 5, method: ACCOMMODATION_EMAIL_METHOD });
    expect(fresh.emails.map((e) => e.email)).toEqual(["new-access@example.com"]);
    const stale = currentAccommodationEmail({ descriptionText: old, contentHash: "hash-1", accommodationEmail: { ...stored, method: "listing-rules-v0" } }, 9);
    expect(stale.checkedAt).toBe(9);
  });
});

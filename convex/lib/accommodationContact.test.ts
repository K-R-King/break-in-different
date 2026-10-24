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

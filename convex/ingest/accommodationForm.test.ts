// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findAccommodationForm } from "./accommodationForm";
import { htmlToText } from "../lib/text";
import { verifyQuote } from "../ai/validators";

// Shapes taken from real listings (2026-10-24), shortened.
const PINTEREST = `&lt;p&gt;Our Commitment to Inclusion: Pinterest is an equal opportunity employer. If you require an accommodation during the job application or interview process, please complete &lt;a href="https://forms.gle/sS24D4WboEKUZMQK6"&gt;this form&lt;/a&gt; for support.&lt;/p&gt;`;
const FIGMA = `<p>We are committed to providing reasonable accommodations. Please contact <a href="mailto:accommodations-ext@figma.com">accommodations-ext@figma.com</a>.</p>`;
const GITLAB = `<p>Read our <a href="https://about.gitlab.com/handbook/people-policies/inc-usa/#reasonable-accommodation">accommodation</a> policy.</p>`;
const DOORDASH = `<p>If you need an accommodation, learn more <a href="https://careers.doordash.com/">here</a>.</p>`;
const COINBASE = `<p>For accessibility, install a <a href="https://chromewebstore.google.com/detail/screen-reader/kgej">screen reader</a>.</p>`;

describe("accommodation form detection", () => {
  it("finds a form link in an accommodation paragraph, with a verbatim quote", () => {
    const f = findAccommodationForm(PINTEREST);
    expect(f?.url).toBe("https://forms.gle/sS24D4WboEKUZMQK6");
    expect(f?.quote).toContain("please complete this form");
    expect(verifyQuote(f?.quote, htmlToText(PINTEREST))).toBe(true);
  });

  it("finds a request page on the employer's site by its link text", () => {
    const html = `<ul><li>Need an adjustment? <a href="https://jobs.example.com/accessibility">Request an accommodation</a> at any stage.</li></ul>`;
    expect(findAccommodationForm(html)?.url).toBe("https://jobs.example.com/accessibility");
  });

  it("unwraps a Google redirect around the form link", () => {
    const html = `<p>Need an accommodation? <a href="https://www.google.com/url?q=https%3A%2F%2Frobinhood.hracuity.net%2Fwebform%2Findex%2Fabc&amp;sa=D">Applicant Accommodation Form</a></p>`;
    expect(findAccommodationForm(html)?.url).toBe("https://robinhood.hracuity.net/webform/index/abc");
  });

  it.each([
    ["an email address", FIGMA],
    ["a policy page", GITLAB],
    ["a careers home page", DOORDASH],
    ["an unrelated accessibility tool", COINBASE],
    ["a form about something else", `<p>Join our talent community: <a href="https://forms.gle/abc">this form</a>.</p>`],
    ["no links", "<p>We provide reasonable accommodations.</p>"],
  ])("ignores %s", (_label, html) => expect(findAccommodationForm(html)).toBeNull());
});

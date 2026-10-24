import { expect, test } from "@playwright/test";
import { buildSamProfile, signUp } from "../helpers";

test("Sam completes the loop: settings → sign up → profile → jobs → email → apply → tracker", async ({ page, context }) => {
  const started = Date.now();
  await page.goto("/");
  // A4: preferences before login apply instantly
  await page.getByRole("button", { name: "Accessibility settings" }).click();
  await page.getByRole("radio", { name: "Atkinson Hyperlegible" }).check();
  await page.getByLabel("Text size").fill("1.5");
  await expect(page.locator("html")).toHaveAttribute("data-font", "atkinson");
  await page.getByRole("button", { name: "Done" }).click();

  await signUp(page); // A1
  await buildSamProfile(page); // A2 (text path), A3
  await page.getByRole("button", { name: "Save and find jobs" }).click();

  // A5: ranked results with score, factors, source, link and checked time
  await expect(page).toHaveURL(/\/jobs$/);
  const cards = page.getByRole("list", { name: "Job matches" }).getByRole("article");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  const first = cards.first();
  await expect(first.getByRole("img", { name: /Match score \d+ out of 100/ })).toBeVisible();
  await expect(first.getByRole("list", { name: "Score factors" })).toBeVisible();
  await expect(first.getByText(/Source: .* checked/)).toBeVisible();
  await expect(first.getByRole("link", { name: /original listing/ })).toBeVisible();

  // Stated quote and Not mentioned wording (A7 display, A8)
  const detail = page.locator("#detail");
  await expect(detail.getByText(/Listing says: "/).first()).toBeVisible();
  // Open a job whose listing says nothing about accommodations
  await page.getByRole("link", { name: "Frontend Engineer, Platform", exact: true }).click();
  await expect(page.locator("#detail-heading")).toHaveText("Frontend Engineer, Platform");
  await expect(detail.getByText("Not mentioned in this listing. This does not mean it is unavailable.").first()).toBeVisible();

  // A9: explicit on-site conflict shows the quote and −25
  await expect(page.getByText("Conflict −25").first()).toBeVisible();
  await expect(page.getByText(/on-site five days a week/).first()).toBeVisible();

  // Apply opens the email step prefilled (C2)
  // The DEMO Full Stack Developer posting (jobs with an employer accommodation form are listed first).
  const fullStack = cards.filter({ has: page.getByRole("heading", { name: "Full Stack Developer", exact: true }) }).first();
  await fullStack.getByRole("link", { name: /^Apply/ }).click();
  await expect(page).toHaveURL(/\/email$/);
  const body = page.getByLabel("Message");
  await expect(body).toHaveValue(/Remote work options/, { timeout: 30_000 });
  await expect(body).toHaveValue(/Sam Rivera/);
  await expect(body).not.toHaveValue(/\[Your name\]/);
  // A10: disclosure off → only chosen accommodations, no condition; Copy disabled until Approve
  await expect(body).not.toHaveValue(/dyslexia|disability|diagnos/i);
  await expect(page.getByText("No condition or diagnosis")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy email" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByRole("button", { name: "Copy email" })).toBeEnabled();
  // Editing after approval resets approval
  await body.fill(`${await body.inputValue()}\nThanks again.`);
  await expect(page.getByRole("button", { name: "Copy email" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByRole("button", { name: "Copy email" })).toBeEnabled();

  // A12: Apply opens the employer page in a new tab; Mark as applied creates the tracker row
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: /Open application page/ }).click()]);
  await popup.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  const row = page.getByRole("row", { name: /Full Stack Developer/ });
  await expect(row.getByRole("combobox")).toHaveValue("applied");
  await expect(row.getByRole("link", { name: /Approved draft/ })).toBeVisible();

  expect(Date.now() - started).toBeLessThan(90_000);
});

test("A11: disclosure on with one condition names only that condition", async ({ page }) => {
  await signUp(page);
  await buildSamProfile(page);
  await page.getByRole("button", { name: "Save and find jobs" }).click();
  await page.getByRole("list", { name: "Job matches" }).getByRole("article").first().getByRole("link", { name: /^Apply/ }).click();
  await expect(page.getByLabel("Message")).toHaveValue(/Remote/, { timeout: 30_000 });
  await page.getByRole("radio", { name: "Yes" }).check();
  await page.getByRole("checkbox", { name: "Dyslexia", exact: true }).check();
  await page.getByRole("button", { name: "Write a new draft" }).click();
  await expect(page.getByLabel("Message")).toHaveValue(/I have Dyslexia\./, { timeout: 30_000 });
  const text = await page.getByLabel("Message").inputValue();
  for (const other of ["ADHD", "Autism", "Low vision", "Blindness", "Arthritis"]) expect(text).not.toContain(other);
});

test("A1/A3: bad input shows inline errors; profile needs a role and a skill", async ({ page }) => {
  await page.goto("/account?tab=signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.").first()).toBeVisible();
  await expect(page.getByText(/Password needs 8 or more characters/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/account/);

  await signUp(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Add at least one skill.").first()).toBeVisible();
  await expect(page.getByText("Add at least one role.").first()).toBeVisible();
});

test("A4: preferences persist across reload and devices (new browser context)", async ({ page, browser }) => {
  const email = await signUp(page);
  await page.getByRole("button", { name: "Accessibility settings" }).click();
  await page.getByRole("radio", { name: "OpenDyslexic" }).check();
  await page.getByLabel("Text size").fill("1.5");
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(800); // debounce to server
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font", "opendyslexic");

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/account?tab=login");
  await p2.getByLabel("Email").fill(email);
  await p2.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await p2.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(p2.locator("html")).toHaveAttribute("data-font", "opendyslexic", { timeout: 15_000 });
  await expect(p2.locator("html")).toHaveCSS("--text-scale", "1.5");
  await other.close();
});

test("A15: delete all my data removes everything and shows counts", async ({ page }) => {
  await signUp(page);
  await buildSamProfile(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(page.getByText("Your data has been deleted")).toBeVisible();
  await expect(page.getByText("Profile: 1")).toBeVisible();
  await expect(page.getByText("Account: 1")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/$/);
});

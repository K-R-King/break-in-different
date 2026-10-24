import { expect, test } from "@playwright/test";
import { buildSamProfile, signUp } from "../helpers";

test("practice interview: start, answer, rephrase, feedback, with no timer and nothing saved", async ({ page }) => {
  // Stub speech so a missing Cartesia voice falls back quietly in headless Chrome.
  await page.addInitScript(() => {
    const fake = { speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {} };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  await signUp(page);
  await buildSamProfile(page);
  await page.getByRole("button", { name: "Save and find jobs" }).click();
  await expect(page.getByRole("list", { name: "Job matches" }).getByRole("article").first()).toBeVisible({ timeout: 15_000 });

  await page.locator("#detail").getByRole("link", { name: "Practice an interview" }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("heading", { level: 1, name: "Practice interview" })).toBeFocused();
  await expect(page.getByText(/Your answers are sent to Claude/)).toBeVisible();
  await expect(page.getByText(/no time limit/).first()).toBeVisible();

  await page.getByRole("radio", { name: /Written questions/ }).check();
  await page.getByRole("button", { name: "Start practice" }).click();
  const convo = page.getByRole("list", { name: "Conversation" }).getByRole("listitem");
  await expect(convo).toHaveCount(1, { timeout: 30_000 });
  await expect(convo.first()).toContainText("Interviewer");

  // Rephrase adds a new interviewer line and asks nothing new.
  await page.getByRole("button", { name: "Say it differently" }).click();
  await expect(convo).toHaveCount(2, { timeout: 30_000 });

  // "I need a moment" only pauses; the interviewer never moves on by itself.
  await page.getByRole("button", { name: "I need a moment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Take your time" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(convo).toHaveCount(2);

  await page.getByLabel("Your answer").fill("I built a React dashboard for a campus club and wrote the API in TypeScript.");
  await page.getByLabel("Your answer").press("Control+Enter");
  await expect(convo).toHaveCount(4, { timeout: 30_000 });
  await expect(convo.nth(2)).toContainText("I built a React dashboard");
  await expect(page.getByLabel("Your answer")).toHaveValue("");

  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByRole("heading", { name: "Feedback on your answers" })).toBeFocused({ timeout: 30_000 });

  // Written questions always show their text, so the listen-only option is not offered.
  await expect(page.getByLabel("Show the conversation as text")).toHaveCount(0);

  // Nothing is saved: coming back starts a fresh practice.
  await page.reload();
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversation" })).toHaveCount(0);
});

test("practice interview: listen-only mode hides the conversation until it is turned back on", async ({ page }) => {
  await page.addInitScript(() => {
    const fake = { speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {} };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  await signUp(page);
  await buildSamProfile(page);
  await page.getByRole("button", { name: "Save and find jobs" }).click();
  await expect(page.getByRole("list", { name: "Job matches" }).getByRole("article").first()).toBeVisible({ timeout: 15_000 });
  await page.locator("#detail").getByRole("link", { name: "Practice an interview" }).click();

  await page.getByRole("radio", { name: /Spoken conversation/ }).check();
  await page.getByLabel("Show the conversation as text").uncheck();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText(/The conversation is hidden/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("list", { name: "Conversation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Repeat" })).toBeEnabled();

  await page.getByLabel("Your answer").fill("I built a React dashboard for a campus club.");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByRole("status").filter({ hasText: /thinking/ })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("I built a React dashboard")).toHaveCount(0);

  // Turning text back on shows everything said so far.
  await page.getByLabel("Show the conversation as text").check();
  await expect(page.getByRole("list", { name: "Conversation" }).getByRole("listitem")).toHaveCount(3);
});

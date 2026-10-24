// axe on all routes (six screens plus practice) in three modes: default, dyslexia font at 200% text, high contrast.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildSamProfile, signUp } from "../helpers";

const MODES = {
  default: {},
  dyslexia200: { font: "opendyslexic", textScale: 2 },
  highContrast: { contrast: "high" },
} as const;

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

for (const [mode, prefs] of Object.entries(MODES)) {
  test(`axe: all routes, ${mode}`, async ({ page }) => {
    await page.addInitScript((p) => {
      const base = { font: "system", textScale: 1, lineHeight: 1.5, letterSpacing: 0, wordSpacing: 0, ttsHighlight: false, voiceReader: false, voiceNav: false, reduceMotion: true, contrast: "standard" };
      localStorage.setItem("bid.interface", JSON.stringify({ ...base, ...p }));
    }, prefs);
    await page.goto("/");
    await scan(page, `${mode} /`);
    await page.goto("/account");
    await scan(page, `${mode} /account`);
    await signUp(page);
    // A new account adopts this device's preferences, so the mode carries over.
    await buildSamProfile(page);
    await scan(page, `${mode} /profile`);
    await page.getByRole("button", { name: "Save and find jobs" }).click();
    await expect(page.getByRole("list", { name: "Job matches" }).getByRole("article").first()).toBeVisible({ timeout: 15_000 });
    await scan(page, `${mode} /jobs`);
    await page.locator("#detail").getByRole("link", { name: "Practice an interview" }).click();
    await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
    await scan(page, `${mode} /jobs/:id/practice (setup)`);
    await page.getByRole("radio", { name: /Written questions/ }).check();
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.getByRole("list", { name: "Conversation" }).getByRole("listitem")).toHaveCount(1, { timeout: 30_000 });
    await scan(page, `${mode} /jobs/:id/practice (conversation)`);
    await page.goBack();
    await expect(page.getByRole("list", { name: "Job matches" }).getByRole("article").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("list", { name: "Job matches" }).getByRole("article").first().getByRole("link", { name: /^Apply/ }).click();
    await expect(page.getByLabel("Message")).toHaveValue(/Remote/, { timeout: 30_000 });
    await scan(page, `${mode} /jobs/:id/email`);
    await page.getByRole("button", { name: "Approve draft" }).click();
    await page.getByRole("button", { name: /Already applied/ }).click();
    await page.getByRole("button", { name: "Mark as applied" }).click();
    await expect(page).toHaveURL(/\/tracker$/);
    await scan(page, `${mode} /tracker`);
  });
}

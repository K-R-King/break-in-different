import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const count = (page: Page) => page.getByTestId("stats-count");
const pos = (page: Page) => page.locator(".stats-track").getAttribute("data-pos");
const carousel = (page: Page) => page.getByRole("region", { name: "Facts about disability and work" });

async function home(page: Page) {
  await page.goto("/");
  await page.mouse.move(2, 2); // pointer off the carousel so hover-pause does not kick in
  await expect(count(page)).toHaveText("Fact 1 of 4");
}

test("hero shows all four facts with exact figures and sources; clones are hidden", async ({ page }) => {
  await home(page);
  const slides = page.locator(".stat-card:not([aria-hidden])");
  await expect(slides).toHaveCount(4);
  await expect(page.locator('.stat-card[aria-hidden="true"]')).toHaveCount(2);
  await expect(slides.nth(0)).toContainText("53%");
  await expect(slides.nth(0)).toContainText("This is not a prevalence rate");
  await expect(slides.nth(1)).toContainText("38.1%vs. 74.8%");
  await expect(slides.nth(1)).toContainText("ages 16–64");
  await expect(slides.nth(1)).toContainText("U.S. Bureau of Labor Statistics, People with a Disability: Labor Force Characteristics, 2025");
  await expect(slides.nth(2)).toContainText("13%");
  await expect(slides.nth(2)).toContainText("of the U.S. population had a disability in 2025.");
  await expect(slides.nth(3)).toContainText("37%");
  for (const t of ["37% said the process dragged.", "28% feared retaliation.", "Managers turned down one in five requests."])
    await expect(slides.nth(3)).toContainText(t);
  await expect(page.locator('.stat-card[data-active="true"]')).toHaveCount(1);
  // No dots or arrows; one pause control.
  await expect(carousel(page).getByRole("button")).toHaveCount(1);
});

test("autoplays through all four facts and wraps from the fourth to the first without a jump", async ({ page }) => {
  test.setTimeout(90_000);
  await home(page);
  for (const n of [2, 3, 4]) await expect(count(page)).toHaveText(`Fact ${n} of 4`, { timeout: 8_000 });
  // Watch the active card's position through the wrap: clone of card 1 → real card 1.
  const samples: { pos: string; left: number; figure: string }[] = [];
  const end = Date.now() + 8_500;
  while (Date.now() < end) {
    samples.push(
      await page.evaluate(() => {
        const t = document.querySelector<HTMLElement>(".stats-track")!;
        const a = t.querySelector<HTMLElement>('[data-active="true"]')!;
        return { pos: t.dataset.pos!, left: Math.round(a.getBoundingClientRect().left), figure: a.querySelector(".stat-figure")!.textContent! };
      }),
    );
    await page.waitForTimeout(40);
  }
  const wrap = samples.findIndex((s, i) => i > 0 && samples[i - 1].pos === "5" && s.pos === "1");
  expect(wrap, "the loop wrapped from the clone back to the first card").toBeGreaterThan(0);
  const before = samples[wrap - 1];
  const after = samples[wrap];
  expect(before.figure).toBe("53%");
  expect(after.figure).toBe("53%");
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(2);
  await expect(count(page)).toHaveText("Fact 1 of 4");
  await expect(count(page)).toHaveText("Fact 2 of 4", { timeout: 8_000 }); // keeps looping
});

test("pauses while hovered and resumes when the pointer leaves", async ({ page }) => {
  await home(page);
  await carousel(page).hover();
  await page.waitForTimeout(7_000);
  await expect(count(page)).toHaveText("Fact 1 of 4");
  await page.mouse.move(2, 2);
  await expect(count(page)).toHaveText("Fact 2 of 4", { timeout: 8_000 });
});

test("pause button stops and restarts autoplay (focus can stay on the button); the carousel never takes focus by itself", async ({ page }) => {
  await home(page);
  const focusedInCarousel = await page.evaluate(() => !!document.activeElement?.closest(".stats-carousel"));
  expect(focusedInCarousel).toBe(false);
  await expect(page.locator(".stat-card[tabindex]")).toHaveCount(0);
  await carousel(page).getByRole("button", { name: "Pause facts" }).click();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(7_000);
  await expect(count(page)).toHaveText("Fact 1 of 4");
  await carousel(page).getByRole("button", { name: "Play facts" }).click();
  await page.mouse.move(2, 2);
  await expect(count(page)).toHaveText("Fact 2 of 4", { timeout: 8_000 });
});

test("reduced motion: no autoplay and no sliding; Play steps without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await home(page);
  await expect(carousel(page).getByRole("button", { name: "Play facts" })).toBeVisible();
  await expect(page.locator(".stats-track")).toHaveAttribute("data-animate", "false");
  await page.waitForTimeout(7_000);
  await expect(count(page)).toHaveText("Fact 1 of 4");
  await carousel(page).getByRole("button", { name: "Play facts" }).click();
  await page.mouse.move(2, 2);
  await expect(count(page)).toHaveText("Fact 2 of 4", { timeout: 8_000 });
  expect(await pos(page)).toBe("2");
  const transition = await page.locator(".stats-track").evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toBe("0s");
});

for (const [name, width, height] of [["desktop", 1440, 900], ["tablet", 820, 1100], ["mobile", 375, 812]] as const) {
  test(`${name}: no horizontal overflow and the active card is fully visible`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await home(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.locator('.stat-card[data-active="true"]').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    // The left column is untouched: headline and both buttons still present.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Find CS jobs that fit your skills");
    await expect(page.getByRole("button", { name: "Adjust text and reading first" })).toBeVisible();
  });
}

for (const [mode, prefs] of [
  ["default", {}],
  ["dyslexia font at 200%", { font: "opendyslexic", textScale: 2 }],
  ["high contrast", { contrast: "high" }],
] as const) {
  test(`axe: hero carousel has no critical or serious issues (${mode})`, async ({ page }) => {
    await page.addInitScript((p) => {
      const base = { font: "system", textScale: 1, lineHeight: 1.5, letterSpacing: 0, wordSpacing: 0, ttsHighlight: false, voiceReader: false, voiceNav: false, reduceMotion: false, contrast: "standard" };
      localStorage.setItem("bid.interface", JSON.stringify({ ...base, ...p }));
    }, prefs);
    await home(page);
    const r = await new AxeBuilder({ page }).include(".stats-carousel").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

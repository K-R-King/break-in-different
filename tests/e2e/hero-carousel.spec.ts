import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Normal motion is a continuous CSS marquee, so these tests sample the real page in real time:
// the track's computed transform, the animation's currentTime (Web Animations API) and card
// geometry. The reduced-motion stepper runs on timers, so those tests use Playwright's fake clock.

const FIGURES = ["53%", "38.1%vs. 74.8%", "13%", "37%"];
const SPEED = 40; // px/s, matches StatsCarousel
const MARQUEE = ".stats-marquee";
const carousel = (page: Page) => page.getByRole("region", { name: "Facts about disability and work" });
const trackX = (page: Page, sel = MARQUEE) => page.locator(sel).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
const animTime = (page: Page) =>
  page.locator(MARQUEE).evaluate((el) => Number(el.getAnimations()[0].currentTime));
// One sequence of four cards, in px: the distance the track travels per loop.
const loopPx = (page: Page) =>
  page.locator(MARQUEE).evaluate((el) => {
    const slot = el.querySelector<HTMLElement>(".stat-slot")!;
    return 4 * (slot.offsetWidth + parseFloat(getComputedStyle(el).columnGap));
  });
// The card that spans the horizontal centre of the viewport, i.e. the "active" card.
const centreCard = (page: Page) =>
  page.locator(".stats-viewport").evaluate((vp) => {
    const v = vp.getBoundingClientRect();
    const cx = v.left + v.width / 2;
    const card = [...vp.querySelectorAll<HTMLElement>(".stat-card")].find((c) => {
      const r = c.getBoundingClientRect();
      return r.left <= cx && r.right >= cx;
    });
    return card ? { key: card.parentElement!.dataset.key!, figure: card.querySelector(".stat-figure")!.textContent!, width: card.getBoundingClientRect().width } : null;
  });

async function sample<T>(page: Page, read: () => Promise<T>, ms: number, every = 50): Promise<{ t: number; v: T }[]> {
  const out: { t: number; v: T }[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    out.push({ t: Date.now() - t0, v: await read() });
    await page.waitForTimeout(every);
  }
  return out;
}

// Fail any test that logs a console error or throws in the page.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  pageErrors.set(page, errors);
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

async function home(page: Page) {
  await page.goto("/");
  await page.mouse.move(2, 2); // pointer off the carousel
  await expect(page.locator(MARQUEE)).toBeVisible();
  await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
}

// Point at the centre card. The 16 px gap between cards can be at the centre for a moment, so
// retry until a card is under the pointer and the track reports paused.
async function hoverCentre(page: Page) {
  const v = (await page.locator(".stats-viewport").boundingBox())!;
  await expect(async () => {
    await page.mouse.move(v.x + v.width / 2 + 1, v.y + v.height / 2);
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "true", { timeout: 300 });
  }).toPass({ timeout: 5_000 });
}

test.describe("content and structure", () => {
  test("shows all four facts with exact figures and sources, and no playback controls", async ({ page }) => {
    await home(page);
    const slides = page.locator(`${MARQUEE} .stat-card:not([aria-hidden])`);
    await expect(slides).toHaveCount(4);
    await expect(page.locator(`${MARQUEE} .stat-card[aria-hidden="true"]`)).toHaveCount(8); // the two copies for looping
    await expect(slides.nth(0)).toContainText("This is not a prevalence rate");
    await expect(slides.nth(1)).toContainText("38.1%vs. 74.8%");
    await expect(slides.nth(1)).toContainText("ages 16–64");
    await expect(slides.nth(1)).toContainText("U.S. Bureau of Labor Statistics, People with a Disability: Labor Force Characteristics, 2025");
    await expect(slides.nth(2)).toContainText("of the U.S. population had a disability in 2025.");
    for (const t of ["37% said the process dragged.", "28% feared retaliation.", "Managers turned down one in five requests."])
      await expect(slides.nth(3)).toContainText(t);
    await expect(carousel(page).getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/Pause facts|Play facts/)).toHaveCount(0);
    await expect(page.locator(".stats-carousel [tabindex]")).toHaveCount(0);
  });
});

test.describe("normal motion: continuous marquee", () => {
  test.use({ reducedMotion: "no-preference" });

  test("starts moving on load, right to left, at a constant ~40 px/s with no pauses", async ({ page }) => {
    await home(page);
    const frames = await sample(page, () => trackX(page), 3_000, 100);
    for (let i = 1; i < frames.length; i++) expect(frames[i].v).toBeLessThan(frames[i - 1].v); // always moving left
    const speed = (a: (typeof frames)[number], b: (typeof frames)[number]) => (a.v - b.v) / ((b.t - a.t) / 1000);
    const overall = speed(frames[0], frames.at(-1)!);
    expect(overall).toBeGreaterThan(35);
    expect(overall).toBeLessThan(45);
    // Constant speed: every ~500 ms window matches the overall speed (no steps, waits or easing).
    for (let i = 0; i + 5 < frames.length; i += 5) expect(Math.abs(speed(frames[i], frames[i + 5]) - overall)).toBeLessThan(6);
    // It is the browser's animation clock that drives it, at real time.
    const a0 = await animTime(page);
    await page.waitForTimeout(1_000);
    expect((await animTime(page)) - a0).toBeGreaterThan(800);
  });

  test("every card physically travels left together; the centred card moves off centre", async ({ page }) => {
    await home(page);
    const keys = ["1-0", "1-1", "1-2"]; // the first three facts
    const boxes = () =>
      page.locator(".stats-viewport").evaluate((vp, ks) => {
        const v = vp.getBoundingClientRect();
        return ks.map((k) => vp.querySelector(`[data-key="${k}"] .stat-card`)!.getBoundingClientRect().left - v.left);
      }, keys);
    const vpWidth = (await page.locator(".stats-viewport").boundingBox())!.width;
    const width = (await centreCard(page))!.width;
    const frames = await sample(page, boxes, 3_000, 250);
    for (let c = 0; c < keys.length; c++) {
      for (let i = 1; i < frames.length; i++) expect(frames[i].v[c]).toBeLessThan(frames[i - 1].v[c]);
      const dx = frames[0].v[c] - frames.at(-1)!.v[c];
      const speed = dx / ((frames.at(-1)!.t - frames[0].t) / 1000);
      expect(Math.abs(speed - SPEED)).toBeLessThan(5);
    }
    // One rigid row: the spacing between cards never changes.
    for (const f of frames) {
      expect(Math.abs(f.v[1] - f.v[0] - (frames[0].v[1] - frames[0].v[0]))).toBeLessThan(0.5);
      expect(Math.abs(f.v[2] - f.v[1] - (frames[0].v[2] - frames[0].v[1]))).toBeLessThan(0.5);
    }
    // The first fact started centred and has since moved ~120 px left of centre.
    const offCentre = (left: number) => left + width / 2 - vpWidth / 2;
    expect(Math.abs(offCentre(frames[0].v[0]))).toBeLessThan(20);
    expect(offCentre(frames.at(-1)!.v[0])).toBeLessThan(-100);
  });

  test("cards keep their size while moving (no scaling)", async ({ page }) => {
    await home(page);
    const widths = await sample(page, () => page.locator(`${MARQUEE} .stat-card`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width)), 1_500, 100);
    const all = widths.flatMap((w) => w.v);
    expect(Math.max(...all) - Math.min(...all)).toBeLessThan(0.5);
  });

  test("the loop boundary is seamless: the end frame matches the start frame exactly", async ({ page }) => {
    await home(page);
    const frame = (t: number) =>
      page.locator(".stats-viewport").evaluate((vp, time) => {
        const anim = vp.querySelector(".stats-marquee")!.getAnimations()[0];
        anim.pause();
        anim.currentTime = time === -1 ? Number(anim.effect!.getComputedTiming().duration) - 1 : time;
        const v = vp.getBoundingClientRect();
        return [...vp.querySelectorAll<HTMLElement>(".stat-card")]
          .map((c) => ({ r: c.getBoundingClientRect(), f: c.querySelector(".stat-figure")!.textContent }))
          .filter(({ r }) => r.right > v.left && r.left < v.right)
          .map(({ r, f }) => ({ f, x: r.left - v.left }));
      }, t);
    const start = await frame(0);
    const end = await frame(-1); // 1 ms before the loop repeats (0.04 px away at 40 px/s)
    expect(start.length).toBeGreaterThanOrEqual(2);
    expect(end.map((c) => c.f)).toEqual(start.map((c) => c.f));
    // Within one 60 Hz frame of normal travel (0.67 px); WebKit lands up to ~0.6 px off here.
    end.forEach((c, i) => expect(Math.abs(c.x - start[i].x)).toBeLessThan(SPEED / 60 + 0.1));
    expect(start.some((c) => c.f === "53%")).toBe(true);
  });

  test("crosses the loop boundary at full speed with no jump", async ({ page }) => {
    await home(page);
    const loop = await loopPx(page);
    await page.locator(MARQUEE).evaluate((el) => {
      const anim = el.getAnimations()[0];
      anim.currentTime = Number(anim.effect!.getComputedTiming().duration) - 1_500;
    });
    const frames = await sample(page, () => trackX(page), 3_000, 50);
    // Unwrap: the only allowed backward step is exactly one loop length (the invisible reset).
    let wraps = 0;
    const unwrapped = [frames[0].v];
    for (let i = 1; i < frames.length; i++) {
      let d = frames[i].v - frames[i - 1].v;
      if (d > 0) {
        expect(Math.abs(d - loop)).toBeLessThan(5);
        d -= loop;
        wraps++;
      }
      expect(d).toBeLessThan(0);
      unwrapped.push(unwrapped.at(-1)! + d);
    }
    expect(wraps).toBe(1);
    const speed = (unwrapped[0] - unwrapped.at(-1)!) / ((frames.at(-1)!.t - frames[0].t) / 1000);
    expect(Math.abs(speed - SPEED)).toBeLessThan(5);
  });

  test("loops seamlessly for two full cycles, showing the facts in order", async ({ page }) => {
    await home(page);
    // Run the real animation 25× faster so two cycles fit in a few seconds.
    await page.locator(MARQUEE).evaluate((el) => (el.getAnimations()[0].playbackRate = 25));
    const loop = await loopPx(page);
    const frames = await sample(page, async () => ({ x: await trackX(page), c: await centreCard(page) }), 6_000, 20);
    let wraps = 0;
    for (let i = 1; i < frames.length; i++) {
      const d = frames[i].v.x - frames[i - 1].v.x;
      expect(d).not.toBe(0); // never stalls
      if (d > 0) {
        // The reset is exactly one loop back, minus the ~1000 px/s travel between samples: after
        // unwrapping it still moved left at the same pace.
        const travel = 25 * SPEED * ((frames[i].t - frames[i - 1].t) / 1000);
        expect(Math.abs(d - loop + travel)).toBeLessThan(travel * 0.6 + 5);
        wraps++;
      }
    }
    expect(wraps).toBeGreaterThanOrEqual(2);
    // The fact at the centre advances 53% → 38.1% → 13% → 37% → 53% … and never skips or repeats.
    const seq = frames.map((f) => f.v.c?.figure).filter((f): f is string => !!f).filter((f, i, a) => i === 0 || f !== a[i - 1]);
    expect(seq.length).toBeGreaterThanOrEqual(9);
    const start = FIGURES.indexOf(seq[0]);
    seq.forEach((f, i) => expect(f).toBe(FIGURES[(start + i) % 4]));
  });
});

test.describe("hover", () => {
  test.use({ reducedMotion: "no-preference" });

  test("pointing at the centre card pauses the track in place and enlarges that card", async ({ page }) => {
    await home(page);
    const before = (await centreCard(page))!;
    await hoverCentre(page);
    const hovered = page.locator(`${MARQUEE} .stat-card[data-hovered="true"]`);
    await expect(hovered).toHaveCount(1);
    await page.waitForTimeout(400); // let the 250 ms scale finish
    const xs = await sample(page, () => trackX(page), 1_500, 100);
    expect(new Set(xs.map((f) => f.v.toFixed(2))).size).toBe(1); // frozen
    expect(await page.locator(MARQUEE).evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
    const w = await hovered.evaluate((el) => el.getBoundingClientRect().width);
    expect(w / before.width).toBeGreaterThan(1.04);
    expect(w / before.width).toBeLessThan(1.06);
    expect(await hovered.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    // Only that card grows.
    const others = await page.locator(`${MARQUEE} .stat-card:not([data-hovered])`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const o of others) expect(Math.abs(o - before.width)).toBeLessThan(0.5);
  });

  test("hovering a visible card that is not centred also pauses and enlarges only that card", async ({ page }) => {
    await home(page);
    const v = (await page.locator(".stats-viewport").boundingBox())!;
    await page.waitForTimeout(3_500); // let the next card slide ~140 px into view from the right
    // Find a card whose visible part (outside the faded edge) is right of the centre card.
    const target = await page.locator(".stats-viewport").evaluate((vp) => {
      const r = vp.getBoundingClientRect();
      const fade = parseFloat(getComputedStyle(vp).getPropertyValue("--peek")) * 0.9;
      const cx = r.left + r.width / 2;
      const card = [...vp.querySelectorAll<HTMLElement>(".stat-card")].find((c) => {
        const b = c.getBoundingClientRect();
        return b.left > cx && b.left + 10 < r.right - fade;
      })!;
      const b = card.getBoundingClientRect();
      return { key: card.parentElement!.dataset.key!, x: (b.left + Math.min(b.right, r.right - fade)) / 2, width: b.width };
    });
    await page.mouse.move(target.x, v.y + v.height / 2);
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "true");
    const card = page.locator(`[data-key="${target.key}"] .stat-card`);
    await expect(card).toHaveAttribute("data-hovered", "true");
    await page.waitForTimeout(400);
    const w = await card.evaluate((el) => el.getBoundingClientRect().width);
    expect(w / target.width).toBeGreaterThan(1.04);
    expect(w / target.width).toBeLessThan(1.06);
    await expect(page.locator(`${MARQUEE} .stat-card[data-hovered]`)).toHaveCount(1);
    const a = await trackX(page);
    await page.waitForTimeout(500);
    expect(await trackX(page)).toBe(a);
  });

  test("leaving shrinks the card back and resumes from the exact paused position, at full speed", async ({ page }) => {
    await home(page);
    const base = (await centreCard(page))!.width;
    await hoverCentre(page);
    await page.waitForTimeout(300);
    const pausedX = await trackX(page);
    const pausedT = await animTime(page);
    await page.waitForTimeout(1_000);
    expect(await animTime(page)).toBe(pausedT); // no time passes while paused
    await page.mouse.move(2, 2);
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
    const t0 = Date.now();
    const firstX = await trackX(page);
    // Continues from where it stopped (no reset, no catch-up jump): at most the distance travelled since leaving.
    expect(pausedX - firstX).toBeGreaterThanOrEqual(0);
    expect(pausedX - firstX).toBeLessThan(((Date.now() - t0) / 1000 + 0.25) * SPEED);
    await page.waitForTimeout(1_000);
    const moved = firstX - (await trackX(page));
    expect(moved).toBeGreaterThan(SPEED * 0.8);
    expect(moved).toBeLessThan(SPEED * 1.4);
    await expect(page.locator(`${MARQUEE} .stat-card[data-hovered]`)).toHaveCount(0);
    const widths = await page.locator(`${MARQUEE} .stat-card`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths) expect(Math.abs(w - base)).toBeLessThan(0.5); // back to normal size
  });

  test("peeking neighbours, the band around the cards and the headline do not pause it", async ({ page }) => {
    await home(page);
    const v = (await page.locator(".stats-viewport").boundingBox())!;
    const spots = [
      [v.x + 8, v.y + v.height / 2], // left peek
      [v.x + v.width - 8, v.y + v.height / 2], // right peek
      [v.x + v.width / 2, v.y + 4], // empty band above the cards
    ] as const;
    for (const [x, y] of spots) {
      await page.mouse.move(x, y);
      const a = await trackX(page);
      await page.waitForTimeout(500);
      expect(a - (await trackX(page))).toBeGreaterThan(SPEED * 0.3);
      await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
    }
    await page.getByRole("heading", { level: 1 }).hover();
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
  });

  test("repeated hovers never leave it paused", async ({ page }) => {
    await home(page);
    for (let i = 0; i < 5; i++) {
      await hoverCentre(page);
      await page.mouse.move(2, 2);
    }
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
    const a = await trackX(page);
    await page.waitForTimeout(500);
    expect(a - (await trackX(page))).toBeGreaterThan(SPEED * 0.3);
  });
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

  test("a tap never pauses or enlarges a card; the marquee keeps moving", async ({ page }) => {
    await home(page);
    const v = (await page.locator(".stats-viewport").boundingBox())!;
    await page.touchscreen.tap(v.x + v.width / 2, v.y + v.height / 2);
    await page.waitForTimeout(300);
    await expect(page.locator(MARQUEE)).toHaveAttribute("data-paused", "false");
    await expect(page.locator(`${MARQUEE} .stat-card[data-hovered]`)).toHaveCount(0);
    const a = await trackX(page);
    await page.waitForTimeout(500);
    expect(a - (await trackX(page))).toBeGreaterThan(SPEED * 0.3);
  });
});

test.describe("reduced motion", () => {
  const MAIN = ".stats-track:not(.stats-track-out)";
  const ACTIVE = `${MAIN} .stat-slot[data-active="true"]`;
  const activeFigure = (page: Page) => page.locator(`${ACTIVE} .stat-figure`).textContent();
  const cardWidth = (page: Page) => page.locator(`${ACTIVE} .stat-card`).evaluate((e) => e.getBoundingClientRect().width);

  async function homeReduced(page: Page) {
    const t = new Date("2026-10-25T10:00:00Z").getTime();
    await page.clock.install({ time: t });
    await page.clock.pauseAt(t + 10); // timers advance only through runFor
    await page.goto("/");
    await page.mouse.move(2, 2);
    await expect(carousel(page)).toHaveAttribute("data-motion", "reduced");
    await expect(page.locator(MAIN)).toHaveAttribute("data-pos", "1");
    expect(await activeFigure(page)).toBe("53%");
  }

  async function expectCrossFade(page: Page) {
    await expect(page.locator(MARQUEE)).toHaveCount(0); // no marquee at all
    await expect(page.locator(`${MAIN} .stat-card:not([aria-hidden])`)).toHaveCount(4); // every fact reachable
    await expect(page.locator(".stats-track-out")).toHaveCount(0); // nothing fades on page load
    const still = await sample(page, () => trackX(page, MAIN), 800, 100);
    expect(new Set(still.map((f) => f.v)).size).toBe(1); // nothing drifts between steps
    const x0 = still[0].v;
    await page.clock.runFor(6_000);
    await expect(page.locator(MAIN)).toHaveAttribute("data-pos", "2");
    const frames = await sample(
      page,
      async () => ({
        x: await trackX(page, MAIN),
        op: await page.locator(".stats-track-out").evaluateAll((els) => (els[0] ? Number(getComputedStyle(els[0]).opacity) : null)),
      }),
      1_000,
      25,
    );
    const xs = new Set(frames.map((f) => Math.round(f.v.x)));
    expect(xs.size).toBe(1); // no slide: the track changed once and then never moved
    expect([...xs][0]).not.toBe(Math.round(x0));
    const ops = frames.map((f) => f.v.op).filter((o): o is number => o !== null);
    expect(ops.some((o) => o > 0.2 && o < 0.8)).toBe(true); // a real cross-fade with in-between opacity
    await expect(page.locator(".stats-track-out")).toHaveCount(0);
    expect(await activeFigure(page)).toBe(FIGURES[1]);
    for (const f of [FIGURES[2], FIGURES[3], FIGURES[0]]) {
      await page.clock.runFor(6_000);
      expect(await activeFigure(page)).toBe(f);
    }
    // Hover on the active card pauses without scaling.
    const base = await cardWidth(page);
    const box = (await page.locator(ACTIVE).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect(Math.abs((await cardWidth(page)) - base)).toBeLessThan(0.5);
    await page.clock.runFor(20_000);
    expect(await activeFigure(page)).toBe(FIGURES[0]);
    await page.mouse.move(2, 2);
    await page.clock.runFor(6_000);
    expect(await activeFigure(page)).toBe(FIGURES[1]);
    await expect(carousel(page).getByRole("button")).toHaveCount(0);
  }

  test("system setting: no marquee; cross-fades every 6 s with no movement or scaling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await homeReduced(page);
    await expectCrossFade(page);
  });

  test("app setting: same cross-fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const base = { font: "system", textScale: 1, lineHeight: 1.5, letterSpacing: 0, wordSpacing: 0, ttsHighlight: false, voiceReader: false, voiceNav: false, contrast: "standard" };
      localStorage.setItem("bid.interface", JSON.stringify({ ...base, reduceMotion: true }));
    });
    await homeReduced(page);
    await expectCrossFade(page);
  });
});

test.describe("layout", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const [name, width, height] of [["desktop", 1440, 900], ["tablet", 820, 1100], ["mobile", 375, 812]] as const) {
    test(`${name}: no horizontal overflow; the first fact starts fully visible and stays readable`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await home(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.locator(MARQUEE).evaluate((el) => {
        const a = el.getAnimations()[0];
        a.pause();
        a.currentTime = 0;
      });
      const first = page.locator(`${MARQUEE} .stat-card:not([aria-hidden])`).first();
      const box = (await first.boundingBox())!;
      const vp = (await page.locator(".stats-viewport").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(vp.x);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.x + vp.width);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      // Text fits its card: nothing overflows horizontally.
      expect(await first.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(parseFloat(await first.locator(".stat-figure-main").evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThan(30);
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
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});

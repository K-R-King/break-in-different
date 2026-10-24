import { expect, test } from "@playwright/test";
import { buildSamProfile, signUp } from "../helpers";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

async function toJobs(page: import("@playwright/test").Page) {
  await signUp(page);
  await buildSamProfile(page);
  await page.getByRole("button", { name: "Save and find jobs" }).click();
  await expect(page.getByRole("list", { name: "Job matches" }).getByRole("article").first()).toBeVisible({ timeout: 15_000 });
}

test("A13: read aloud falls back to the browser voice with a notice when Cartesia is unavailable", async ({ page }) => {
  // Stub speech synthesis so the fallback is observable in headless Chrome.
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    const fake = {
      speak: (u: SpeechSynthesisUtterance) => {
        w.__spoken.push(u.text);
        setTimeout(() => u.onboundary?.({ charIndex: 4 } as SpeechSynthesisEvent), 50);
      },
      cancel: () => {}, pause: () => {}, resume: () => {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  await toJobs(page);
  await page.route("**/api/action", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("tts:synthesize")) return route.fulfill({ status: 500, body: "blocked" });
    return route.continue();
  });
  await page.locator("#detail").getByRole("button", { name: "Read aloud" }).click();
  await expect(page.locator("#detail").getByText("Using your browser's voice")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("tts-text").locator(".hl")).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tts-text")).toHaveCount(0);
});

test("A14: push-to-talk records and shows a fallback message when speech-to-text is unavailable", async ({ page }) => {
  await toJobs(page);
  const btn = page.getByRole("button", { name: "Hold to talk" });
  await btn.focus();
  await page.keyboard.down("Space");
  await expect(page.getByRole("button", { name: "Listening…" })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  await expect(page.getByTestId("voice-message")).toContainText(/Voice input is unavailable|Heard/, { timeout: 15_000 });
});

test("A14: unsupported browser shows the fallback message", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without MediaRecorder
    delete window.MediaRecorder;
  });
  await toJobs(page);
  await page.getByRole("button", { name: "Hold to talk" }).click();
  await expect(page.getByTestId("voice-message")).toHaveText("Voice input is not available in this browser. Use the keyboard instead.");
});

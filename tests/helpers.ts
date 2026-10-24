import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const SAMPLE_RESUME = readFileSync(new URL("./fixtures/sample-resume.txt", import.meta.url), "utf8");
export const PASSWORD = "correct-horse-battery";

export async function signUp(page: Page, email = `e2e-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`) {
  await page.goto("/account?tab=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/profile/);
  return email;
}

// Sam's profile: skills from pasted resume, remote + flexible required, written alternatives preferred.
export async function buildSamProfile(page: Page) {
  await page.getByLabel("Full name").fill("Sam Rivera"); // signs the email in place of [Your name]
  await page.getByLabel(/Send this resume to an AI service/).check();
  await page.getByRole("button", { name: "Paste text instead" }).click();
  await page.getByLabel("Paste your resume text").fill(SAMPLE_RESUME);
  await page.getByRole("button", { name: "Find skills in this text" }).click();
  await expect(page.getByRole("list", { name: "Your skills" }).getByRole("listitem")).toHaveCount(13, { timeout: 30_000 });
  const need = async (legend: string, value: "Required" | "Preferred") =>
    page.getByRole("group", { name: legend }).getByText(value, { exact: true }).click();
  await need("Remote work options", "Required");
  await need("Flexible working hours", "Required");
  await need("Written alternatives for phone calls", "Preferred");
  await page.getByLabel(/Full Stack Developer/).check();
}

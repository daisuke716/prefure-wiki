import { test, expect } from '@playwright/test';
import { argosScreenshot } from "@argos-ci/playwright";

test('has title', async ({ page }) => {
  await page.goto('https://www.prefure.com/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://www.prefure.com/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});


test("screenshot homepage", async ({ page }) => {
  await page.goto("https://www.prefure.com/");
  await argosScreenshot(page, "homepage");
});
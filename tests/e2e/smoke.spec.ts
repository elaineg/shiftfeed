import { test, expect } from '@playwright/test';

// Baseline smoke every app keeps: page loads, communicates purpose, no console errors.
test('landing page loads and states its purpose', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const resp = await page.goto('/');
  expect(resp?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
  expect(errors).toEqual([]);
});

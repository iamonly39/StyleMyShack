import { test, expect } from '@playwright/test';
import {
  setupMocks,
  setupColorMocks,
  MOCK_RECS_WITH_SWATCHES,
} from './fixtures.js';

const SUPABASE_URL = 'https://yoikyxyrkcnvszogsyut.supabase.co';

// Enter edit mode, open the inline swatch editor for swatch 0-0.
async function openSwatchEditor(page) {
  await page.locator('#edit-toggle').click();
  await page.locator('[data-open-swatch="0-0"]').click();
  await expect(page.locator('.swatch-inline-edit')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await setupMocks(page);
  await setupColorMocks(page);

  // Use recs that already have one palette with one swatch
  await page.route(`${SUPABASE_URL}/rest/v1/recommendations*`, route => {
    if (route.request().url().includes('room_id=eq.living-room')) {
      route.fulfill({ json: [MOCK_RECS_WITH_SWATCHES] });
    } else {
      route.fulfill({ json: [] });
    }
  });

  await page.goto('/room.html?id=living-room');
});

// ─── Brand toggle visibility ───────────────────────────────────────────────

test('brand toggle shows both brand buttons when swatch editor is open', async ({ page }) => {
  await openSwatchEditor(page);
  await expect(page.locator('.sie-brand-btn[data-brand="bm"]')).toBeVisible();
  await expect(page.locator('.sie-brand-btn[data-brand="sw"]')).toBeVisible();
});

test('brand toggle buttons are labeled correctly', async ({ page }) => {
  await openSwatchEditor(page);
  await expect(page.locator('.sie-brand-btn[data-brand="bm"]')).toHaveText('Benjamin Moore');
  await expect(page.locator('.sie-brand-btn[data-brand="sw"]')).toHaveText('Sherwin Williams');
});

// ─── Default state: BM active ──────────────────────────────────────────────

test('Benjamin Moore is the active brand by default', async ({ page }) => {
  await openSwatchEditor(page);
  await expect(page.locator('.sie-brand-btn[data-brand="bm"]')).toHaveClass(/active/);
  await expect(page.locator('.sie-brand-btn[data-brand="sw"]')).not.toHaveClass(/active/);
});

test('search placeholder defaults to Benjamin Moore', async ({ page }) => {
  await openSwatchEditor(page);
  await expect(page.locator('#sie-bm-search')).toHaveAttribute('placeholder', /Benjamin Moore/);
});

// ─── Switching brands ──────────────────────────────────────────────────────

test('clicking Sherwin Williams activates SW and deactivates BM', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await expect(page.locator('.sie-brand-btn[data-brand="sw"]')).toHaveClass(/active/);
  await expect(page.locator('.sie-brand-btn[data-brand="bm"]')).not.toHaveClass(/active/);
});

test('switching to Sherwin Williams updates the search placeholder', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await expect(page.locator('#sie-bm-search')).toHaveAttribute('placeholder', /Sherwin Williams/);
});

test('switching back to Benjamin Moore restores BM as active', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await page.locator('.sie-brand-btn[data-brand="bm"]').click();
  await expect(page.locator('.sie-brand-btn[data-brand="bm"]')).toHaveClass(/active/);
  await expect(page.locator('.sie-brand-btn[data-brand="sw"]')).not.toHaveClass(/active/);
});

// ─── BM search ─────────────────────────────────────────────────────────────

test('BM search returns matching colors', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('#sie-bm-search').fill('dove');
  await expect(page.locator('.bm-result-item')).toHaveCount(1);
  await expect(page.locator('.bm-result-name')).toHaveText('White Dove');
  await expect(page.locator('.bm-result-num')).toHaveText('OC-17');
});

test('BM search matches by color number', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('#sie-bm-search').fill('HC-172');
  await expect(page.locator('.bm-result-item')).toHaveCount(1);
  await expect(page.locator('.bm-result-name')).toHaveText('Revere Pewter');
});

test('BM search shows no-results message for unknown query', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('#sie-bm-search').fill('zzznomatch');
  await expect(page.locator('.bm-result-empty')).toBeVisible();
});

// ─── SW search ─────────────────────────────────────────────────────────────

test('SW search returns matching colors after switching to Sherwin Williams', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await page.locator('#sie-bm-search').fill('repose');
  await expect(page.locator('.bm-result-item')).toHaveCount(1);
  await expect(page.locator('.bm-result-name')).toHaveText('Repose Gray');
  await expect(page.locator('.bm-result-num')).toHaveText('SW 7015');
});

test('SW search matches by SW number', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await page.locator('#sie-bm-search').fill('SW 7006');
  await expect(page.locator('.bm-result-item')).toHaveCount(1);
  await expect(page.locator('.bm-result-name')).toHaveText('Extra White');
});

test('SW search does not return BM colors', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  // "dove" exists in BM mock but not SW mock
  await page.locator('#sie-bm-search').fill('dove');
  await expect(page.locator('.bm-result-empty')).toBeVisible();
});

test('BM search does not return SW colors', async ({ page }) => {
  await openSwatchEditor(page);
  // "repose" exists in SW mock but not BM mock
  await page.locator('#sie-bm-search').fill('repose');
  await expect(page.locator('.bm-result-empty')).toBeVisible();
});

// ─── Result selection ──────────────────────────────────────────────────────

test('clicking a BM result fills the color input and label', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('#sie-bm-search').fill('dove');
  await page.locator('.bm-result-item').first().click();
  await expect(page.locator('#sie-color')).toHaveValue('#f3efe4');
  await expect(page.locator('#sie-label')).toHaveValue('White Dove OC-17');
});

test('clicking a SW result fills the color input and label with SW format', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await page.locator('#sie-bm-search').fill('repose');
  await page.locator('.bm-result-item').first().click();
  await expect(page.locator('#sie-color')).toHaveValue('#c2bdb6');
  await expect(page.locator('#sie-label')).toHaveValue('Repose Gray SW 7015');
});

// ─── Switching brands clears state ────────────────────────────────────────

test('switching brands clears search input and results', async ({ page }) => {
  await openSwatchEditor(page);
  await page.locator('#sie-bm-search').fill('dove');
  await expect(page.locator('.bm-result-item')).toHaveCount(1);

  await page.locator('.sie-brand-btn[data-brand="sw"]').click();
  await expect(page.locator('#sie-bm-search')).toHaveValue('');
  await expect(page.locator('.bm-swatch-results')).not.toHaveClass(/open/);
});

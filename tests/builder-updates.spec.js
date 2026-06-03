import { test, expect } from '@playwright/test';
import {
  setupMocks,
  setupOwnerAuth,
  setupBuilderAuth,
  MOCK_BUILDER_UPDATES,
  BUILDER_EMAIL,
} from './fixtures.js';

const SUPABASE_URL = 'https://yoikyxyrkcnvszogsyut.supabase.co';

// ─── Anonymous user ────────────────────────────────────────────────────────
test.describe('anonymous user', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/room.html?id=living-room');
  });

  test('builder updates section is hidden', async ({ page }) => {
    const section = page.locator('#builder-updates-section');
    await expect(section).toBeHidden();
  });
});

// ─── Builder user ──────────────────────────────────────────────────────────
test.describe('builder user', () => {
  test.beforeEach(async ({ page }) => {
    await setupBuilderAuth(page);
    await setupMocks(page);
    await page.goto('/room.html?id=living-room');
  });

  test('builder updates section is visible', async ({ page }) => {
    const section = page.locator('#builder-updates-section');
    await expect(section).toBeVisible();
  });

  test('+ Add Update button is visible to builder', async ({ page }) => {
    await expect(page.locator('#add-builder-update-btn')).toBeVisible();
  });

  test('clicking + Add Update opens the modal', async ({ page }) => {
    await page.locator('#add-builder-update-btn').click();
    await expect(page.locator('#builder-update-modal')).toBeVisible();
    await expect(page.locator('#bum-text')).toBeVisible();
  });

  test('modal shows photo attach option', async ({ page }) => {
    await page.locator('#add-builder-update-btn').click();
    await expect(page.locator('#bum-file')).toBeAttached();
  });

  test('submitting empty modal shows error', async ({ page }) => {
    await page.locator('#add-builder-update-btn').click();
    await page.locator('#bum-submit').click();
    await expect(page.locator('#bum-error')).toBeVisible();
    await expect(page.locator('#bum-error')).toContainText('message');
  });

  test('modal closes on Cancel', async ({ page }) => {
    await page.locator('#add-builder-update-btn').click();
    await expect(page.locator('#builder-update-modal')).toBeVisible();
    await page.locator('#bum-cancel').click();
    await expect(page.locator('#builder-update-modal')).toBeHidden();
  });

  test('modal closes on backdrop click', async ({ page }) => {
    await page.locator('#add-builder-update-btn').click();
    await page.locator('#builder-update-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#builder-update-modal')).toBeHidden();
  });

  test('existing updates are displayed', async ({ page }) => {
    const entries = page.locator('.bu-entry');
    await expect(entries).toHaveCount(MOCK_BUILDER_UPDATES.length);
  });

  test('update entry shows message text', async ({ page }) => {
    await expect(page.locator('.bu-message').first()).toContainText('Framing is complete');
  });

  test('update entry shows Builder label', async ({ page }) => {
    await expect(page.locator('.bu-from').first()).toHaveText('Builder');
  });

  test('update entry shows a date', async ({ page }) => {
    await expect(page.locator('.bu-date').first()).not.toBeEmpty();
  });

  test('builder does not see reply form', async ({ page }) => {
    await expect(page.locator('.bu-reply-form')).toHaveCount(0);
  });

  test('builder does not see Promote to Gallery button', async ({ page }) => {
    await expect(page.locator('.builder-promote-btn')).toHaveCount(0);
  });

  test('posting an update calls Supabase insert', async ({ page }) => {
    let insertCalled = false;
    await page.route(`${SUPABASE_URL}/rest/v1/builder_updates*`, async route => {
      if (route.request().method() === 'POST') {
        insertCalled = true;
        route.fulfill({ json: [{ id: 'new-update', room_id: 'living-room' }] });
      } else {
        route.fulfill({ json: MOCK_BUILDER_UPDATES });
      }
    });

    await page.locator('#add-builder-update-btn').click();
    await page.locator('#bum-text').fill('Plumbing rough-in is done.');
    await page.locator('#bum-submit').click();

    await expect(page.locator('#builder-update-modal')).toBeHidden();
    expect(insertCalled).toBe(true);
  });
});

// ─── Owner user ────────────────────────────────────────────────────────────
test.describe('owner user', () => {
  test.beforeEach(async ({ page }) => {
    await setupOwnerAuth(page);
    await setupMocks(page);
    await page.goto('/room.html?id=living-room');
  });

  test('builder updates section is visible to owner', async ({ page }) => {
    await expect(page.locator('#builder-updates-section')).toBeVisible();
  });

  test('+ Add Update button is hidden from owner', async ({ page }) => {
    await expect(page.locator('#add-builder-update-btn')).toBeHidden();
  });

  test('owner sees existing updates', async ({ page }) => {
    await expect(page.locator('.bu-entry')).toHaveCount(MOCK_BUILDER_UPDATES.length);
  });

  test('owner sees a reply form per update', async ({ page }) => {
    const replyForms = page.locator('.bu-reply-form');
    await expect(replyForms).toHaveCount(MOCK_BUILDER_UPDATES.length);
  });

  test('owner reply input is a textarea', async ({ page }) => {
    await expect(page.locator('.bu-reply-input').first()).toBeVisible();
  });

  test('owner sees Promote to Gallery button for photo-less update (hidden)', async ({ page }) => {
    // update-1 has no photos — promote button should not appear
    await expect(page.locator('.builder-promote-btn')).toHaveCount(0);
  });

  test('sending an empty reply does nothing', async ({ page }) => {
    let patchCalled = false;
    await page.route(`${SUPABASE_URL}/rest/v1/builder_updates*`, async route => {
      if (route.request().method() === 'PATCH') patchCalled = true;
      route.fulfill({ json: MOCK_BUILDER_UPDATES });
    });

    await page.locator('.bu-reply-send').first().click();
    expect(patchCalled).toBe(false);
  });

  test('owner can send a reply and it appears in the feed', async ({ page }) => {
    // Wait for the initial loadBuilderUpdates() to finish before overriding the route,
    // otherwise the async init() fetch races with route registration and picks up the
    // reply-bearing response, causing a double-reply when sendOwnerReply runs.
    await page.locator('.bu-entry').first().waitFor({ state: 'visible' });

    const replyText = 'Looks great, thanks!';
    await page.route(`${SUPABASE_URL}/rest/v1/builder_updates*`, async route => {
      if (route.request().method() === 'PATCH') {
        route.fulfill({ json: [{ ...MOCK_BUILDER_UPDATES[0], replies: [{ text: replyText, at: new Date().toISOString() }] }] });
      } else {
        route.fulfill({ json: [{ ...MOCK_BUILDER_UPDATES[0], replies: [{ text: replyText, at: new Date().toISOString() }] }] });
      }
    });

    await page.locator('.bu-reply-input').first().fill(replyText);
    await page.locator('.bu-reply-send').first().click();

    // After reply, the feed re-renders and shows the owner reply
    await expect(page.locator('.bu-reply').first()).toBeVisible();
    await expect(page.locator('.bu-reply-label').first()).toHaveText('Owner');
    await expect(page.locator('.bu-reply-text').first()).toContainText(replyText);
  });
});

// ─── Update with photos — promote to gallery ───────────────────────────────
test.describe('promote to gallery', () => {
  test.beforeEach(async ({ page }) => {
    await setupOwnerAuth(page);
    await setupMocks(page);

    // Override builder_updates with a photo-bearing update
    await page.route(`${SUPABASE_URL}/rest/v1/builder_updates*`, async route => {
      if (route.request().method() === 'GET' || !route.request().method()) {
        route.fulfill({
          json: [{
            ...MOCK_BUILDER_UPDATES[0],
            photo_paths: ['living-room/builder-updates/test.jpg'],
            storage_path: 'living-room/builder-updates/test.jpg',
          }],
        });
      } else {
        route.fulfill({ json: [] });
      }
    });

    await page.goto('/room.html?id=living-room');
  });

  test('Promote to Gallery button appears for updates with photos', async ({ page }) => {
    await expect(page.locator('.builder-promote-btn')).toBeVisible();
  });

  test('Promote to Gallery button calls Supabase update', async ({ page }) => {
    // Wait for the PATCH and click concurrently so we don't miss the request
    const [patchRequest] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('builder_updates') && req.method() === 'PATCH'
      ),
      page.locator('.builder-promote-btn').click(),
    ]);
    expect(patchRequest).toBeTruthy();
  });
});

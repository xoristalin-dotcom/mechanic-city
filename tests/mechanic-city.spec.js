import { test, expect } from '@playwright/test';

const URL = process.env.GAME_URL || 'https://mechanic-city.onrender.com/?test=1';

test.describe('Mechanic City live smoke', () => {
  test('loads game and exposes healthy physics state', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await expect(page.locator('#ai-test-panel')).toBeVisible({ timeout: 15000 });
    const state = await page.evaluate(() => window.MechanicCityTest?.getState?.());
    expect(state).toBeTruthy();
    expect(state.physicsReady).toBe(true);
    expect(state.scene).toBe('city');
    expect(state.cameraMode).toBe(0);
    expect(state.cameraAttached).toBe(true);
    expect(errors).toEqual([]);
  });

  test('drive, steer, brake and camera modes change state', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    const state = async () => page.evaluate(() => window.MechanicCityTest.getState());

    await page.evaluate(() => window.MechanicCityTest.action('gear', 'D'));
    const before = await state();

    await page.evaluate(() => window.MechanicCityTest.action('gas', true));
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.MechanicCityTest.action('gas', false));
    const afterGas = await state();

    expect(afterGas.physicsReady).toBe(true);
    expect(Math.abs(afterGas.position.x - before.position.x) + Math.abs(afterGas.position.z - before.position.z)).toBeGreaterThan(0.1);

    await page.evaluate(() => window.MechanicCityTest.action('right', true));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.MechanicCityTest.action('right', false));
    const afterSteer = await state();
    expect(afterSteer.heading).not.toBe(before.heading);

    await page.evaluate(() => window.MechanicCityTest.action('brake', true));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.MechanicCityTest.action('brake', false));
    const afterBrake = await state();
    expect(afterBrake.speed).toBeLessThanOrEqual(afterGas.speed + 1);

    for (const mode of [1, 2, 0]) {
      await page.evaluate((m) => window.MechanicCityTest.action('camera', m), mode);
      const s = await state();
      expect(s.cameraMode).toBe(mode);
    }
  });

  test('service actions and scene routing work', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    const state = async () => page.evaluate(() => window.MechanicCityTest.getState());

    const before = await state();
    await page.evaluate(() => window.MechanicCityTest.action('refuel'));
    expect((await state()).fuel).toBe(100);

    await page.evaluate(() => window.MechanicCityTest.action('repair'));
    expect((await state()).damage).toBe(0);

    for (const scene of ['market', 'junkyard', 'dealer', 'garage', 'jobs', 'settings', 'city']) {
      await page.evaluate((s) => window.MechanicCityTest.action('scene', s), scene);
      expect((await state()).scene).toBe(scene);
    }

    expect(before.car.name).toBeTruthy();
  });
});

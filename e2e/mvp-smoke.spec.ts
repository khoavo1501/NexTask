import { expect, test } from '@playwright/test';

test('owner login, demo board and report tab', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@nextask.local');
  await page.getByLabel('Mật khẩu').fill('nextask-local-owner-2026');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Board của bạn' })).toBeVisible();
  await page.getByRole('link', { name: /NexTask Demo Retro/ }).click();
  await expect(page.getByRole('heading', { name: 'NexTask Demo Retro' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Backlog' })).toBeVisible();

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Quy tắc board' })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng' }).click();

  await page.getByRole('button', { name: 'Báo cáo' }).click();
  await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Quy tắc board' })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('heading', { name: 'Quy tắc board' })).toBeHidden();
});

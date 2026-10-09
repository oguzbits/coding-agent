import { expect, test, type Page } from '@playwright/test';

const password = 'correct-horse-battery';

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'No account yet? Create one' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Account created')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
}

async function startChat(page: Page, message: string) {
  await page.getByLabel('Project name').fill('demo');
  await page.getByLabel('Message').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/c\//);
}

test('sign up, create a project, approve a file change and see the file', async ({ page }) => {
  await signUp(page);
  await startChat(page, 'write hello.txt hi there');

  await expect(page.getByText('+hi there')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Done\. Result: Created hello\.txt/)).toBeVisible();

  await page.getByRole('button', { name: 'Files' }).click();
  const files = page.getByRole('complementary', { name: 'Files' });
  await files.getByRole('button', { name: 'hello.txt', exact: true }).click();
  await expect(files.getByText('hi there')).toBeVisible();
});

test('reloading during a run keeps the conversation and the run', async ({ page }) => {
  await signUp(page);
  await startChat(page, 'slow');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.reload();
  await expect(page.locator('p', { hasText: /^slow$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByText('Slow answer.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});

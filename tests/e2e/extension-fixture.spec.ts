import { expect, test } from '@playwright/test';

interface BrowserSnapshot {
  title: string;
  projectName?: string;
  messages: { role: string; text: string }[];
  contentHash: string;
}

test('captures a rendered conversation fixture in Chromium', async ({ page }) => {
  await page.goto('/fixture/index.html');
  await page.waitForFunction(() => 'capturedFixture' in window);

  const snapshot = await page.evaluate(
    () =>
      (
        window as Window & {
          capturedFixture?: BrowserSnapshot;
        }
      ).capturedFixture,
  );

  expect(snapshot).toMatchObject({
    title: 'Bridge browser fixture',
    projectName: 'Context tools',
    messages: [
      { role: 'user', text: 'First virtualized message.' },
      { role: 'assistant', text: 'Second virtualized message.' },
      { role: 'user', text: 'Duplicate text.' },
      { role: 'user', text: 'Duplicate text.' },
      { role: 'assistant', text: 'Streaming response complete.' },
    ],
  });
  expect(snapshot?.contentHash).toMatch(/^[a-f0-9]{64}$/);
});

test('prepares an assisted handoff without submitting and clears only exact content', async ({
  page,
}) => {
  await page.goto('/fixture/index.html');
  await page.waitForFunction(() => 'assistedFixture' in window);

  const result = await page.evaluate(
    () =>
      (
        window as Window & {
          assistedFixture?: {
            inserted: boolean;
            submitted: boolean;
            streaming: boolean;
            inspection: unknown;
            refusedWrongClear: boolean;
            cleared: boolean;
            finalComposerText: string;
          };
        }
      ).assistedFixture,
  );

  expect(result).toMatchObject({
    inserted: true,
    submitted: false,
    streaming: true,
    inspection: {
      page: { mode: 'new' },
      composer: { available: true, readOnly: false },
    },
    refusedWrongClear: true,
    cleared: true,
    finalComposerText: '',
  });
  expect((result?.inspection as { composer?: { textHash?: string } }).composer?.textHash).toMatch(
    /^[a-f0-9]{64}$/,
  );
});

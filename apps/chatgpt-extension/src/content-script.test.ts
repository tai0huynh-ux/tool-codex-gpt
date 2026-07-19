// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSubmitEffectGuard } from './content-script';

describe('content-script submit idempotency', () => {
  it('reserves an effect before async checks so concurrent requests cannot click twice', async () => {
    let resolveFirst: ((value: { submitted: true; textHash: string }) => void) | undefined;
    const submit = vi.fn(
      () =>
        new Promise<{ submitted: true; textHash: string }>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const guard = createSubmitEffectGuard();

    const first = guard('effect-1', submit);
    await expect(guard('effect-1', submit)).resolves.toEqual({
      submitted: false,
      code: 'DUPLICATE_EFFECT',
    });
    expect(submit).toHaveBeenCalledTimes(1);

    resolveFirst?.({ submitted: true, textHash: 'a'.repeat(64) });
    await expect(first).resolves.toEqual({ submitted: true, textHash: 'a'.repeat(64) });
    await expect(guard('effect-1', submit)).resolves.toEqual({
      submitted: false,
      code: 'DUPLICATE_EFFECT',
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('allows a corrected retry only after a deterministic pre-click rejection', async () => {
    const guard = createSubmitEffectGuard();
    const rejected = vi.fn(() =>
      Promise.resolve({ submitted: false as const, code: 'HASH_MISMATCH' as const }),
    );
    const accepted = vi.fn(() =>
      Promise.resolve({ submitted: true as const, textHash: 'b'.repeat(64) }),
    );

    await expect(guard('effect-2', rejected)).resolves.toEqual({
      submitted: false,
      code: 'HASH_MISMATCH',
    });
    await expect(guard('effect-2', accepted)).resolves.toEqual({
      submitted: true,
      textHash: 'b'.repeat(64),
    });
  });
});

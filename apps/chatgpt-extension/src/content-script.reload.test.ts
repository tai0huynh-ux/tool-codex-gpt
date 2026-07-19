// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { schedulePageReload } from './content-script';

describe('content-script page reload', () => {
  it('schedules a reload and acknowledges before navigation', () => {
    const reload = vi.fn();
    let callback: (() => void) | undefined;
    const result = schedulePageReload((next) => {
      callback = next;
      return 1;
    }, reload);

    expect(result).toEqual({ reloaded: true });
    expect(reload).not.toHaveBeenCalled();
    callback?.();
    expect(reload).toHaveBeenCalledOnce();
  });
});

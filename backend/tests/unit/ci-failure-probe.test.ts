import { describe, expect, it } from 'vitest';

describe('L5-05 CI failure verification', () => {
  it('intentionally fails to verify GitHub Actions', () => {
    expect(1).toBe(2);
  });
});
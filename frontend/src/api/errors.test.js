import { describe, it, expect } from 'vitest';
import { API_UNAVAILABLE_MESSAGE, CREATE_PROJECT_FAILED_MESSAGE, isNetworkError } from './errors';

describe('api errors helpers', () => {
  it('exposes stable user-facing messages', () => {
    expect(typeof API_UNAVAILABLE_MESSAGE).toBe('string');
    expect(API_UNAVAILABLE_MESSAGE.length).toBeGreaterThan(0);

    expect(typeof CREATE_PROJECT_FAILED_MESSAGE).toBe('string');
    expect(CREATE_PROJECT_FAILED_MESSAGE).toContain('Не удалось создать проект');
  });

  it('detects network errors when axios error has no response', () => {
    expect(isNetworkError(undefined)).toBe(true);
    expect(isNetworkError(null)).toBe(true);
    expect(isNetworkError({})).toBe(true);

    expect(isNetworkError({ response: { status: 500 } })).toBe(false);
    expect(isNetworkError({ response: { status: 401 } })).toBe(false);
  });
});

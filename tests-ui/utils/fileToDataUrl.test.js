import { describe, test, expect } from 'vitest';
import { fileToDataUrl } from '../../src/utils/fileToDataUrl.js';

describe('fileToDataUrl', () => {
  test('lit un Blob en data URL base64', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const url = await fileToDataUrl(blob);
    expect(url).toMatch(/^data:text\/plain(;base64)?,/);
    // "hello" en base64 = aGVsbG8=
    expect(url).toContain('aGVsbG8=');
  });

  test('résout une chaîne (jamais null)', async () => {
    const url = await fileToDataUrl(new Blob([], { type: 'application/octet-stream' }));
    expect(typeof url).toBe('string');
  });
});

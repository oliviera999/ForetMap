import { describe, test, expect } from 'vitest';
import {
  DEFAULT_CONTENT_LIBRARY_LIMITS,
  validateContentLibrarySelection,
} from '../../src/gl/utils/contentLibraryClient.js';
import { formatBytesLabel } from '../../src/gl/services/apiGLUpload.js';

function mockFile(name, size) {
  return { name, size };
}

describe('contentLibraryClient', () => {
  test('validateContentLibrarySelection refuse un fichier au-delà de 32 Mo', () => {
    const file = mockFile('gros.xlsx', DEFAULT_CONTENT_LIBRARY_LIMITS.maxFileBytes + 1);
    const result = validateContentLibrarySelection([file]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('gros.xlsx');
    expect(result.errors[0]).toContain(formatBytesLabel(DEFAULT_CONTENT_LIBRARY_LIMITS.maxFileBytes));
  });

  test('validateContentLibrarySelection accepte un fichier sous la limite', () => {
    const file = mockFile('ok.png', 1024);
    const result = validateContentLibrarySelection([file]);
    expect(result.ok).toBe(true);
    expect(result.resolved.mode).toBe('files');
  });

  test('validateContentLibrarySelection privilégie le ZIP et avertit', () => {
    const zip = mockFile('lot.zip', 1024);
    const other = mockFile('photo.png', 512);
    const result = validateContentLibrarySelection([zip, other]);
    expect(result.ok).toBe(true);
    expect(result.resolved.mode).toBe('archive');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('apiGLUpload formatBytesLabel', () => {
  test('affiche Mo pour les gros fichiers', () => {
    expect(formatBytesLabel(28 * 1024 * 1024)).toBe('28 Mo');
  });
});

import { describe, test, expect } from 'vitest';
import {
  isGlStaffAuth,
  canGlStaffImpersonate,
  glImpersonationBannerCopy,
} from '../../src/gl/utils/glStaffView.js';

describe('glStaffView', () => {
  test('isGlStaffAuth exclut impersonation', () => {
    expect(isGlStaffAuth({ userType: 'gl_admin', roleSlug: 'gl_mj' })).toBe(true);
    expect(isGlStaffAuth({ userType: 'gl_admin', roleSlug: 'gl_mj', impersonating: true })).toBe(
      false,
    );
    expect(isGlStaffAuth({ userType: 'gl_player', roleSlug: 'gl_player' })).toBe(false);
  });

  test('canGlStaffImpersonate autorise admin et MJ', () => {
    expect(canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'gl_admin' })).toBe(true);
    expect(canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'gl_mj' })).toBe(true);
    expect(canGlStaffImpersonate({ userType: 'gl_player', roleSlug: 'gl_player' })).toBe(false);
  });

  test('glImpersonationBannerCopy adapte les libellés', () => {
    expect(glImpersonationBannerCopy({ roleSlug: 'gl_mj' }).stopLabel).toContain('MJ');
    expect(glImpersonationBannerCopy({ roleSlug: 'gl_admin' }).stopLabel).toContain('admin');
  });
});

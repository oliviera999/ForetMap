import { describe, test, expect } from 'vitest';
import {
  GL_KIOSK_IDLE_DEFAULT_SECONDS,
  GL_KIOSK_IDLE_MAX_SECONDS,
  GL_KIOSK_IDLE_MIN_SECONDS,
  glDemoLandingTab,
  isGlDemoRequested,
  readGlDemoModeFromSearch,
} from '../../src/gl/utils/glDemoMode.js';
import { filterGlTabs } from '../../src/gl/utils/glAppShellHelpers.js';

describe('glDemoMode — lecture de l’URL', () => {
  test('sans paramètre : aucun mode', () => {
    const mode = readGlDemoModeFromSearch('');
    expect(mode).toEqual({
      profile: null,
      kiosk: false,
      idleSeconds: GL_KIOSK_IDLE_DEFAULT_SECONDS,
    });
    expect(isGlDemoRequested(mode)).toBe(false);
    expect(glDemoLandingTab(mode)).toBe('discovery');
  });

  test('?demo=parents : vitrine parents, atterrissage sur l’onglet parents', () => {
    const mode = readGlDemoModeFromSearch('?demo=Parents');
    expect(mode.profile).toBe('parents');
    expect(mode.kiosk).toBe(false);
    expect(isGlDemoRequested(mode)).toBe(true);
    expect(glDemoLandingTab(mode)).toBe('parents');
  });

  test('un profil inconnu est ignoré', () => {
    expect(readGlDemoModeFromSearch('?demo=eleves').profile).toBeNull();
    expect(isGlDemoRequested(readGlDemoModeFromSearch('?demo=eleves'))).toBe(false);
  });

  test('?kiosque=1 (et alias kiosk, oui, true) : borne', () => {
    expect(readGlDemoModeFromSearch('?kiosque=1').kiosk).toBe(true);
    expect(readGlDemoModeFromSearch('?kiosk=true').kiosk).toBe(true);
    expect(readGlDemoModeFromSearch('?kiosque=oui').kiosk).toBe(true);
    expect(readGlDemoModeFromSearch('?kiosque=0').kiosk).toBe(false);
    expect(glDemoLandingTab(readGlDemoModeFromSearch('?kiosque=1'))).toBe('discovery');
  });

  test('?inactivite= : bornée entre le minimum et le maximum', () => {
    expect(readGlDemoModeFromSearch('?kiosque=1&inactivite=45').idleSeconds).toBe(45);
    expect(readGlDemoModeFromSearch('?kiosque=1&inactivite=5').idleSeconds).toBe(
      GL_KIOSK_IDLE_MIN_SECONDS,
    );
    expect(readGlDemoModeFromSearch('?kiosque=1&inactivite=99999').idleSeconds).toBe(
      GL_KIOSK_IDLE_MAX_SECONDS,
    );
    expect(readGlDemoModeFromSearch('?kiosque=1&inactivite=abc').idleSeconds).toBe(
      GL_KIOSK_IDLE_DEFAULT_SECONDS,
    );
  });

  test('les deux modes se combinent', () => {
    const mode = readGlDemoModeFromSearch('?demo=parents&kiosque=1');
    expect(mode.profile).toBe('parents');
    expect(mode.kiosk).toBe(true);
  });
});

describe('filterGlTabs — onglets d’une session invitée', () => {
  test('Mode Découverte nu : monde, découverte, nature', () => {
    const tabs = filterGlTabs({
      modules: {},
      vitalityEnabled: false,
      showStaffAdminUi: false,
      isGuest: true,
    });
    expect(tabs.map((t) => t.id)).toEqual(['monde-gl', 'discovery', 'nature']);
  });

  test('profil parents : l’onglet « Pour les parents » vient en tête', () => {
    const tabs = filterGlTabs({
      modules: {},
      vitalityEnabled: false,
      showStaffAdminUi: false,
      isGuest: true,
      guestProfile: 'parents',
    });
    expect(tabs.map((t) => t.id)).toEqual(['parents', 'monde-gl', 'discovery', 'nature']);
    expect(tabs[0].label).toBe('Pour les parents');
  });

  test('un profil inconnu retombe sur le Mode Découverte nu', () => {
    const tabs = filterGlTabs({
      modules: {},
      vitalityEnabled: false,
      showStaffAdminUi: false,
      isGuest: true,
      guestProfile: 'autre',
    });
    expect(tabs.map((t) => t.id)).toEqual(['monde-gl', 'discovery', 'nature']);
  });

  test('hors session invitée, le profil est sans effet', () => {
    const tabs = filterGlTabs({
      modules: {},
      vitalityEnabled: false,
      showStaffAdminUi: false,
      isGuest: false,
      guestProfile: 'parents',
    });
    expect(tabs.some((t) => t.id === 'parents')).toBe(false);
  });
});

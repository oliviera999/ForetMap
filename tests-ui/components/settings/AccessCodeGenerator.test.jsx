import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Générateur de code d'accès des plans (réglages du plan public, du plan des personnels et du
 * plan e-nov) : un code aléatoire d'au moins 12 caractères, tiré d'un alphabet sans caractères
 * ambigus, proposé en clair à l'administrateur avant enregistrement.
 */

const apiMock = vi.hoisted(() => vi.fn(async () => ({ ok: true, hasCode: true })));
vi.mock('../../../src/services/api', () => ({ api: apiMock }));
vi.mock('../../../src/components/settings/CategoryIdsMultiSelect.jsx', () => ({
  CategoryIdsMultiSelect: () => null,
}));

const {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_MIN_LENGTH,
  GENERATED_ACCESS_CODE_LENGTH,
  generateAccessCode,
} = await import('../../../src/utils/accessCodeGenerator.js');
const { PlanSettingsPanel } =
  await import('../../../src/components/settings/PlanSettingsPanel.jsx');
const { StaffPlanSettingsPanel } =
  await import('../../../src/components/settings/StaffPlanSettingsPanel.jsx');
const { EnovPlanSettingsPanel } =
  await import('../../../src/components/settings/EnovPlanSettingsPanel.jsx');

const ALPHABET_RE = new RegExp(`^[${ACCESS_CODE_ALPHABET}]+$`);

function getter(values = {}) {
  return (key, fallback) => (key in values ? values[key] : (fallback ?? ''));
}

beforeEach(() => {
  apiMock.mockClear();
});

describe('generateAccessCode', () => {
  it('rend au moins 12 caractères, sans caractère ambigu', () => {
    expect(ACCESS_CODE_MIN_LENGTH).toBe(12);
    expect(GENERATED_ACCESS_CODE_LENGTH).toBeGreaterThanOrEqual(ACCESS_CODE_MIN_LENGTH);
    for (const ambiguous of ['0', 'o', 'O', '1', 'l', 'I', 'i']) {
      expect(ACCESS_CODE_ALPHABET.includes(ambiguous)).toBe(false);
    }
    for (let round = 0; round < 50; round += 1) {
      const code = generateAccessCode();
      expect(code).toHaveLength(GENERATED_ACCESS_CODE_LENGTH);
      expect(code).toMatch(ALPHABET_RE);
    }
  });

  it('écarte les octets qui biaiseraient le tirage (pas de modulo biaisé)', () => {
    // Un faux générateur qui ne rend que des octets « hors plage » puis des zéros : seuls les
    // zéros doivent être retenus, d'où un code fait de la première lettre de l'alphabet.
    let call = 0;
    const fakeCrypto = {
      getRandomValues(buffer) {
        call += 1;
        buffer.fill(call === 1 ? 255 : 0);
        return buffer;
      },
    };
    const code = generateAccessCode(12, fakeCrypto);
    expect(code).toBe(ACCESS_CODE_ALPHABET[0].repeat(12));
  });

  it('refuse une longueur inférieure au minimum', () => {
    expect(() => generateAccessCode(8)).toThrow(/12/);
  });
});

describe.each([
  ['plan public', PlanSettingsPanel, '/api/settings/admin/plan-access-code'],
  ['plan des personnels', StaffPlanSettingsPanel, '/api/settings/admin/staff-plan-access-code'],
  ['plan e-nov', EnovPlanSettingsPanel, '/api/settings/admin/enov-plan-access-code'],
])('réglages du %s : bouton « Générer un code »', (_label, Panel, endpoint) => {
  it('propose un code lisible, puis l’enregistre tel quel', async () => {
    render(<Panel get={getter()} saveSetting={vi.fn()} canWrite onMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Générer un code' }));
    const input = screen.getByLabelText('Nouveau code d’accès');
    const generated = input.value;
    expect(generated.length).toBeGreaterThanOrEqual(12);
    expect(generated).toMatch(ALPHABET_RE);
    // Affiché en clair : l'administrateur doit pouvoir le recopier avant de l'enregistrer.
    expect(input.getAttribute('type')).toBe('text');
    expect(screen.getByText(/Notez ce code/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le code' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(endpoint, 'POST', { code: generated }),
    );
  });

  it('annonce le minimum de 12 caractères', () => {
    render(<Panel get={getter()} saveSetting={vi.fn()} canWrite />);
    const input = screen.getByLabelText('Nouveau code d’accès');
    expect(input.getAttribute('minlength')).toBe('12');
    expect(input.getAttribute('placeholder')).toMatch(/12 caractères minimum/);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GatingPolicyEditor } from '../../src/shared/components/GatingPolicyEditor.jsx';

describe('GatingPolicyEditor', () => {
  it('affiche la phrase Appliqué et le bouton enregistrer', () => {
    const onSave = vi.fn();
    render(
      <GatingPolicyEditor
        product="fm"
        layer="resource"
        site={{
          defaultMode: 'any',
          defaultRequiredCorrect: 1,
          allowedWrongAttempts: 0,
          maxQuestionsPerSession: 3,
          retryCooldownDays: 3,
          cooldownScope: 'resource',
        }}
        policy={{ mode: 'inherit' }}
        effective={{
          mode: 'any',
          requiredCorrect: 1,
          allowedWrongAttempts: 0,
          maxQuestionsPerSession: 3,
          retryCooldownDays: 3,
          cooldownScope: 'resource',
        }}
        gatingCount={2}
        onSave={onSave}
      />,
    );
    expect(screen.getByText(/Appliqué/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enregistrer la politique/i })).toBeTruthy();
  });
});

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BiodivPedagoProvider, useBiodivPedago } from '../../src/contexts/BiodivPedagoContext.jsx';

/**
 * Niveau de l'apprenant côté navigateur (miroir de lib/pedago/learnerLevel.js) : une seule
 * échelle, la classe prime sur les anciens réglages, la séance en cours impose son niveau
 * (décisions du mainteneur du 25/09/2026, questions 4 et 5).
 */

function Probe() {
  const { level, curriculumNiveaux, learner, managementView } = useBiodivPedago();
  return (
    <dl>
      <dd data-testid="level">{level}</dd>
      <dd data-testid="niveaux">{curriculumNiveaux ? curriculumNiveaux.join(',') : 'tous'}</dd>
      <dd data-testid="source">{learner?.sources?.niveau || ''}</dd>
      <dd data-testid="palier">{learner?.maxPalier == null ? 'aucun' : learner.maxPalier}</dd>
      <dd data-testid="gestion">{managementView ? 'oui' : 'non'}</dd>
    </dl>
  );
}

const text = (id) => screen.getByTestId(id).textContent;

beforeEach(() => {
  sessionStorage.clear();
});

describe('BiodivPedagoProvider — échelle unique', () => {
  test('élève de 6ᵉ : cycle 3, affichage Collège', () => {
    render(
      <BiodivPedagoProvider classCurriculumNiveaux={['cycle3']}>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('niveaux')).toBe('cycle3');
    expect(text('source')).toBe('classe');
    expect(text('palier')).toBe('1');
  });

  test('la classe prime sur un ancien réglage Collège de la carte', () => {
    render(
      <BiodivPedagoProvider classCurriculumNiveaux={['seconde']} mapLevel="college">
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('lycee');
    expect(text('niveaux')).toBe('cycle3,cycle4,seconde');
  });

  test('séance lycée en cours : elle impose son niveau à un élève de 6ᵉ', () => {
    render(
      <BiodivPedagoProvider
        classCurriculumNiveaux={['cycle3']}
        sessionLevel="lycee"
        sessionNotionNiveau="lycee"
      >
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('lycee');
    expect(text('source')).toBe('seance');
    expect(text('palier')).toBe('5');
  });

  test('séance « tout le collège » : la classe de 6ᵉ garde le cycle 3', () => {
    render(
      <BiodivPedagoProvider
        classCurriculumNiveaux={['cycle3']}
        sessionLevel="college"
        sessionNotionNiveau="college"
      >
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('niveaux')).toBe('cycle3');
    expect(text('source')).toBe('seance');
  });

  test('préférence Collège d’un élève de seconde : affichage simplifié, palier inchangé', () => {
    render(
      <BiodivPedagoProvider classCurriculumNiveaux={['seconde']} userPreference="college">
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('palier')).toBe('3');
  });

  test('compte non élève sans choix ni groupe : cycle 3 (plus de vue complète d’office)', () => {
    render(
      <BiodivPedagoProvider canTeacherPreview staff>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('niveaux')).toBe('cycle3');
    expect(text('source')).toBe('defaut');
    expect(text('palier')).toBe('1');
    expect(text('gestion')).toBe('oui');
  });

  test('compte non élève : le plus haut niveau de ses groupes, puis son choix explicite', () => {
    const { rerender } = render(
      <BiodivPedagoProvider canTeacherPreview staff classCurriculumNiveaux={['cycle3', 'seconde']}>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('lycee');
    expect(text('source')).toBe('classe');
    rerender(
      <BiodivPedagoProvider
        canTeacherPreview
        staff
        contentLevel="complet"
        classCurriculumNiveaux={['cycle3']}
      >
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('universite');
    expect(text('niveaux')).toBe('tous');
    expect(text('source')).toBe('vue_complete');
  });

  test('aperçu de session : passe devant le profil et suspend la vue gestion', () => {
    sessionStorage.setItem('foretmap.biodivPedagoPreview', 'cycle3');
    render(
      <BiodivPedagoProvider canTeacherPreview staff contentLevel="complet">
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('source')).toBe('apercu');
    expect(text('palier')).toBe('1');
    expect(text('gestion')).toBe('non');
  });

  test('élève : le réglage de contenu ne s’applique pas', () => {
    render(
      <BiodivPedagoProvider contentLevel="complet" classCurriculumNiveaux={['cycle3']}>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('source')).toBe('classe');
    expect(text('gestion')).toBe('non');
  });

  test('visite invitée : Collège, même avec une séance', () => {
    render(
      <BiodivPedagoProvider isGuestVisit sessionLevel="lycee">
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('niveaux')).toBe('cycle3,cycle4');
  });
});

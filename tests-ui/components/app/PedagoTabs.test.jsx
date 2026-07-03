import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PedagoTabs } from '../../../src/components/app/PedagoTabs.jsx';

const probes = vi.hoisted(() => ({
  visit: [],
  glossary: [],
  quiz: [],
  quizAdmin: [],
  foodweb: [],
  about: [],
}));
vi.mock('../../../src/components/visit-views', () => ({
  VisitView: (props) => {
    probes.visit.push(props);
    return <div data-testid="visit-view" />;
  },
}));
vi.mock('../../../src/components/pedago-views', () => ({
  GlossaryView: (props) => {
    probes.glossary.push(props);
    return <div data-testid="glossary-view" />;
  },
  QuizView: (props) => {
    probes.quiz.push(props);
    return <div data-testid="quiz-view" />;
  },
  QuizAdminView: (props) => {
    probes.quizAdmin.push(props);
    return <div data-testid="quiz-admin-view" />;
  },
  FoodWebView: (props) => {
    probes.foodweb.push(props);
    return <div data-testid="foodweb-view" />;
  },
}));
vi.mock('../../../src/components/about-views', () => ({
  AboutView: (props) => {
    probes.about.push(props);
    return <div data-testid="about-view" />;
  },
}));

const baseProps = {
  isTeacher: false,
  tab: 'map',
  visitEnabled: true,
  student: { id: 'S1', visit_mascot_catalog_id: 7 },
  tutorials: [{ id: 't1' }],
  activeMapId: 'm1',
  zones: [{ id: 'z1' }],
  markers: [{ id: 'k1' }],
  onForceLogout: vi.fn(),
  onOpenPlantCatalogPreview: vi.fn(),
  onOpenGlossaryTerm: vi.fn(),
  onOpenQuizQuestion: vi.fn(),
  glossarySelectedCode: 'HUMUS',
  onGlossarySelectedCodeChange: vi.fn(),
  quizInitialQuestionCode: 'Q1',
  maps: [{ id: 'm1' }],
  foodWebHighlightPlantId: 42,
  canManageFoodWeb: false,
  appVersion: '1.77.0',
};

describe('PedagoTabs', () => {
  beforeEach(() => {
    Object.values(probes).forEach((arr) => {
      arr.length = 0;
    });
  });

  test('onglet hors périmètre : ne rend rien', () => {
    const { container } = render(<PedagoTabs {...baseProps} tab="plants" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('visite : props câblées et mascotte de profil dérivée du student', async () => {
    render(<PedagoTabs {...baseProps} tab="visit" />);
    expect(await screen.findByTestId('visit-view')).toBeInTheDocument();
    expect(probes.visit[0]).toMatchObject({
      isTeacher: false,
      initialMapId: 'm1',
      profileVisitMascotId: 7,
    });
    expect(probes.visit[0].availableTutorials).toBe(baseProps.tutorials);
    expect(probes.visit[0].catalogTutorials).toBe(baseProps.tutorials);
    expect(probes.visit[0].onOpenMascotPackStudioTab).toBeUndefined();
  });

  test('visite prof : onOpenMascotPackStudioTab transmis', async () => {
    const onOpenStudio = vi.fn();
    render(
      <PedagoTabs {...baseProps} isTeacher tab="visit" onOpenMascotPackStudioTab={onOpenStudio} />,
    );
    expect(await screen.findByTestId('visit-view')).toBeInTheDocument();
    expect(probes.visit[0].onOpenMascotPackStudioTab).toBe(onOpenStudio);
    expect(probes.visit[0].isTeacher).toBe(true);
  });

  test('module visite désactivé : onglet visite vide', () => {
    const { container } = render(<PedagoTabs {...baseProps} tab="visit" visitEnabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('glossaire : code sélectionné et rappels transmis', async () => {
    render(<PedagoTabs {...baseProps} tab="glossary" />);
    expect(await screen.findByTestId('glossary-view')).toBeInTheDocument();
    expect(probes.glossary[0]).toMatchObject({ selectedCode: 'HUMUS' });
    expect(probes.glossary[0].onOpenPlant).toBe(baseProps.onOpenPlantCatalogPreview);
    expect(probes.glossary[0].onSelectedCodeChange).toBe(baseProps.onGlossarySelectedCodeChange);
  });

  test('quiz élève : QuizView (pas la vue admin)', async () => {
    render(<PedagoTabs {...baseProps} tab="quiz" />);
    expect(await screen.findByTestId('quiz-view')).toBeInTheDocument();
    expect(screen.queryByTestId('quiz-admin-view')).toBeNull();
    expect(probes.quiz[0]).toMatchObject({ initialQuestionCode: 'Q1' });
  });

  test('quiz prof : QuizAdminView avec canManageQuiz', async () => {
    render(<PedagoTabs {...baseProps} isTeacher tab="quiz" canManageQuiz />);
    expect(await screen.findByTestId('quiz-admin-view')).toBeInTheDocument();
    expect(screen.queryByTestId('quiz-view')).toBeNull();
    expect(probes.quizAdmin[0]).toMatchObject({ canManageQuiz: true, initialQuestionCode: 'Q1' });
  });

  test('réseau trophique : cartes, surlignage et droit de gestion', async () => {
    render(<PedagoTabs {...baseProps} tab="foodweb" canManageFoodWeb />);
    expect(await screen.findByTestId('foodweb-view')).toBeInTheDocument();
    expect(probes.foodweb[0]).toMatchObject({ highlightPlantId: 42, canManage: true });
    expect(probes.foodweb[0].maps).toBe(baseProps.maps);
  });

  test('à propos : version et rôle transmis', async () => {
    render(<PedagoTabs {...baseProps} isTeacher tab="about" />);
    expect(await screen.findByTestId('about-view')).toBeInTheDocument();
    expect(probes.about[0]).toMatchObject({ appVersion: '1.77.0', isTeacher: true });
  });
});

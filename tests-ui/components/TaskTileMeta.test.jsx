import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskTileMeta } from '../../src/components/tasks/TaskTileMeta.jsx';

const ROLE_TERMS = { studentPlural: 'n3beurs', studentSingular: 'n3beur' };

function renderMeta(task = {}, props = {}) {
  return render(
    <TaskTileMeta
      t={task}
      isTeacher={false}
      roleTerms={ROLE_TERMS}
      proposalMeta={{ proposer: '' }}
      completionMode="any_assignee_done"
      isCollectiveCompletion={false}
      doneCount={0}
      totalCount={0}
      {...props}
    />,
  );
}

describe('TaskTileMeta', () => {
  test('rend les chips de zones, marqueur et projet', () => {
    const { container } = renderMeta({
      zones_linked: [{ id: 'z1', name: 'Verger' }],
      markers_linked: [{ id: 'm1', label: 'Pommier' }],
      project_title: 'Potager',
      required_students: 2,
    });
    expect(container.querySelector('.task-meta')).not.toBeNull();
    expect(screen.getByText('Verger')).toBeInTheDocument();
    expect(screen.getByText('📍 Pommier')).toBeInTheDocument();
    expect(screen.getByText('📁 Potager')).toBeInTheDocument();
  });

  test('côté élève : chip du nombre requis avec le pluriel', () => {
    renderMeta({ required_students: 2 });
    expect(screen.getByText('👤 2 n3beurs')).toBeInTheDocument();
  });

  test('côté formateur : pas de chip « élèves requis », chip proposant si proposée', () => {
    renderMeta(
      { required_students: 2, status: 'proposed' },
      { isTeacher: true, proposalMeta: { proposer: 'Alice' } },
    );
    expect(screen.queryByText(/n3beurs$/)).not.toBeInTheDocument();
    expect(screen.getByText('🙋 Proposée par Alice')).toBeInTheDocument();
  });

  test('chip de départ depuis start_date (date normalisée FR)', () => {
    renderMeta({ start_date: '2026-03-04', required_students: 1 });
    expect(screen.getByText(/🚦 Départ:/)).toBeInTheDocument();
    expect(screen.getByText(/04 mars 2026/)).toBeInTheDocument();
  });

  test('complétion collective : chip de progression doneCount/totalCount', () => {
    renderMeta(
      { required_students: 1 },
      { isCollectiveCompletion: true, doneCount: 1, totalCount: 3 },
    );
    expect(screen.getByText('✅ 1/3 terminés')).toBeInTheDocument();
  });

  test('récurrence hebdo affichée', () => {
    renderMeta({ required_students: 1, recurrence: 'weekly' });
    expect(screen.getByText('🔄 Hebdo')).toBeInTheDocument();
  });
});

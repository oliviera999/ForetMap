// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataList } from '../../src/shared/ui/DataList.jsx';
import { GLDataList } from '../../src/gl/components/ui/GLDataList.jsx';

const columns = [
  { key: 'name', label: 'Nom' },
  { key: 'role', label: 'Rôle' },
];
const rows = [
  {
    key: 1,
    desktopCells: (
      <>
        <td>Ada</td>
        <td>Élève</td>
      </>
    ),
    mobileCells: <p>Ada — Élève</p>,
  },
];

describe('DataList (kit partagé)', () => {
  test('tableau (bureau) et cartes (mobile) rendus en parallèle, en-têtes de colonne', () => {
    const { container } = render(<DataList columns={columns} rows={rows} caption="Élèves" />);
    expect(container.querySelectorAll('.fm-data-list__desktop th[scope="col"]')).toHaveLength(2);
    expect(container.querySelector('.fm-data-list__desktop tbody td').textContent).toBe('Ada');
    expect(container.querySelector('.fm-data-list__mobile .fm-data-card').textContent).toContain(
      'Ada — Élève',
    );
    expect(container.querySelector('caption.fm-visually-hidden').textContent).toBe('Élèves');
  });

  test('liste vide : message dans le tableau et dans une carte', () => {
    const { container } = render(<DataList columns={columns} rows={[]} emptyLabel="Rien." />);
    expect(container.querySelector('tbody td').getAttribute('colspan')).toBe('2');
    expect(container.querySelector('tbody td').textContent).toBe('Rien.');
    expect(container.querySelector('.fm-data-card p').textContent).toBe('Rien.');
  });

  test('GLDataList : classes G&L historiques en plus des neutres', () => {
    const { container } = render(<GLDataList columns={columns} rows={rows} />);
    expect(container.querySelector('.gl-data-list.fm-data-list')).not.toBeNull();
    expect(container.querySelector('.gl-admin-table.gl-data-table.fm-data-table')).not.toBeNull();
    expect(container.querySelector('.gl-data-card.fm-data-card')).not.toBeNull();
  });
});

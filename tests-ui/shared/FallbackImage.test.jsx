import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FallbackImage, thumbCandidates } from '../../src/shared/components/FallbackImage.jsx';

describe('thumbCandidates', () => {
  it('essaie la vignette serveur avant l’original pour un upload public', () => {
    expect(thumbCandidates('/uploads/tasks/12.jpg', { thumbWidth: 520 })).toEqual([
      '/uploads/tasks/12.thumb.jpg',
      '/uploads/tasks/12.jpg',
    ]);
  });

  it('sans largeur, ne propose que l’original', () => {
    expect(thumbCandidates('/uploads/tasks/12.jpg')).toEqual(['/uploads/tasks/12.jpg']);
  });

  it('place la vignette explicite en tête et dédoublonne', () => {
    expect(
      thumbCandidates('/uploads/zones/a.jpg', { thumbSrc: '/uploads/zones/a.jpg', thumbWidth: 0 }),
    ).toEqual(['/uploads/zones/a.jpg']);
  });

  it('vide si aucune adresse', () => {
    expect(thumbCandidates('')).toEqual([]);
  });
});

describe('FallbackImage', () => {
  it('passe à l’original quand la vignette échoue, puis au repli', () => {
    const onAllFailed = vi.fn();
    render(
      <FallbackImage
        src="/uploads/tasks/12.jpg"
        thumbWidth={520}
        alt="Couverture"
        onAllFailed={onAllFailed}
        fallback={<span>Photo indisponible</span>}
      />,
    );
    const first = screen.getByAltText('Couverture');
    expect(first.getAttribute('src')).toBe('/uploads/tasks/12.thumb.jpg');
    fireEvent.error(first);
    const second = screen.getByAltText('Couverture');
    expect(second.getAttribute('src')).toBe('/uploads/tasks/12.jpg');
    expect(onAllFailed).not.toHaveBeenCalled();
    fireEvent.error(second);
    expect(screen.queryByAltText('Couverture')).toBeNull();
    expect(screen.getByText('Photo indisponible')).toBeTruthy();
    expect(onAllFailed).toHaveBeenCalledTimes(1);
  });

  it('affiche directement le repli sans adresse', () => {
    render(<FallbackImage src="" fallback={<span>Rien</span>} />);
    expect(screen.getByText('Rien')).toBeTruthy();
  });
});

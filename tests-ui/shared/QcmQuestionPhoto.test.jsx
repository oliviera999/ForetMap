import { describe, test, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QcmQuestionPhoto } from '../../src/shared/qcm/QcmQuestionPhoto.jsx';

const PRESENTATION = {
  photoUrl: 'https://example.test/abeille.jpg',
  photoCredit: 'Wikimedia Commons',
  photoLicence: 'CC BY-SA 4.0',
  photoLegende: 'Abeille',
};

describe('QcmQuestionPhoto', () => {
  test('ne rend rien sans photo', () => {
    const { container } = render(<QcmQuestionPhoto presentation={{ photoCredit: 'X' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('affiche le crédit et la licence sous l’image', () => {
    const { container } = render(<QcmQuestionPhoto presentation={PRESENTATION} />);
    expect(container.querySelector('img')).toHaveAttribute('src', PRESENTATION.photoUrl);
    expect(screen.getByText('Wikimedia Commons — CC BY-SA 4.0')).toBeInTheDocument();
  });

  test('la légende reste cachée côté élève (elle vaut souvent la réponse)', () => {
    render(<QcmQuestionPhoto presentation={PRESENTATION} />);
    expect(screen.queryByText(/Abeille/)).not.toBeInTheDocument();
  });

  test('la légende est visible quand elle est demandée (aperçu professeur)', () => {
    render(<QcmQuestionPhoto presentation={PRESENTATION} showLegende />);
    expect(screen.getByText('Abeille')).toBeInTheDocument();
  });

  test('l’alternative textuelle reste vide pour ne pas divulguer la réponse', () => {
    const { container } = render(<QcmQuestionPhoto presentation={PRESENTATION} showLegende />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    // alt vide ⇒ image décorative pour les lecteurs d'écran : elle ne souffle pas la réponse.
    expect(screen.queryByRole('img')).toBeNull();
  });

  test('image introuvable : la figure disparaît, crédit compris (pas d’icône cassée)', () => {
    const { container } = render(<QcmQuestionPhoto presentation={PRESENTATION} />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('figure')).toBeNull();
    expect(screen.queryByText(/Wikimedia Commons/)).toBeNull();
  });

  test('photo Wikimedia : vignette dimensionnée d’abord, décodage asynchrone', () => {
    const { container } = render(
      <QcmQuestionPhoto
        presentation={{
          photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Abeille.jpg',
        }}
      />,
    );
    const img = container.querySelector('img');
    // Relais local éventuel : l'URL Wikimedia peut arriver encodée dans `?url=`.
    expect(decodeURIComponent(img.getAttribute('src'))).toMatch(
      /\/thumb\/a\/ab\/Abeille\.jpg\/960px-Abeille\.jpg$/,
    );
    expect(img).toHaveAttribute('decoding', 'async');
  });

  test('pas de légende de figure quand ni crédit ni licence', () => {
    const { container } = render(
      <QcmQuestionPhoto presentation={{ photoUrl: 'https://example.test/x.jpg' }} />,
    );
    expect(container.querySelector('figcaption')).toBeNull();
  });
});

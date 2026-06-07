import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLFeuilletDiscoveryPopover } from '../../src/gl/components/GLFeuilletDiscoveryPopover.jsx';

describe('GLFeuilletDiscoveryPopover', () => {
  test('affiche l\'illustration quand imageUrl est présent', () => {
    const imageUrl = '/uploads/media-library/image/scene-test.png';
    render(
      <GLFeuilletDiscoveryPopover
        open
        feuillet={{
          titre: 'Feuillet illustré',
          displayText: 'Texte du feuillet',
          imageUrl,
        }}
        onClose={() => {}}
      />,
    );
    const img = document.querySelector('.gl-feui-discovery__illu img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(imageUrl);
  });

  test('n\'affiche pas d\'illustration sans imageUrl', () => {
    render(
      <GLFeuilletDiscoveryPopover
        open
        feuillet={{
          titre: 'Feuillet texte',
          displayText: 'Texte seul',
        }}
        onClose={() => {}}
      />,
    );
    expect(document.querySelector('.gl-feui-discovery__illu img')).toBeNull();
    expect(screen.getByText('Texte seul')).toBeTruthy();
  });
});

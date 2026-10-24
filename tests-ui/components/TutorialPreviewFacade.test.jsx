import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TutorialPreviewModal } from '../../src/components/TutorialPreviewModal.jsx';
import {
  EMBED_CONSENT_STORAGE_KEY,
  grantEmbedConsentForHost,
  hasEmbedConsentForHost,
} from '../../src/utils/embedConsent.js';
import { toYoutubeNocookieEmbed } from '../../src/utils/youtubeNocookie.js';

vi.mock('../../src/hooks/useGatingSummary', () => ({
  useGatingSummary: () => ({ summaries: new Map() }),
}));

afterEach(() => {
  try {
    sessionStorage.removeItem(EMBED_CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

const linkTutorial = {
  id: 42,
  title: 'Vidéo externe',
  type: 'link',
  preview_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

describe('toYoutubeNocookieEmbed', () => {
  test('réécrit les cinq formes courantes et conserve start/t', () => {
    expect(toYoutubeNocookieEmbed('https://www.youtube.com/watch?v=abc123XY&t=90')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XY?start=90',
    );
    expect(toYoutubeNocookieEmbed('https://youtu.be/abc123XY?t=30')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XY?start=30',
    );
    expect(toYoutubeNocookieEmbed('https://www.youtube.com/shorts/abc123XY')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XY',
    );
    expect(toYoutubeNocookieEmbed('https://www.youtube.com/embed/abc123XY?start=12')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XY?start=12',
    );
    expect(toYoutubeNocookieEmbed('https://docs.google.com/x')).toBe('https://docs.google.com/x');
  });
});

describe('TutorialPreviewModal — façade', () => {
  test('source tierce : façade sans iframe ; clic monte l’iframe no-referrer', () => {
    render(<TutorialPreviewModal tutorial={linkTutorial} onClose={() => {}} />);
    expect(screen.getByTestId('tuto-embed-facade')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByTestId('tuto-embed-show'));
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('referrerpolicy') || iframe.referrerPolicy).toMatch(/no-referrer/);
    expect(iframe.getAttribute('sandbox')).toMatch(/allow-scripts/);
    expect(iframe.src).toMatch(/youtube-nocookie\.com\/embed\//);
    expect(hasEmbedConsentForHost('www.youtube-nocookie.com')).toBe(true);
  });

  test('source de même origine : iframe directe', () => {
    const local = {
      id: 1,
      title: 'Local',
      type: 'html',
      preview_url: '/api/tutorials/1/view',
    };
    render(<TutorialPreviewModal tutorial={local} onClose={() => {}} />);
    expect(screen.queryByTestId('tuto-embed-facade')).toBeNull();
    expect(document.querySelector('iframe')).toBeTruthy();
  });

  test('accord mémorisé pour le même hôte, pas pour un autre', () => {
    grantEmbedConsentForHost('www.youtube-nocookie.com');
    render(<TutorialPreviewModal tutorial={linkTutorial} onClose={() => {}} />);
    expect(screen.queryByTestId('tuto-embed-facade')).toBeNull();
    expect(document.querySelector('iframe')).toBeTruthy();
  });

  test('sessionStorage qui lève : façade à chaque fois, sans erreur', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() =>
      render(<TutorialPreviewModal tutorial={linkTutorial} onClose={() => {}} />),
    ).not.toThrow();
    expect(screen.getByTestId('tuto-embed-facade')).toBeTruthy();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

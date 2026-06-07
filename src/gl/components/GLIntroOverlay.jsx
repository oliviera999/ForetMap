import React, { useCallback, useEffect } from 'react';

import { withAppBase } from '../../services/api.js';

export const GL_INTRO_SEEN_KEY = 'gl_intro_seen';
export const GL_INTRO_DONE_MESSAGE = 'gl-intro-done';

/**
 * Intro cinématique plein écran (iframe statique /gl/intro/).
 */
export function GLIntroOverlay({ open, onComplete }) {
  const finish = useCallback(() => {
    try {
      localStorage.setItem(GL_INTRO_SEEN_KEY, '1');
    } catch (_) {
      /* noop */
    }
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    if (!open) return undefined;
    function onMessage(event) {
      if (event?.data?.type !== GL_INTRO_DONE_MESSAGE) return;
      finish();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, finish]);

  if (!open) return null;

  return (
    <div className="gl-intro-overlay" data-testid="gl-intro-overlay">
      <iframe
        className="gl-intro-overlay__frame"
        title="Introduction Gnomes et Licornes"
        src={withAppBase('/gl/intro/index.html')}
        allow="autoplay"
      />
      <button
        type="button"
        className="gl-intro-overlay__skip"
        data-testid="gl-intro-skip"
        onClick={finish}
      >
        Passer l&apos;intro ›
      </button>
    </div>
  );
}

export function hasSeenGlIntro() {
  try {
    return localStorage.getItem(GL_INTRO_SEEN_KEY) === '1';
  } catch (_) {
    return false;
  }
}

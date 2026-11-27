// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  CopyDeepLinkButton,
  DeepLinkShareFooter,
} from '../../../src/shared/components/CopyDeepLinkButton.jsx';

describe('CopyDeepLinkButton', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('ne rend rien sans URL', () => {
    const { container } = render(<CopyDeepLinkButton url="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('copie l’URL fournie au clic', async () => {
    const href = 'https://exemple.test/?fil=t1&message=p9';
    render(<CopyDeepLinkButton url={href} label="Copier le lien de cette discussion" />);
    const btn = screen.getByTestId('copy-deep-link');
    expect(btn).toHaveAttribute('aria-label', 'Copier le lien de cette discussion');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(href);
    });
    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-label', 'Lien copié');
    });
  });

  test('DeepLinkShareFooter enveloppe le bouton', () => {
    render(
      <DeepLinkShareFooter
        url="https://exemple.test/?tache=42"
        label="Copier le lien de cette tâche"
      />,
    );
    expect(screen.getByTestId('copy-deep-link-footer')).toBeInTheDocument();
    expect(screen.getByTestId('copy-deep-link')).toBeInTheDocument();
  });
});

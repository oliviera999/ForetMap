/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLImageFrameEditor } from '../../src/gl/components/GLImageFrameEditor.jsx';

describe('GLImageFrameEditor', () => {
  it('applique un cadre et renvoie la valeur normalisee', () => {
    const onApply = vi.fn();
    render(
      <GLImageFrameEditor
        open
        context="markdown"
        imageUrl="/uploads/test.jpg"
        initialFrame={{ aspectRatio: '16/9', objectFit: 'cover', focalX: 50, focalY: 50 }}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Focus horizontal/i), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Appliquer cadrage CSS'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const call = onApply.mock.calls[0][0];
    expect(call.frame.aspectRatio).toBe('16/9');
    expect(call.frame.focalX).toBe(20);
  });
});

import { renderHook, act } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { useGLSession } from '../../src/gl/hooks/useGLSession.js';

describe('useGLSession', () => {
  test('hydrate la session depuis localStorage', () => {
    localStorage.setItem(
      'gl_session',
      JSON.stringify({ token: 'abc', auth: { userType: 'gl_player' } }),
    );
    const { result } = renderHook(() => useGLSession());
    expect(result.current.token).toBe('abc');
    expect(result.current.auth?.userType).toBe('gl_player');
  });

  test('updateSession persiste puis expose la session', () => {
    const { result } = renderHook(() => useGLSession());
    act(() => {
      result.current.updateSession({ token: 'new-token', auth: { userType: 'gl_admin' } });
    });
    expect(result.current.token).toBe('new-token');
    expect(JSON.parse(localStorage.getItem('gl_session')).token).toBe('new-token');
  });

  test('logout purge localStorage', () => {
    localStorage.setItem('gl_session', JSON.stringify({ token: 'abc' }));
    const { result } = renderHook(() => useGLSession());
    act(() => result.current.logout());
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem('gl_session')).toBeNull();
  });
});

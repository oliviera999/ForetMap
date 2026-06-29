import { describe, test, expect, vi } from 'vitest';
import {
  resolveTriggerAction,
  getAmbientActions,
  getTapActions,
  runBehaviorAction,
} from '../../src/utils/mascotBehaviorEngine.js';

const entry = {
  dialogProfile: { amb: ['central'] },
  customTriggers: [
    {
      key: 'amb',
      type: 'periodic',
      state: 'yawn',
      durationMs: 1200,
      everyMs: 8000,
      dialog: ['inline'],
    },
    { key: 'tap1', type: 'tap', state: 'dance', durationMs: 900 },
  ],
};

describe('mascotBehaviorEngine', () => {
  test('resolveTriggerAction : bulle centrale prioritaire, durée bornée', () => {
    const a = resolveTriggerAction(entry, entry.customTriggers[0]);
    expect(a).toMatchObject({ key: 'amb', state: 'yawn', durationMs: 1200, everyMs: 8000 });
    expect(a.dialog).toEqual(['central']); // dialogProfile override l'inline
    // durée plancher 200
    expect(resolveTriggerAction(entry, { state: 'x', durationMs: 10 }).durationMs).toBe(200);
  });

  test('getAmbientActions / getTapActions', () => {
    expect(getAmbientActions(entry).map((a) => a.key)).toEqual(['amb']);
    expect(getTapActions(entry).map((a) => a.key)).toEqual(['tap1']);
  });

  test('runBehaviorAction joue l’état et la bulle', () => {
    const playState = vi.fn();
    const showDialog = vi.fn();
    runBehaviorAction(
      { state: 'yawn', durationMs: 1200, dialog: ['salut'] },
      { playState, showDialog },
    );
    expect(playState).toHaveBeenCalledWith('yawn', 1200);
    expect(showDialog).toHaveBeenCalledWith(['salut']);
  });

  test('runBehaviorAction ignore une action sans état', () => {
    const playState = vi.fn();
    runBehaviorAction({ state: '', durationMs: 1000 }, { playState });
    expect(playState).not.toHaveBeenCalled();
  });
});

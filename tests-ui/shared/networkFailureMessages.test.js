import { describe, test, expect } from 'vitest';
import {
  NETWORK_FAILURE_STAFF_MESSAGE,
  NETWORK_FAILURE_USER_MESSAGE,
  networkFailureMessageFor,
} from '../../src/shared/networkFailureMessages.js';
import * as apiForetMap from '../../src/services/api.js';

describe('phrases « serveur injoignable » partagées (ForetMap + G&L)', () => {
  test('une phrase par public', () => {
    expect(networkFailureMessageFor({ staff: true })).toBe(NETWORK_FAILURE_STAFF_MESSAGE);
    expect(networkFailureMessageFor({ staff: true, publicAudience: true })).toBe(
      NETWORK_FAILURE_STAFF_MESSAGE,
    );
    expect(networkFailureMessageFor({ publicAudience: true })).toBe(
      'Le site redémarre, il revient dans un instant.',
    );
    expect(networkFailureMessageFor()).toBe(NETWORK_FAILURE_USER_MESSAGE);
  });

  test('ForetMap les exporte toujours, et dit les mêmes', () => {
    expect(apiForetMap.NETWORK_FAILURE_USER_MESSAGE).toBe(NETWORK_FAILURE_USER_MESSAGE);
    expect(apiForetMap.NETWORK_FAILURE_STAFF_MESSAGE).toBe(NETWORK_FAILURE_STAFF_MESSAGE);
    expect(apiForetMap.networkFailureUserMessage({ dev: false, staff: true })).toBe(
      NETWORK_FAILURE_STAFF_MESSAGE,
    );
    expect(
      apiForetMap.networkFailureUserMessage({ dev: false, staff: false, publicAudience: false }),
    ).toBe(NETWORK_FAILURE_USER_MESSAGE);
  });
});

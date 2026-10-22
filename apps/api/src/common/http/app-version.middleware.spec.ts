import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  appVersionGate,
  compareAppVersions,
  type MinimumAppVersions,
  parseAppVersion,
  UPGRADE_REQUIRED,
} from './app-version.middleware.js';

function run(minimum: MinimumAppVersions, headers: Record<string, string>, path = '/api/items') {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { path, get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn<() => void>();
  appVersionGate(minimum)(req, res as unknown as Response, next);
  return { res, next };
}

const app = (platform: string, version?: string) => ({
  'X-App-Platform': platform,
  ...(version !== undefined && { 'X-App-Version': version }),
});

describe('appVersionGate', () => {
  const minimum = { ios: '2.4.0', android: '2.5.1' };

  it('serves versions at or above the platform minimum', () => {
    for (const version of ['2.4.0', '2.4.1', '2.10.0', '3.0.0', '2.4.0+57']) {
      expect(run(minimum, app('ios', version)).next, version).toHaveBeenCalledOnce();
    }
    expect(run(minimum, app('android', '2.5.1')).next).toHaveBeenCalledOnce();
  });

  it('answers 426 with the error envelope below it, before any other check', () => {
    for (const [platform, version] of [
      ['ios', '2.3.9'],
      ['android', '2.5.0'],
      ['ANDROID', '1.0.0'],
      ['android', '2.5.0-rc.1'],
    ] as const) {
      const { res, next } = run(minimum, app(platform, version));
      expect(next, `${platform} ${version}`).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(426);
      expect(res.json).toHaveBeenCalledWith({ data: null, message: UPGRADE_REQUIRED });
    }
  });

  it('refuses the app without a version it can read once a minimum is set', () => {
    for (const version of [undefined, '', 'latest', 'v2.4.0']) {
      expect(run(minimum, app('ios', version)).res.status, String(version)).toHaveBeenCalledWith(
        426,
      );
    }
  });

  it('lets through what does not come from the app, the probes, and platforms without a minimum', () => {
    expect(run(minimum, {}).next).toHaveBeenCalledOnce();
    expect(run(minimum, app('web', '0.0.1')).next).toHaveBeenCalledOnce();
    expect(run(minimum, app('ios', '1.0.0'), '/api/health/ready').next).toHaveBeenCalledOnce();
    expect(run({ android: '9.0.0' }, app('ios', '1.0.0')).next).toHaveBeenCalledOnce();
    expect(run({}, app('android', '0.0.1')).next).toHaveBeenCalledOnce();
  });

  it('refuses a minimum it cannot read when it is built (the schema accepts none)', () => {
    expect(() => appVersionGate({ ios: 'soon' })).toThrow(/ios/);
  });
});

describe('app versions', () => {
  it('reads 1 to 3 numbers, the missing ones 0, ignoring a pre-release or build suffix', () => {
    expect(parseAppVersion('2')).toEqual([2, 0, 0]);
    expect(parseAppVersion('2.1')).toEqual([2, 1, 0]);
    expect(parseAppVersion(' 2.1.3 ')).toEqual([2, 1, 3]);
    expect(parseAppVersion('2.1.3-rc.1')).toEqual([2, 1, 3]);
    expect(parseAppVersion('2.1.3+45')).toEqual([2, 1, 3]);
    for (const value of ['', 'v2', '2.1.3.4', '2..1', '1234567890.0.0', 'x']) {
      expect(parseAppVersion(value), value).toBeUndefined();
    }
  });

  it('compares numerically, part by part', () => {
    expect(compareAppVersions([2, 10, 0], [2, 9, 9])).toBeGreaterThan(0);
    expect(compareAppVersions([2, 0, 0], [10, 0, 0])).toBeLessThan(0);
    expect(compareAppVersions([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareAppVersions([1, 2, 3], [1, 2, 4])).toBeLessThan(0);
  });
});

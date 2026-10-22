import { describe, expect, it } from 'vitest';
import { STORES, storeLinks } from './stores';

const APP_STORE = 'https://apps.apple.com/app/id000000000';
const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=com.example.templateapp';

describe('storeLinks', () => {
  it('lists no store while no listing exists, as the template ships', () => {
    expect(STORES).toEqual({ appStore: '', googlePlay: '' });
    expect(storeLinks()).toEqual([]);
  });

  it('lists each store with a page, the App Store first', () => {
    expect(storeLinks({ appStore: APP_STORE, googlePlay: GOOGLE_PLAY })).toEqual([
      { id: 'appStore', href: APP_STORE },
      { id: 'googlePlay', href: GOOGLE_PLAY },
    ]);
    expect(storeLinks({ appStore: '', googlePlay: GOOGLE_PLAY })).toEqual([
      { id: 'googlePlay', href: GOOGLE_PLAY },
    ]);
  });

  it.each([
    ['plain HTTP', { appStore: 'http://apps.apple.com/app/id000000000', googlePlay: '' }],
    ['another site', { appStore: '', googlePlay: 'https://play.google.com.evil.example/x' }],
    ['the other store', { appStore: GOOGLE_PLAY, googlePlay: '' }],
    ['not an address', { appStore: 'apps.apple.com/app', googlePlay: '' }],
  ])('fails the build on %s', (_name, stores) => {
    expect(() => storeLinks(stores)).toThrow(/must be an https page of/);
  });
});

import { toInternalPath } from './links';

describe('toInternalPath', () => {
  it.each([
    ['templateapp://items/42', '/items/42'],
    ['templateapp-dev://items/abc_DEF-9', '/items/abc_DEF-9'],
    ['https://app.example.com/items/42?utm_source=mail#top', '/items/42'],
    ['/items/42/', '/items/42'],
    ['items/42', '/items/42'],
    ['templateapp://settings', '/settings'],
    ['templateapp://items', '/'],
    ['templateapp://', '/'],
    ['/', '/'],
  ])('accepts %s as %s', (link, path) => {
    expect(toInternalPath(link)).toBe(path);
  });

  it.each([
    ['an unknown route', 'templateapp://admin/delete-everything'],
    ['an id with forbidden characters', 'templateapp://items/..%2F..%2Fsecret'],
    ['a path traversal', '/items/../settings'],
    ['an over-long id', `/items/${'a'.repeat(65)}`],
    ['nested paths', '/items/42/delete'],
  ])('refuses %s', (_name, link) => {
    expect(toInternalPath(link)).toBeNull();
  });

  it('drops query parameters instead of passing them to screens', () => {
    expect(toInternalPath('templateapp://items/7?admin=true&token=abc')).toBe('/items/7');
  });
});

// The app's pages in the stores, for the download badges of the site
// (components/StoreBadges.astro). REQUIERE CONFIGURACIÓN: once a listing
// exists, its address here (the same as the app's EXPO_PUBLIC_STORE_URL_IOS
// and EXPO_PUBLIC_STORE_URL_ANDROID); while empty, its badge is not shown.
export const STORES = {
  appStore: '',
  googlePlay: '',
} as const satisfies Record<StoreId, string>;

export type StoreId = 'appStore' | 'googlePlay';

export interface StoreLink {
  readonly id: StoreId;
  readonly href: string;
}

const HOSTS: Readonly<Record<StoreId, string>> = {
  appStore: 'apps.apple.com',
  googlePlay: 'play.google.com',
};

/**
 * The stores the app can be downloaded from, in a fixed order. An address
 * that is not an https page of its store fails the build: a badge must never
 * lead anywhere else.
 */
export function storeLinks(stores: Readonly<Record<StoreId, string>> = STORES): StoreLink[] {
  return (Object.keys(HOSTS) as StoreId[]).flatMap((id) => {
    const href = stores[id];
    if (href === '') return [];
    const url = URL.canParse(href) ? new URL(href) : undefined;
    if (url?.protocol !== 'https:' || url.host !== HOSTS[id]) {
      throw new Error(`The ${id} address must be an https page of ${HOSTS[id]}: "${href}"`);
    }
    return [{ id, href }];
  });
}

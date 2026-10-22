// The product's name on the public site: the one place to rename it, the same
// as the app's (apps/mobile/app.config.ts, APP.name). REQUIERE CONFIGURACIÓN.
export const SITE_NAME = 'Template App';

// Where people write about their data: deletion requests from the web
// (pages/delete-account.astro) and privacy questions (pages/privacy.astro).
// An address of the project that someone reads. REQUIERE CONFIGURACIÓN.
export const PRIVACY_EMAIL = 'privacy@example.com';

// The picture shown when a page of the site is shared (Open Graph): a PNG in
// public/, 1200 × 630 as social networks expect. Its texts are the name and
// the language codes, so one picture serves every language. Replace it with
// the product's own, at the same size (a spec checks it).
export const SHARE_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;

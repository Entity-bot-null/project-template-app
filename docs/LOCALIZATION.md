# Localization

**OPTIONAL / PROJECT-SPECIFIC.** The template ships in one language (English) and installs no
internationalization library: many products launch in one language, and the choice of library and
translation workflow belongs to the product. This page says what is already locale-correct, and how
to localize when the product needs it, without rewriting the app.

## What is already locale-correct

| Area             | State                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates            | formatted with `Intl.DateTimeFormat` in the device's locale and time zone (`ItemDetailScreen.tsx`); the API sends ISO timestamps in UTC                                           |
| Layout direction | no physical left/right margins or positions in the code: rows (`flexDirection: 'row'`) mirror by themselves in right-to-left languages; the Android manifest declares RTL support |
| Text size        | text scales with the system setting, capped per variant, and wraps ([ACCESSIBILITY.md](ACCESSIBILITY.md))                                                                         |
| Strings          | inline English in the screens: what changes when the product is translated                                                                                                        |

## When to localize

When the product will be used in more than one language, or in one language other than English
(then translate the template's strings too). Decide it before most screens exist: retrofitting
translations into many screens costs more than writing them translatable from the start.

## How (when the decision is made)

1. **Library**: `expo-localization` (Expo SDK module) for the device's locales, calendar and time
   zone, plus one translation library recorded in an ADR (`docs/adr/`): for example i18next with
   react-i18next, or Lingui. Install with `pnpm exec expo install`.
2. **Locale detection**: `getLocales()` gives the user's preferred languages in order; pick the
   first one the app supports, fall back to the default; follow changes when the app returns to the
   foreground. Let the user override it in Settings if the product needs it (stored in
   `src/store/preferences.ts`).
3. **No hard-coded strings** in screens: every user-facing text comes from the translation files
   by key, including accessibility labels, error messages (`userMessage` in `src/lib/errors.ts`),
   notification texts and validation messages (the Zod schemas of forms).
4. **Translations**: one file per locale; keys by feature (`items.empty.title`); full sentences
   with placeholders, never concatenated fragments (`t('items.saving', { title })`); context notes
   for translators; missing keys fail a test in CI.
5. **Pluralization**: the library's plural rules (ICU / CLDR categories: one, few, many, other),
   never `count === 1 ? … : …`, which is wrong in most languages.
6. **Dates and times**: `Intl.DateTimeFormat` with the active locale; relative times with
   `Intl.RelativeTimeFormat`; never a fixed pattern like `MM/DD`.
7. **Numbers and currency**: `Intl.NumberFormat`; money as a currency code plus an amount in minor
   units (or a decimal string) from the API, formatted with
   `{ style: 'currency', currency }`; never floating-point arithmetic on money.
8. **Time zones**: store and send UTC; show in the device's zone (`getCalendars()[0].timeZone`);
   be explicit in the UI when a time belongs to another zone (an event's venue).
9. **Right-to-left** (Arabic, Hebrew, Persian…): enable it with `expo-localization`'s config plugin
   (`supportsRTL`); keep using start/end instead of left/right; mirror directional icons (arrows,
   back); test with the app forced to RTL. The `Text` component's `align` prop is physical
   (`left`/`right`): use `center` or the default for text that must follow the direction.
10. **Text expansion**: translations are often 30–40 % longer than English (German, Finnish) and
    some scripts are taller: buttons and rows wrap instead of truncating; no fixed widths around
    text. Test with pseudo-localization (accented, padded strings) before real translations exist.
11. **Accessibility with long texts**: test the longest language at the largest font size; labels
    must still fit or wrap, and remain meaningful when read aloud.
12. **Stores**: the store listing, screenshots and the app name per market (App Store Connect and
    Play Console localizations); the iOS app name per language via the app config's `locales`.

## Checklist (when the product is localized)

- [ ] No user-facing string outside the translation files (labels and errors included).
- [ ] Plurals through the library's rules.
- [ ] Dates, numbers and currency through `Intl` with the active locale.
- [ ] Times stored and sent in UTC, shown in the user's zone.
- [ ] RTL tested, if an RTL language is supported.
- [ ] Longest language at the largest font size tested on a small phone.
- [ ] Store listings translated.

# Accessibility

The accessibility gate: what the design system already guarantees, what tests check automatically,
and the checklist every feature passes on a device with TalkBack and VoiceOver. Accessibility is
**CORE**: an app people cannot use with a screen reader, large text or without color is not
releasable, and both stores' review and several markets' laws expect it.

- [What is built in](#what-is-built-in)
- [Topics](#topics)
- [Announcements](#announcements)
- [Automated checks](#automated-checks)
- [Manual testing](#manual-testing)
- [Checklist for every feature](#checklist-for-every-feature)

## What is built in

Use the components of `src/ui` (ESLint keeps React Native's raw `Text`, `TextInput`, `Button`,
`Image` and touchables out of features) and most of this comes for free:

| Component                                  | What it guarantees                                                                                                                                                                              | Tested in             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `Text`                                     | display, title and heading variants are **headers** for screen readers; font size follows the user's setting, capped per variant (`maxFontSizeMultiplier`) so layouts survive the largest sizes | `components.spec.tsx` |
| `Button`                                   | role **button**, the label as its name, **busy** and **disabled** states announced, a **48 dp** minimum touch target in every variant                                                           | `components.spec.tsx` |
| `TextField`                                | the visible label is the input's name; a hint; `aria-invalid` with an error that is announced (`AlertText`)                                                                                     | `components.spec.tsx` |
| `AlertText`                                | a message that appears on screen is **announced**: Android live region, iOS announcement                                                                                                        | `components.spec.tsx` |
| `Icon`                                     | decorative (hidden from screen readers) unless given a label                                                                                                                                    | `components.spec.tsx` |
| `Image`                                    | needs `accessibilityLabel` or `decorative`: forgetting both does not compile                                                                                                                    | `components.spec.tsx` |
| `LoadingState`, `EmptyState`, `ErrorState` | loading is a **progress bar** with a name and busy state; errors are announced, with a retry button                                                                                             | `components.spec.tsx` |
| `OfflineBanner`                            | announced when the connection drops                                                                                                                                                             | `components.spec.tsx` |
| `PermissionPrompt`                         | explains before asking; the actions are buttons                                                                                                                                                 | `components.spec.tsx` |
| Theme tokens                               | every text/background pair meets **WCAG AA contrast** (4.5:1) in light and dark                                                                                                                 | `tokens.spec.ts`      |

## Topics

| Topic                                    | Rule in this template                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Screen readers** (TalkBack, VoiceOver) | every control has a role and a name; groups that read as one thing (a list row) are one accessible element with a combined label; decorative images and icons are hidden                                                                                               |
| **Labels**                               | say what the control does in the user's words ("Share usage analytics", not "Toggle"); no "button" in the label (the role says it)                                                                                                                                     |
| **Roles**                                | `button`, `link`, `header`, `radio` within a `radiogroup`, `switch`, `progressbar`, `alert`, `image`: React Native's roles, set by the components                                                                                                                      |
| **States**                               | `disabled`, `busy`, `checked`, `selected`, `expanded` through `accessibilityState`, never only through color                                                                                                                                                           |
| **Focus**                                | native screens and Expo Router's sheets move screen reader focus into the new screen; after an action that changes the screen without navigating, announce the result (an `AlertText`) or move focus with `AccessibilityInfo.setAccessibilityFocus`                    |
| **Font scaling and Dynamic Type**        | text scales with the system setting up to the cap of its variant; layouts wrap instead of truncating; tested at the largest size                                                                                                                                       |
| **Touch targets**                        | 48 × 48 dp at least (`theme.sizes.touchTarget`), larger than the 44 pt iOS minimum                                                                                                                                                                                     |
| **Contrast**                             | colors only from the theme tokens (lint rule); the contrast test fails a token pair below AA                                                                                                                                                                           |
| **Color-independent information**        | errors have text, not only a red border; selected options have a checked state; status uses words or icons with labels                                                                                                                                                 |
| **Reduced motion**                       | the template has no custom animations; native screen transitions follow the system setting. A custom animation checks `AccessibilityInfo.isReduceMotionEnabled()` and replaces movement with a fade or nothing                                                         |
| **Keyboard and switch access**           | hardware keyboards, Full Keyboard Access (iOS) and Switch Access (Android) move through controls in layout order; forms go to the next field and submit from the keyboard (`returnKeyType`, `onSubmitEditing`)                                                         |
| **Error announcements**                  | field and form errors are `AlertText`: announced when they appear                                                                                                                                                                                                      |
| **Loading announcements**                | a loading screen is a named progress bar; a long operation announces its result when it ends                                                                                                                                                                           |
| **Empty and error states**               | say what happened and what to do next, with an action when there is one                                                                                                                                                                                                |
| **Modals and dialogs**                   | use native presentations (`formSheet`/`modal` routes, `Alert.alert`): focus is trapped and restored by the system. A custom overlay sets `accessibilityViewIsModal` (iOS) and hides the content behind it (`importantForAccessibility="no-hide-descendants"`, Android) |

## Announcements

React Native's `accessibilityRole="alert"` gives no VoiceOver trait on iOS, and live regions exist
on Android only, so a message that appears while the user is on a screen would be heard on one
platform and not the other. `AlertText` (`src/ui/components/AlertText.tsx`) closes the gap: on
Android it is a polite live region, on iOS it calls `AccessibilityInfo.announceForAccessibility`
when the text appears or changes. Use it for every message the user did not navigate to: form and
field errors, failed requests, connection changes, "Saved".

## Automated checks

| Check                                               | Where                                                                      | Catches                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Every control on every screen has a role and a name | `src/a11y.spec.tsx`, with `inaccessibleControls()` from `src/test/a11y.ts` | an unlabeled pressable, switch or input; a touchable without a role    |
| Components: roles, names, states, announcements     | `src/ui/components/components.spec.tsx`                                    | regressions in the design system                                       |
| Contrast of every token pair, both themes           | `src/ui/theme/tokens.spec.ts`                                              | a color change below AA                                                |
| Touch target size                                   | `components.spec.tsx`                                                      | a control below 48 dp                                                  |
| Font scaling caps                                   | `components.spec.tsx`                                                      | text that stops scaling, or scales without a cap                       |
| Tests query by role and label                       | every screen and integration test                                          | a control a screen reader cannot find (the test cannot find it either) |

Add each new screen to `src/a11y.spec.tsx` (in each of its states: loaded, empty, error, with
validation errors). What tests cannot judge (whether a label makes sense, the reading order, how an
announcement sounds) is the manual checklist below.

## Manual testing

Once per feature, on a real device of each platform:

- **TalkBack** (Android: Settings → Accessibility → TalkBack; on an emulator, a Google Play system
  image with the Android Accessibility Suite). Swipe right through the whole screen; double-tap to
  act.
- **VoiceOver** (iOS: Settings → Accessibility → VoiceOver; on the simulator, Xcode's Accessibility
  Inspector). Swipe through; use the rotor for headings.
- **Largest text**: Android Display size and text at maximum; iOS Larger Accessibility Sizes at
  maximum, Bold Text on.
- **Dark mode**, **Reduce motion** on, **grayscale** (iOS Color Filters / Android Color correction):
  nothing depends on color alone.
- **A keyboard** (Bluetooth or the emulator's): every control reachable and usable.

## Checklist for every feature

Copy into the pull request of a feature with UI:

- [ ] Built from `src/ui` components; no new color literal; no raw touchable.
- [ ] Every control has a role and a meaningful name; decorative images and icons are hidden.
- [ ] States (`disabled`, `busy`, `checked`, `selected`) are exposed, not only drawn.
- [ ] Headings mark the screen's sections.
- [ ] Messages that appear without navigation (errors, results, status) use `AlertText`.
- [ ] Loading, empty and error states are handled and named.
- [ ] Works at the largest font size without clipping or overlap.
- [ ] Touch targets are at least 48 dp (including icon-only buttons).
- [ ] Nothing is conveyed by color alone.
- [ ] Custom animations respect Reduce motion.
- [ ] Custom overlays trap and restore focus.
- [ ] The screen is in `src/a11y.spec.tsx`, in each of its states.
- [ ] Tried with TalkBack and VoiceOver: the reading order makes sense and every action can be done.

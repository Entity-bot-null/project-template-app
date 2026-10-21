import { Children, useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { Text, type TextProps } from './Text';

/**
 * A message that appears while the user is on the screen (a field error, a
 * failed request, the offline banner) and must be heard, not only seen
 * (docs/accessibility.md#announcements). Android announces it through its live
 * region. iOS has no live regions, and React Native gives the `alert` role no
 * VoiceOver trait, so the message is announced when it appears or changes.
 */
export function AlertText({ children, ...props }: Omit<TextProps, 'accessibilityRole'>) {
  const message = Children.toArray(children)
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join('');
  useEffect(() => {
    if (Platform.OS === 'ios' && message !== '') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
  return (
    <Text {...props} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

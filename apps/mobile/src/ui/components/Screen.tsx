import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { createStyles } from '../theme/ThemeProvider';

export interface ScreenProps {
  children: ReactNode;
  /** Scrolls the content: forms and long text. Lists bring their own scrolling (FlatList). */
  scroll?: boolean;
  /** Safe-area edges to pad: screens under a header usually skip the top one. */
  edges?: readonly Edge[];
  padded?: boolean;
  testID?: string;
}

const useStyles = createStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: theme.sizes.maxContentWidth,
    alignSelf: 'center',
    gap: theme.spacing.lg,
  },
  padded: { padding: theme.spacing.lg },
}));

/**
 * The frame of every screen: safe areas (notches, edge-to-edge Android),
 * the keyboard (inputs stay visible), a readable width on tablets.
 */
export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom', 'left', 'right'],
  padded = true,
  testID,
}: ScreenProps) {
  const styles = useStyles();
  const content = [styles.content, padded && styles.padded];
  return (
    <SafeAreaView style={styles.root} edges={edges} testID={testID}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, ...content]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

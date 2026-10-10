import { type Ref, useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { createStyles, useTheme } from '../theme/ThemeProvider';
import { AlertText } from './AlertText';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'editable'> {
  label: string;
  /** Shown under the field, announced by screen readers, and turns the border red. */
  error?: string | undefined;
  hint?: string;
  disabled?: boolean;
  ref?: Ref<TextInput>;
}

const useStyles = createStyles((theme) => ({
  container: { gap: theme.spacing.xs },
  input: {
    minHeight: theme.sizes.inputHeight,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
}));

/** A labeled text input: the label is visible and is the accessible name. */
export function TextField({
  label,
  error,
  hint,
  disabled = false,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const borderColor =
    error !== undefined ? theme.colors.danger : focused ? theme.colors.focus : theme.colors.border;
  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        {...(hint !== undefined && { accessibilityHint: hint })}
        aria-invalid={error !== undefined}
        accessibilityState={{ disabled }}
        editable={!disabled}
        placeholderTextColor={theme.colors.textMuted}
        maxFontSizeMultiplier={theme.typography.body.maxFontSizeMultiplier}
        style={[styles.input, { borderColor, borderWidth: focused || error ? 2 : 1 }]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {error !== undefined ? (
        <AlertText variant="caption" tone="danger">
          {error}
        </AlertText>
      ) : (
        hint !== undefined && (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        )
      )}
    </View>
  );
}

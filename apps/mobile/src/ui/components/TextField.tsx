import { type Ref, useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { createStyles, useTheme } from '../theme/ThemeProvider';
import { AlertText } from './AlertText';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'editable'> {
  label: string;
  /**
   * Shown under the field in place of the hint, announced when it appears,
   * read with the field whenever it is focused, and turns the border red.
   */
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

/**
 * A labeled text input: the label is visible and is the accessible name. The
 * error, or else the hint, is the input's accessibility hint: React Native
 * has no "invalid" state (no aria-invalid), so a field the user comes back to
 * is read with what is wrong with it.
 */
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
  const description = error ?? hint;
  const borderColor =
    error !== undefined
      ? theme.colors.danger
      : focused
        ? theme.colors.focus
        : theme.colors.inputBorder;
  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        {...(description !== undefined && { accessibilityHint: description })}
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

import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, Platform, type TextInput } from 'react-native';

import { AppError } from '@/lib/errors';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { renderWithProviders } from '@/test/render';

import { resolveScheme, useTheme } from '../theme/ThemeProvider';
import { themes } from '../theme/theme';
import { AlertText } from './AlertText';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { Image } from './Image';
import { OfflineBanner } from './OfflineBanner';
import { PermissionPrompt } from './PermissionPrompt';
import { Screen } from './Screen';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Text } from './Text';
import { TextField } from './TextField';

describe('Button', () => {
  it('is an accessible button that reports presses', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save" icon="save-outline" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while loading or disabled, and says so', async () => {
    const onPress = jest.fn();
    const view = await renderWithProviders(<Button label="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await userEvent.press(button);
    await view.rerender(<Button label="Save" disabled onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('meets the minimum touch target for every variant', async () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      await renderWithProviders(<Button label={variant} variant={variant} />);
      expect(screen.getByRole('button', { name: variant })).toHaveStyle({
        minHeight: 48,
        minWidth: 48,
      });
    }
  });
});

describe('TextField', () => {
  it('is named by its visible label and announces its error', async () => {
    const view = await renderWithProviders(<TextField label="Email" hint="Your work address" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveProp('accessibilityHint', 'Your work address');
    expect(screen.getByText('Your work address')).toBeOnTheScreen();

    await view.rerender(<TextField label="Email" error="Enter a valid email address" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(screen.getByLabelText('Email')).toHaveProp('aria-invalid', true);
  });

  it('accepts typing, forwards focus events and its ref, and can be disabled', async () => {
    const onChangeText = jest.fn();
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const ref = createRef<TextInput>();
    const view = await renderWithProviders(
      <TextField
        label="Title"
        ref={ref}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Hi');
    expect(onChangeText).toHaveBeenLastCalledWith('Hi');
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
    expect(ref.current).not.toBeNull();
    await view.rerender(<TextField label="Title" disabled />);
    expect(screen.getByLabelText('Title')).toHaveProp('editable', false);
  });
});

describe('states', () => {
  it('shows loading as a busy progress indicator', async () => {
    await renderWithProviders(<LoadingState label="Loading items" />);
    expect(screen.getByRole('progressbar', { name: 'Loading items' })).toBeBusy();
  });

  it('offers the empty state action', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <EmptyState
        title="No items yet"
        description="Create one"
        action={{ label: 'Create', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'No items yet' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(onPress).toHaveBeenCalled();
  });

  it("explains errors in the user's words, never the technical message", async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <ErrorState
        error={new AppError('server', 'SQLSTATE 23505 at users_pkey')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByText('Something went wrong on our side. Try again later.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/SQLSTATE/)).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Text and Card', () => {
  it('marks titles as headers and caps font scaling per variant', async () => {
    await renderWithProviders(
      <>
        <Text variant="title">Settings</Text>
        <Text>Body</Text>
      </>,
    );
    expect(screen.getByRole('header', { name: 'Settings' })).toHaveProp(
      'maxFontSizeMultiplier',
      1.6,
    );
    expect(screen.getByText('Body')).toHaveProp('maxFontSizeMultiplier', 2.5);
  });

  it('makes a pressable card one button', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Card onPress={onPress} accessibilityLabel="Item 1">
        <Text>Item 1</Text>
      </Card>,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Item 1' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('AlertText', () => {
  it('is announced by VoiceOver when it appears and when it changes (iOS has no live regions)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = await renderWithProviders(<AlertText>Wrong email or password.</AlertText>);
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(announce).toHaveBeenCalledWith('Wrong email or password.');
    await rerender(<AlertText>Wrong email or password.</AlertText>);
    expect(announce).toHaveBeenCalledTimes(1);
    await rerender(<AlertText>You seem to be offline.</AlertText>);
    expect(announce).toHaveBeenLastCalledWith('You seem to be offline.');
  });

  it('leaves Android to its live region, so TalkBack does not hear it twice', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderWithProviders(<AlertText>You are offline.</AlertText>);
    expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('Icon', () => {
  it('is decorative unless labeled, then an image with that name', async () => {
    await renderWithProviders(
      <>
        <Icon name="add" />
        <Icon name="trash-outline" accessibilityLabel="Delete" />
      </>,
    );
    expect(screen.getAllByRole('image')).toHaveLength(1);
    expect(screen.getByRole('image', { name: 'Delete' })).toBeOnTheScreen();
  });
});

describe('Image', () => {
  it('names a meaningful image and hides a decorative one from screen readers', async () => {
    await renderWithProviders(
      <>
        <Image source={1} accessibilityLabel="Item photo" testID="labeled" />
        <Image source={2} decorative testID="decorative" />
      </>,
    );
    expect(screen.getByRole('image', { name: 'Item photo' })).toBeOnTheScreen();
    // Rendered, but hidden from assistive technologies (the default queries).
    expect(screen.queryByTestId('decorative')).toBeNull();
    expect(screen.getByTestId('decorative', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('PermissionPrompt', () => {
  const props = {
    icon: 'notifications-outline' as const,
    title: 'Notifications',
    rationale: 'Why',
    onRequest: jest.fn(),
    onOpenSettings: jest.fn(),
  };

  it('asks only after explaining, and sends a blocked user to settings', async () => {
    const view = await renderWithProviders(<PermissionPrompt {...props} state="checking" />);
    expect(screen.queryByText('Notifications')).toBeNull();
    await view.rerender(<PermissionPrompt {...props} state="undetermined" />);
    await userEvent.press(screen.getByRole('button', { name: 'Allow' }));
    expect(props.onRequest).toHaveBeenCalled();
    await view.rerender(<PermissionPrompt {...props} state="blocked" />);
    await userEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
    await view.rerender(<PermissionPrompt {...props} state="granted" />);
    expect(screen.getByText('Allowed')).toBeOnTheScreen();
  });
});

describe('OfflineBanner', () => {
  it('appears while offline only', async () => {
    await renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText(/You are offline/)).toBeNull();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByText('You are offline. Showing saved data.')).toBeOnTheScreen();
    await act(() => {
      onlineManager.setOnline(true);
    });
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });
});

describe('theme', () => {
  function SchemeProbe() {
    return <Text>{useTheme().scheme}</Text>;
  }

  afterEach(async () => {
    // Still mounted here: the update goes through act.
    await act(() => {
      usePreferences.setState(DEFAULT_PREFERENCES);
    });
  });

  it('follows the device unless the user chose a scheme', async () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
    await renderWithProviders(<SchemeProbe />);
    expect(screen.getByText('light')).toBeOnTheScreen();
    await act(() => {
      usePreferences.getState().setTheme('dark');
    });
    expect(screen.getByText('dark')).toBeOnTheScreen();
    expect(themes.dark.colors.background).not.toBe(themes.light.colors.background);
  });

  it('renders screens with and without scrolling', async () => {
    await renderWithProviders(
      <Screen scroll testID="scrolling">
        <Text>Inside</Text>
      </Screen>,
    );
    expect(screen.getByTestId('scrolling')).toBeOnTheScreen();
    await renderWithProviders(
      <Screen padded={false} testID="fixed">
        <Text>Fixed</Text>
      </Screen>,
    );
    expect(screen.getByText('Fixed')).toBeOnTheScreen();
  });
});

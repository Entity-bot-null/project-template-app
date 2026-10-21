import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, Platform, type TextInput } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppError } from '@/lib/errors';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { contrastProblems } from '@/test/contrast';
import { renderWithProviders } from '@/test/render';

import { resolveScheme, useTheme } from '../theme/ThemeProvider';
import { themes } from '../theme/theme';
import { AlertText } from './AlertText';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { Image } from './Image';
import { OfflineBanner, OfflineBannerLayout, useOfflineBannerStackOptions } from './OfflineBanner';
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

    await view.rerender(
      <TextField label="Email" hint="Your work address" error="Enter a valid email address" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(screen.queryByText('Your work address')).toBeNull();
  });

  // React Native has no aria-invalid (nor an "invalid" state): the error must
  // be part of what the field itself reads, or a user who comes back to it
  // after the announcement hears a field with nothing wrong.
  it('reads its error, in place of its hint, whenever the field is focused', async () => {
    const view = await renderWithProviders(
      <TextField label="Email" hint="Your work address" error="Enter a valid email address" />,
    );
    expect(screen.getByLabelText('Email')).toHaveProp(
      'accessibilityHint',
      'Enter a valid email address',
    );
    await view.rerender(<TextField label="Email" error="Enter a valid email address" />);
    expect(screen.getByLabelText('Email')).toHaveProp(
      'accessibilityHint',
      'Enter a valid email address',
    );
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

  // A phone that draws edge to edge (Android 15+, an iPhone with a notch or a
  // Dynamic Island): the banner sits at the top of the window, so it pads the
  // status bar itself, and the headers below it must not pad it again.
  const NOTCHED = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, right: 12, bottom: 34, left: 12 },
  };

  function InsetsProbe() {
    const { top, bottom } = useSafeAreaInsets();
    return <Text>{`insets ${top} ${bottom}`}</Text>;
  }

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('keeps its message below the status bar and clear of the notch', async () => {
    await renderWithProviders(
      <SafeAreaProvider initialMetrics={NOTCHED}>
        <OfflineBanner />
      </SafeAreaProvider>,
    );
    await act(() => {
      onlineManager.setOnline(false);
    });
    const { spacing } = themes.light;
    expect(screen.getByTestId('offline-banner')).toHaveStyle({
      paddingTop: NOTCHED.insets.top + spacing.sm,
      paddingLeft: NOTCHED.insets.left + spacing.lg,
      paddingRight: NOTCHED.insets.right + spacing.lg,
    });
  });

  it('takes the top inset from the screens below it while it shows', async () => {
    await renderWithProviders(
      <SafeAreaProvider initialMetrics={NOTCHED}>
        <OfflineBannerLayout>
          <InsetsProbe />
        </OfflineBannerLayout>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('insets 47 34')).toBeOnTheScreen();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByText('You are offline. Showing saved data.')).toBeOnTheScreen();
    expect(screen.getByText('insets 0 34')).toBeOnTheScreen();
    await act(() => {
      onlineManager.setOnline(true);
    });
    expect(screen.queryByText(/You are offline/)).toBeNull();
    expect(screen.getByText('insets 47 34')).toBeOnTheScreen();
  });

  it("keeps Android's native headers from padding the status bar again while it shows", async () => {
    function StackOptionsProbe() {
      const options = useOfflineBannerStackOptions();
      const disabled = options.unstable_nativeProps.headerConfig.disableTopInsetApplication;
      return <Text>{`header top inset ${disabled ? 'off' : 'on'}`}</Text>;
    }
    await renderWithProviders(<StackOptionsProbe />);
    expect(screen.getByText('header top inset on')).toBeOnTheScreen();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByText('header top inset off')).toBeOnTheScreen();
    await act(() => {
      onlineManager.setOnline(true);
    });
    expect(screen.getByText('header top inset on')).toBeOnTheScreen();
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

// Contrast measured on the rendered components (src/test/contrast.ts): every
// variant and state, in both schemes, on the screen background.
describe.each(['light', 'dark'] as const)('contrast in %s mode', (scheme) => {
  const background = themes[scheme].colors.background;

  beforeEach(() => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, theme: scheme });
  });

  afterEach(async () => {
    await act(() => {
      usePreferences.setState(DEFAULT_PREFERENCES);
      onlineManager.setOnline(true);
    });
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'keeps a %s button readable, at rest and pressed',
    async (variant) => {
      await renderWithProviders(<Button label="Save" variant={variant} />);
      expect(contrastProblems(background)).toEqual([]);
      await renderWithProviders(<Button label="Save" variant={variant} testOnly_pressed />);
      expect(contrastProblems(background)).toEqual([]);
    },
  );

  it('keeps a text field visible and readable in every state', async () => {
    const view = await renderWithProviders(
      <TextField label="Email" hint="Your work address" placeholder="name@example.com" />,
    );
    expect(contrastProblems(background)).toEqual([]);
    await fireEvent(screen.getByLabelText('Email'), 'focus');
    expect(contrastProblems(background)).toEqual([]);
    await view.rerender(<TextField label="Email" value="a@" error="Enter a valid email" />);
    expect(contrastProblems(background)).toEqual([]);
  });

  it('keeps cards, states, banners and prompts readable', async () => {
    await renderWithProviders(
      <>
        <Card>
          <Text variant="heading">Title</Text>
          <Text tone="muted">Muted</Text>
          <Text tone="primary">Primary</Text>
          <Text tone="danger">Danger</Text>
          <Text tone="success">Success</Text>
        </Card>
        <EmptyState title="Nothing" description="Nothing here yet." />
        <ErrorState error={new AppError('server', 'boom')} onRetry={jest.fn()} />
        <PermissionPrompt
          icon="notifications-outline"
          title="Notifications"
          rationale="Know when something changes."
          state="granted"
          onRequest={jest.fn()}
          onOpenSettings={jest.fn()}
        />
        <AlertText tone="danger">Could not save</AlertText>
        <OfflineBanner />
      </>,
    );
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByText(/You are offline/)).toBeOnTheScreen();
    expect(contrastProblems(background)).toEqual([]);
  });

  it('keeps a pressed card readable', async () => {
    await renderWithProviders(
      <Card onPress={jest.fn()} accessibilityLabel="Item">
        <Text variant="heading">Title</Text>
        <Text tone="muted">Muted</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Item' });
    const holding = userEvent.longPress(card, { duration: 300 });
    await waitFor(() => {
      expect(card).toHaveStyle({ backgroundColor: themes[scheme].colors.surfaceMuted });
    });
    expect(contrastProblems(background)).toEqual([]);
    await holding;
  });
});

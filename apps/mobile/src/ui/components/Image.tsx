import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';

// Images through expo-image (docs/performance.md#images): decoded off the
// JavaScript thread, cached in memory and on disk, downsampled to the size
// on screen, with a placeholder and a short fade instead of a pop-in.

type Source = ExpoImageProps['source'];

interface BaseProps {
  source: Source;
  style?: ExpoImageProps['style'];
  contentFit?: ExpoImageProps['contentFit'];
  /** Shown while loading: a blurhash/thumbhash string or a local image. */
  placeholder?: ExpoImageProps['placeholder'];
  /** In recycled list rows: the row's key, so a recycled view never shows the previous image. */
  recyclingKey?: string;
  testID?: string;
}

/**
 * Every image says what it is for screen readers, or that it is decorative:
 * the type requires one of the two, so "forgot the label" cannot compile.
 */
export type ImageProps = BaseProps &
  (
    | { accessibilityLabel: string; decorative?: never }
    | { decorative: true; accessibilityLabel?: never }
  );

/**
 * Forgets every cached image, in memory and on disk. Called at sign-out:
 * pictures of the previous user (avatars, documents) must not stay on the
 * device, readable by whoever signs in next or copies the app's files.
 */
export async function clearImageCaches(): Promise<void> {
  await Promise.all([ExpoImage.clearMemoryCache(), ExpoImage.clearDiskCache()]);
}

export function Image({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  recyclingKey,
  testID,
  accessibilityLabel,
  decorative,
}: ImageProps) {
  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={contentFit}
      placeholder={placeholder}
      recyclingKey={recyclingKey}
      transition={150}
      cachePolicy="memory-disk"
      testID={testID}
      {...(decorative
        ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
        : { accessible: true, accessibilityLabel, accessibilityRole: 'image' as const })}
    />
  );
}

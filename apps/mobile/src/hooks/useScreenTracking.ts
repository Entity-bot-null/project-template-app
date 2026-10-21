import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { analytics } from '@/lib/analytics';
import { addBreadcrumb } from '@/lib/observability';

/**
 * The route pattern (/items/[id], not /items/42: no ids, no personal data)
 * of the screen being shown, for analytics and as a navigation breadcrumb.
 */
export function routePattern(segments: readonly string[]): string {
  const visible = segments.filter((segment) => !segment.startsWith('('));
  return `/${visible.join('/')}`;
}

export function useScreenTracking(): void {
  const segments = useSegments();
  const route = routePattern(segments);
  useEffect(() => {
    analytics.screen(route);
    addBreadcrumb({ category: 'navigation', message: route });
  }, [route]);
}

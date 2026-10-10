import { router } from 'expo-router';

import { EmptyState, Screen } from '@/ui';

export default function NotFoundRoute() {
  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <EmptyState
        title="This screen does not exist"
        icon="compass-outline"
        action={{
          label: 'Go to the home screen',
          onPress: () => {
            router.replace('/');
          },
        }}
      />
    </Screen>
  );
}

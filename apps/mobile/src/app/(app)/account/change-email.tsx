import { router } from 'expo-router';

import { ChangeEmailScreen } from '@/features/account/ChangeEmailScreen';

export default function ChangeEmailRoute() {
  return (
    <ChangeEmailScreen
      onDone={() => {
        router.back();
      }}
    />
  );
}

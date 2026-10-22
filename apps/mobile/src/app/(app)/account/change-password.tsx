import { router } from 'expo-router';

import { ChangePasswordScreen } from '@/features/account/ChangePasswordScreen';

export default function ChangePasswordRoute() {
  return (
    <ChangePasswordScreen
      onDone={() => {
        router.back();
      }}
    />
  );
}

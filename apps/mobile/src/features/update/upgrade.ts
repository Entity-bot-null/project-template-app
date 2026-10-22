import { create } from 'zustand';

import { onUpgradeRequired } from '@/api/client';

// The API no longer serves this version of the app: it answered 426 to a
// request (docs/releases.md#minimum-supported-version). From then on the root
// layout offers the update screen only (src/app/_layout.tsx). Not persisted:
// the next launch asks the API again, so an updated binary, or a minimum
// lowered on the server, lets the user back in.

interface UpgradeState {
  required: boolean;
}

export const useUpgradeStore = create<UpgradeState>()(() => ({ required: false }));

onUpgradeRequired(() => {
  useUpgradeStore.setState({ required: true });
});

/** Whether the API refused this app version. */
export function useUpgradeRequired(): boolean {
  return useUpgradeStore((state) => state.required);
}

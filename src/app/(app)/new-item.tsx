import { useNavigation } from 'expo-router';

import { NewItemScreen } from '@/features/items/NewItemScreen';

export default function NewItemRoute() {
  const navigation = useNavigation();
  return (
    <NewItemScreen
      onCreated={() => {
        // Removes this sheet from its stack, wherever it is now. router.back()
        // closes whatever is on top: a screen a notification opened over the
        // sheet while it saved would close instead. (A screen's dispatch
        // names the screen as the source; the target makes the stack honor it.)
        navigation.dispatch({
          type: 'POP',
          payload: { count: 1 },
          target: navigation.getState()?.key,
        });
      }}
    />
  );
}

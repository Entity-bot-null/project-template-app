import { Tabs } from 'expo-router';

import { Icon } from '@/ui';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Items',
          tabBarAccessibilityLabel: 'Items',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'list' : 'list-outline'}
              color={focused ? 'primary' : 'textMuted'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'settings' : 'settings-outline'}
              color={focused ? 'primary' : 'textMuted'}
            />
          ),
        }}
      />
    </Tabs>
  );
}

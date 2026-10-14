import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/components/theme';

export default function TabsLayout() {
  const { c, reduced } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'fade', sceneStyle: { backgroundColor: c.ground } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="server" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

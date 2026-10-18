import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { SmallBar } from '@/components/Screen';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { EDGE, radius } from '@/lib/theme';

const LICENCES: [string, string][] = [
  ['Expo and Expo modules', 'MIT'],
  ['React and React Native', 'MIT'],
  ['Expo Router / React Navigation', 'MIT'],
  ['React Native Reanimated, Worklets, Gesture Handler, Screens', 'MIT'],
  ['React Native Safe Area Context', 'MIT'],
  ['React Native SVG', 'MIT'],
  ['React Native Web', 'MIT'],
  ['Phosphor Icons (phosphor-react-native)', 'MIT'],
  ['Michroma font', 'SIL Open Font License 1.1'],
  ['Schibsted Grotesk font', 'SIL Open Font License 1.1'],
  ['expo-share-intent', 'MIT'],
  ['Async Storage', 'MIT'],
];

export function LicencesScreen() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <SmallBar title="Open-source licences" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ marginHorizontal: 8, borderRadius: radius.lg, overflow: 'hidden', gap: 2 }}>
          {LICENCES.map(([name, licence]) => (
            <View key={name} style={{ backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 12, minHeight: 64 }}>
              <T role="body">{name}</T>
              <T role="meta" color="ink2">
                {licence}
              </T>
            </View>
          ))}
        </View>
        <T role="meta" color="ink2" style={{ paddingHorizontal: EDGE, marginTop: 16 }}>
          {"Full licence texts ship with each package in the app's source."}
        </T>
      </ScrollView>
    </View>
  );
}

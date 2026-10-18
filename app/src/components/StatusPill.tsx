import { ActivityIndicator, View } from 'react-native';

import { activeServer, serversStore } from '@/state/stores';

import { Icon } from './Icon';
import { PressScale } from './Press';
import { T } from './Text';
import { useTheme } from './theme';

export function useServerState() {
  const server = serversStore.use((s) => activeServer(s));
  const status = serversStore.use((s) => (s.activeId ? s.status[s.activeId] : undefined));
  const info = serversStore.use((s) => (s.activeId ? s.info[s.activeId] : undefined));
  return { server, status: server ? (status ?? 'checking') : null, info };
}

/** §10.16 */
export function StatusPill({ onDeck, onPress }: { onDeck?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  const { server, status } = useServerState();
  const ink = onDeck ? 'onDeck' : 'ink';
  let content;
  let label: string;
  if (!server) {
    label = 'Not paired';
    content = <Icon name="Plugs" size={16} color={ink} />;
  } else if (status === 'checking' || status === 'updating') {
    label = status === 'checking' ? 'Checking' : 'Updating';
    content = <ActivityIndicator size={12} color={onDeck ? c.onDeck : c.ink} />;
  } else if (status === 'online' || status === 'unauthorized') {
    label = server.name;
    content = <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onDeck ? c.okOnDeck : c.ok }} />;
  } else {
    label = 'Offline';
    content = <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onDeck ? c.onDeck2 : c.ink3 }} />;
  }
  const a11y = server ? `Server ${server.name}, ${status === 'online' ? 'online' : (status ?? '').toString()}. Opens the Server tab.` : 'Not paired. Opens the Server tab.';
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={{
        height: 32,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        maxWidth: 200,
        backgroundColor: onDeck ? c.pillOnDeck : c.sunk,
      }}
    >
      {content}
      <T role="metaStrong" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </T>
    </PressScale>
  );
}

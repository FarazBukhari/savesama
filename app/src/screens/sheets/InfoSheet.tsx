import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';

import { IconButton } from '@/components/controls';
import { Sheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { absoluteDate, formatDuration, formatSize } from '@/lib/format';
import { displayLink, PLATFORM_NAMES } from '@/lib/links';
import { EDGE, radius } from '@/lib/theme';
import { libraryStore } from '@/state/library';
import { snack } from '@/state/ui';

export function InfoSheet({ itemKey, onClose }: { itemKey: string; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Details">
      <InfoBody itemKey={itemKey} />
    </Sheet>
  );
}

function Row({ label, value, trailing }: { label: string; value: string; trailing?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T role="meta" color="ink2" style={{ width: 96 }}>
        {label}
      </T>
      <T role="metaStrong" style={{ flex: 1 }} selectable numberOfLines={3}>
        {value}
      </T>
      {trailing}
    </View>
  );
}

function InfoBody({ itemKey }: { itemKey: string }) {
  const { c } = useTheme();
  const item = libraryStore.use((s) => s.items.find((i) => i.key === itemKey));
  if (!item) return null;
  const rows: [string, string][] = [
    ['Title', item.title],
    ['From', [item.platform ? PLATFORM_NAMES[item.platform] : null, item.author].filter(Boolean).join(' · ')],
    ['Saved', absoluteDate(item.savedAt)],
    ['Size', formatSize(item.size)],
    ['Dimensions', item.width && item.height ? `${item.width} × ${item.height}` : ''],
    ['Duration', item.duration ? formatDuration(item.duration) : ''],
    ['File name', item.filename],
  ];
  return (
    <View style={{ paddingBottom: 8 }}>
      <T role="title" accessibilityRole="header" style={{ paddingHorizontal: EDGE, paddingVertical: 16 }}>
        Details
      </T>
      <View style={{ marginHorizontal: 8, borderRadius: radius.lg, overflow: 'hidden', gap: 2, backgroundColor: c.ground }}>
        {rows.slice(0, 2).map(([l, v]) => (v ? <Row key={l} label={l} value={v} /> : null))}
        {item.url ? (
          <Row
            label="Link"
            value={displayLink(item.url)}
            trailing={
              <IconButton
                name="Copy"
                label="Copy link"
                onPress={() => {
                  void Clipboard.setStringAsync(item.url!);
                  snack('Link copied');
                }}
              />
            }
          />
        ) : null}
        {rows.slice(2).map(([l, v]) => (v ? <Row key={l} label={l} value={v} /> : null))}
      </View>
    </View>
  );
}

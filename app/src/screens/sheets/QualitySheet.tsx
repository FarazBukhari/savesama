import { View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ListGroup, ListRow } from '@/components/controls';
import { Sheet, useSheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { PLATFORM_NAMES, type Platform } from '@/lib/links';
import { QUALITY_OPTIONS, type Quality } from '@/lib/quality';
import { EDGE } from '@/lib/theme';
import { settingsStore } from '@/state/stores';
import { haptic } from '@/state/ui';

export function QualitySheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label={`Default quality for ${PLATFORM_NAMES[platform]}`}>
      <QualityBody platform={platform} />
    </Sheet>
  );
}

function Radio({ on }: { on: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 0 : 2, borderColor: c.ink2, backgroundColor: on ? c.select : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Icon name="Check" size={16} color="onSelect" weight="bold" /> : null}
    </View>
  );
}

function QualityBody({ platform }: { platform: Platform }) {
  const { close } = useSheet();
  const value = settingsStore.use((s) => s.quality[platform]);
  const pick = (q: Quality) => {
    haptic.select();
    settingsStore.set((s) => ({ quality: { ...s.quality, [platform]: q } }));
    close();
  };
  return (
    <View style={{ paddingBottom: 8 }}>
      <T role="title" accessibilityRole="header" style={{ paddingHorizontal: EDGE, paddingVertical: 16 }}>
        {`Default quality for ${PLATFORM_NAMES[platform]}`}
      </T>
      <ListGroup>
        {QUALITY_OPTIONS.map((q) => (
          <ListRow
            key={String(q)}
            role="radio"
            checked={value === q}
            title={q === 'max' ? 'Best available' : `${q}p`}
            iconNode={<Radio on={value === q} />}
            onPress={() => pick(q)}
          />
        ))}
      </ListGroup>
      <T role="meta" color="ink2" style={{ paddingHorizontal: EDGE, marginTop: 12 }}>
        {"If a post doesn't offer this, SaveSama takes the next one down."}
      </T>
    </View>
  );
}

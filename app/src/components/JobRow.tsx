import { View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import type { JobRowModel } from '@/state/rows';

import { IconButton, Lamp, Thumb } from './controls';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { PressScale } from './Press';
import { TapeLine } from './TapeLine';
import { T } from './Text';
import { useTheme } from './theme';

export function errorIcon(code: string | null): IconName {
  switch (code) {
    case 'login_required':
      return 'Lock';
    case 'not_found':
      return 'LinkBreak';
    case 'rate_limited':
      return 'HourglassMedium';
    case 'network':
      return 'CloudSlash';
    case 'unavailable':
    case 'unsupported_url':
      return 'Prohibit';
    default:
      return 'WarningCircle';
  }
}

export function JobRow({
  row,
  onCancel,
  onRetry,
  onOpen,
  card,
}: {
  row: JobRowModel;
  onCancel?: () => void;
  onRetry?: () => void;
  onOpen?: () => void;
  card?: boolean;
}) {
  const { c, reduced } = useTheme();
  const failed = row.stage === 'error' || row.stage === 'transferFailed';
  const showTape = row.stage !== 'saved' && row.stage !== 'cancelled' && !(failed && row.tape.spans.every((s) => s === 0));
  const cancellable = row.section === 'progress';
  const retryable = row.section === 'failed';
  const body = (
    <View style={{ paddingHorizontal: 12, paddingVertical: 14, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <Thumb uri={row.thumbnail} platform={row.platform} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T role="bodyStrong" numberOfLines={1}>
            {row.title}
          </T>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ height: 20, justifyContent: 'center' }}>
              {row.stage === 'saved' ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.duration(240)}>
                  <Icon name="CheckCircle" size={16} color="ok" weight="fill" />
                </Animated.View>
              ) : failed ? (
                <Icon name={errorIcon(row.errorCode)} size={16} color="err" />
              ) : row.stage === 'cancelled' ? null : (
                <Lamp live={row.live} />
              )}
            </View>
            <T role="meta" color={failed ? 'err' : 'ink2'} numberOfLines={2} style={{ flex: 1 }}>
              {row.line}
            </T>
          </View>
        </View>
        {cancellable && onCancel ? <IconButton name="X" label="Cancel download" onPress={onCancel} /> : null}
        {retryable && onRetry ? <IconButton name="ArrowCounterClockwise" label="Retry download" onPress={onRetry} /> : null}
      </View>
      {showTape ? (
        <Animated.View exiting={reduced ? undefined : FadeOut.delay(400).duration(240)} style={card ? undefined : { marginLeft: 72, marginRight: 64 }}>
          <TapeLine tape={row.tape} text={row.line} />
        </Animated.View>
      ) : null}
    </View>
  );
  const style = { backgroundColor: c.surface, borderRadius: card ? 20 : 0 };
  if (row.stage === 'saved' && onOpen) {
    return (
      <PressScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.line}`} style={style}>
        {body}
      </PressScale>
    );
  }
  return <View style={style}>{body}</View>;
}

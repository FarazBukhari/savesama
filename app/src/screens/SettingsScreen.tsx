import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { GroupLabel, Segmented, SwitchMark } from '@/components/controls';
import { Icon, PLATFORM_ICON } from '@/components/Icon';
import { LargeTitleScreen } from '@/components/Screen';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { SOURCE_URL } from '@/lib/copy';
import { PLATFORM_NAMES, PLATFORMS } from '@/lib/links';
import { qualityLabel } from '@/lib/quality';
import { radius } from '@/lib/theme';
import { clearLinks } from '@/state/history';
import { settingsStore, type ThemePref } from '@/state/stores';
import { confirm, haptic, openSheet } from '@/state/ui';

function Group({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={{ marginHorizontal: 8, borderRadius: radius.lg, overflow: 'hidden', gap: 2, backgroundColor: c.ground }}>{children}</View>;
}

function Block({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={{ backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}>{children}</View>;
}

function Row({
  title,
  helper,
  value,
  icon,
  onPress,
  trailing,
  role = 'button',
  checked,
  danger,
  chevron,
}: {
  title: string;
  helper?: string;
  value?: string;
  icon?: ReactNode;
  onPress?: () => void;
  trailing?: ReactNode;
  role?: 'button' | 'switch';
  checked?: boolean;
  danger?: boolean;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={role}
      accessibilityState={role === 'switch' ? { checked } : undefined}
      android_ripple={{ color: c.ripple }}
      style={({ pressed }) => ({ backgroundColor: pressed && onPress ? c.pressed : c.surface, minHeight: helper ? 72 : 56, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16 })}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <T role="body" color={danger ? 'err' : 'ink'}>
          {title}
        </T>
        {helper ? (
          <T role="meta" color="ink2">
            {helper}
          </T>
        ) : null}
      </View>
      {value ? (
        <T role="meta" color="ink2">
          {value}
        </T>
      ) : null}
      {trailing}
      {chevron ? <Icon name="CaretRight" size={20} color="ink2" /> : null}
    </Pressable>
  );
}

export function SettingsScreen() {
  const { c } = useTheme();
  const s = settingsStore.use((x) => x);
  const set = settingsStore.set;
  const toggle = (k: 'keepOnServer' | 'warnDuplicate' | 'haptics') => {
    set({ [k]: !s[k] });
    if (k !== 'haptics' || !s.haptics) haptic.select();
  };
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const build = Application.nativeBuildVersion ?? String(Constants.expoConfig?.android?.versionCode ?? 1);

  return (
    <LargeTitleScreen title="Settings">
      <GroupLabel title="Appearance" />
      <Group>
        <Block>
          <T role="metaStrong" color="ink2" style={{ paddingHorizontal: 8 }}>
            Theme
          </T>
          <Segmented<ThemePref>
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Block>
      </Group>

      <GroupLabel title="Saving" />
      <Group>
        <Block>
          <T role="metaStrong" color="ink2" style={{ paddingHorizontal: 8 }}>
            Default format
          </T>
          <Segmented
            value={s.defaultMode}
            onChange={(defaultMode) => set({ defaultMode })}
            options={[
              { value: 'media', label: 'Video' },
              { value: 'audio', label: 'Audio only' },
            ]}
          />
        </Block>
        <View style={{ backgroundColor: c.surface, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12 }}>
          <T role="metaStrong" color="ink2" accessibilityRole="header">
            Default quality
          </T>
        </View>
        {PLATFORMS.map((p) => (
          <Row
            key={p}
            icon={<Icon name={PLATFORM_ICON[p]} />}
            title={PLATFORM_NAMES[p]}
            value={qualityLabel(s.quality[p])}
            chevron
            onPress={() => openSheet({ kind: 'quality', platform: p })}
          />
        ))}
        <Row
          title="Keep a copy on the server"
          helper="Off: the server deletes its copy once the file is on your phone."
          role="switch"
          checked={s.keepOnServer}
          onPress={() => toggle('keepOnServer')}
          trailing={<SwitchMark on={s.keepOnServer} />}
        />
        <Row
          title="Warn before saving a link again"
          role="switch"
          checked={s.warnDuplicate}
          onPress={() => toggle('warnDuplicate')}
          trailing={<SwitchMark on={s.warnDuplicate} />}
        />
      </Group>

      <GroupLabel title="Feedback" />
      <Group>
        <Row
          icon={<Icon name="Vibrate" />}
          title="Vibration"
          helper="Short taps when you select, save and finish."
          role="switch"
          checked={s.haptics}
          onPress={() => toggle('haptics')}
          trailing={<SwitchMark on={s.haptics} />}
        />
      </Group>

      <GroupLabel title="Privacy" />
      <Group>
        <Block>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Icon name="Lock" />
            <T role="body" style={{ flex: 1 }}>
              SaveSama never signs in. No accounts, no cookies, no tracking. Your server talks to the platforms; this app only talks to your server.
            </T>
          </View>
        </Block>
      </Group>

      <GroupLabel title="History" />
      <Group>
        <Row
          icon={<Icon name="ClockCounterClockwise" color="err" />}
          title="Clear link history"
          danger
          onPress={() =>
            confirm({
              title: 'Clear link history?',
              body: "SaveSama forgets which links you've saved, so it can't warn you about repeats. Saved files stay.",
              confirm: 'Clear',
              destructive: true,
              onConfirm: clearLinks,
            })
          }
        />
      </Group>

      <GroupLabel title="About" />
      <Group>
        <Row title="Version" value={`${version} (${build})`} />
        <Row title="Open-source licences" chevron onPress={() => router.push('/licences')} />
        <Row title="Source code" trailing={<Icon name="ArrowSquareOut" size={20} color="ink2" />} onPress={() => void Linking.openURL(SOURCE_URL)} />
      </Group>
    </LargeTitleScreen>
  );
}

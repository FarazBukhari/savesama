import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, fonts } from '@/lib/theme';
import { closeDialog, closeSheet, hideSnack } from '@/state/ui';
import { uiStore } from '@/state/stores';

import { BatchSheet } from '@/screens/sheets/BatchSheet';
import { InfoSheet } from '@/screens/sheets/InfoSheet';
import { PairConfirmSheet, PairSheet, RestartSheet } from '@/screens/sheets/PairSheets';
import { PreviewSheet } from '@/screens/sheets/PreviewSheet';
import { QualitySheet } from '@/screens/sheets/QualitySheet';
import { RenameSheet, ServerMenuSheet } from '@/screens/sheets/ServerSheets';

import { T } from './Text';
import { useTheme } from './theme';

function Snackbar() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const s = uiStore.use((u) => u.snack);
  const sheets = uiStore.use((u) => u.sheets.length);
  const pathname = usePathname();
  const overTabs = ['/', '/activity', '/library', '/server', '/settings'].includes(pathname);
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => hideSnack(s.id), s.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [s]);
  if (!s) return null;
  return (
    <Animated.View
      key={s.id}
      entering={FadeInDown.duration(240)}
      exiting={FadeOut.duration(120)}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: sheets || !overTabs ? insets.bottom + 12 : insets.bottom + 80 + 12,
        minHeight: 52,
        borderRadius: 12,
        backgroundColor: c.action,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: s.action ? 4 : 16,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <T role="body" color="ground" style={{ flex: 1, fontSize: 15, paddingVertical: 14 }}>
        {s.text}
      </T>
      {s.action ? (
        <Pressable
          onPress={() => {
            hideSnack(s.id);
            s.action!.onPress();
          }}
          accessibilityRole="button"
          style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}
        >
          <T role="label" color="snackAction" style={{ fontFamily: fonts.semibold }}>
            {s.action.label}
          </T>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function DialogHost() {
  const { c } = useTheme();
  const d = uiStore.use((u) => u.dialog);
  if (!d) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', padding: 24 }]} accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(240)} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} accessibilityLabel="Cancel" />
      </Animated.View>
      <Animated.View
        entering={FadeIn.duration(240)}
        accessibilityRole="alert"
        style={{ backgroundColor: c.surface, borderRadius: radius.sheet, padding: 24, gap: 16, elevation: 6, maxWidth: 560, alignSelf: 'center', width: '100%' }}
      >
        <T role="headline">{d.title}</T>
        <T role="body" color="ink2">
          {d.body}
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginRight: -12 }}>
          <DialogAction label="Cancel" onPress={closeDialog} />
          <DialogAction
            label={d.confirm}
            danger={d.destructive}
            onPress={() => {
              closeDialog();
              d.onConfirm();
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function DialogAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: c.ripple }}
      style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 24 }}
    >
      <T role="label" color={danger ? 'err' : 'ink'} style={{ fontFamily: fonts.semibold }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Overlays() {
  const sheets = uiStore.use((u) => u.sheets);
  return (
    <>
      {sheets.map((s, i) => {
        const key = `${i}:${s.kind}`;
        switch (s.kind) {
          case 'preview':
            return <PreviewSheet key={key} url={s.url} batch={s.batch} onClose={closeSheet} />;
          case 'batch':
            return <BatchSheet key={key} urls={s.urls} onClose={closeSheet} />;
          case 'pair':
            return <PairSheet key={key} onClose={closeSheet} />;
          case 'pairConfirm':
            return <PairConfirmSheet key={key} info={s.info} onClose={closeSheet} />;
          case 'restart':
            return <RestartSheet key={key} onClose={closeSheet} />;
          case 'quality':
            return <QualitySheet key={key} platform={s.platform} onClose={closeSheet} />;
          case 'info':
            return <InfoSheet key={key} itemKey={s.key} onClose={closeSheet} />;
          case 'rename':
            return <RenameSheet key={key} id={s.id} onClose={closeSheet} />;
          case 'serverMenu':
            return <ServerMenuSheet key={key} id={s.id} onClose={closeSheet} />;
        }
      })}
      <DialogHost />
      <Snackbar />
    </>
  );
}

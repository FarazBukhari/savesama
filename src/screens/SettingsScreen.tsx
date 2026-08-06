import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '../components/Header';
import { ResolutionChoiceModal } from '../components/ResolutionChoiceModal';
import { usePreferences } from '../hooks/usePreferences';
import { ALBUM_NAME } from '../services/download';
import { SessionPlatform, signOutOf } from '../services/mediaSession';
import {
  Preferences,
  ResolutionPref,
  ThemeMode,
  resolutionLabel,
  savePreferences,
} from '../services/preferences';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';

type ResolutionKey = 'instagramResolution' | 'threadsResolution' | 'youtubeResolution';

interface PlatformRow {
  key: ResolutionKey;
  platform: string;
  hint: string;
}

const PLATFORM_ROWS: PlatformRow[] = [
  { key: 'instagramResolution', platform: 'Instagram', hint: 'Reels, video posts and photos' },
  { key: 'threadsResolution', platform: 'Threads', hint: 'Video posts and photos' },
  { key: 'youtubeResolution', platform: 'YouTube', hint: 'Videos and Shorts' },
];

interface AccountRow {
  platform: SessionPlatform;
  label: string;
  flag: 'instagramSignedIn' | 'threadsSignedIn';
}

const ACCOUNT_ROWS: AccountRow[] = [
  { platform: 'instagram', label: 'Instagram', flag: 'instagramSignedIn' },
  { platform: 'threads', label: 'Threads', flag: 'threadsSignedIn' },
];

const THEME_CHOICES: { mode: ThemeMode; icon: 'sun' | 'moon' | 'smartphone' }[] = [
  { mode: 'light', icon: 'sun' },
  { mode: 'dark', icon: 'moon' },
  { mode: 'auto', icon: 'smartphone' },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const prefs = usePreferences();
  const [editing, setEditing] = useState<PlatformRow | null>(null);

  const handleSignOut = (row: AccountRow) => {
    Alert.alert(
      `Sign out of ${row.label}?`,
      'Foxy will stop being able to open posts that need an account until you sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => signOutOf(row.platform),
        },
      ]
    );
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      >
        <Header title="Settings" />

        <Text style={styles.overline}>Appearance</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Theme</Text>
          <View style={styles.segment}>
            {THEME_CHOICES.map((choice, index) => {
              const active = prefs.themeMode === choice.mode;
              return (
                <Pressable
                  key={choice.mode}
                  onPress={() => void savePreferences({ themeMode: choice.mode })}
                  style={[
                    styles.segmentItem,
                    index > 0 && styles.segmentDivider,
                    active && styles.segmentActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${choice.mode} theme`}
                  accessibilityState={{ selected: active }}
                >
                  <Feather
                    name={choice.icon}
                    size={14}
                    color={active ? theme.colors.accent : theme.colors.textSecondary}
                  />
                  {choice.mode === 'auto' ? (
                    <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                      Auto
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.overline}>Default resolution</Text>
        {PLATFORM_ROWS.map((row) => (
          <Pressable
            key={row.key}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setEditing(row)}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>{row.platform}</Text>
              <Text style={styles.rowHint}>{row.hint}</Text>
            </View>
            <Text style={styles.value}>{shortResolution(prefs[row.key])}</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.textSecondary} />
          </Pressable>
        ))}
        <Text style={styles.footnote}>
          Lower quality downloads faster and takes less space. If the size you picked isn't
          offered, Foxy takes the next one down.
        </Text>

        <Text style={styles.overline}>Accounts</Text>
        {ACCOUNT_ROWS.map((row) => {
          const signedIn = prefs[row.flag];
          return (
            <View key={row.platform} style={styles.row}>
              <View style={[styles.dot, !signedIn && styles.dotOff]} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowFigure}>{signedIn ? 'Signed in' : 'Not signed in'}</Text>
              </View>
              {signedIn ? (
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.rowPressed]}
                  onPress={() => handleSignOut(row)}
                  accessibilityRole="button"
                >
                  <Feather name="log-out" size={13} color={theme.colors.text} />
                  <Text style={styles.buttonLabel}>Sign out</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <Text style={styles.footnote}>
          Foxy downloads as the account you sign in to, so anything you can view, you can save.
          Signing in happens the first time a post needs it. YouTube needs no account.
        </Text>

        <Text style={styles.overline}>Where files are saved</Text>
        {/*
          Read-only on purpose: Android's MediaStore roots an album by media type, so
          photos/videos and audio cannot share one folder. Foxy has no say in the
          parent directory — it only names the album.
        */}
        <View style={styles.row}>
          <Text style={styles.rowLabelGrow}>Photos &amp; videos</Text>
          <Text style={styles.rowFigure}>Pictures/{ALBUM_NAME}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabelGrow}>Audio</Text>
          <Text style={styles.rowFigure}>Music/{ALBUM_NAME}</Text>
        </View>
        <Text style={styles.footnote}>
          Saved files show up in your gallery straight away. Android keeps audio in a separate
          root from photos and videos, so these two locations can't be merged.
        </Text>
      </ScrollView>

      {editing ? (
        <ResolutionChoiceModal
          visible
          title={`${editing.platform} quality`}
          value={prefs[editing.key]}
          onSelect={(value: ResolutionPref) =>
            void savePreferences({ [editing.key]: value } as Partial<Preferences>)
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** The settings row wants the figure, not the sentence the sheet uses. */
function shortResolution(pref: ResolutionPref): string {
  return pref === 'max' ? 'Highest' : `${pref}p`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    overline: {
      fontSize: typography.figure,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md - 1,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowPressed: {
      opacity: 0.6,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
    },
    rowLabel: {
      flex: 1,
      fontSize: typography.subtitle,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowLabelGrow: {
      flex: 1,
      fontSize: typography.subtitle,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowHint: {
      marginTop: 2,
      fontSize: typography.small,
      color: theme.colors.textSecondary,
    },
    rowFigure: {
      marginTop: 2,
      fontFamily: fonts.mono,
      fontSize: typography.figure,
      color: theme.colors.textSecondary,
    },
    value: {
      fontFamily: fonts.mono,
      fontSize: typography.caption,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: theme.colors.success,
    },
    dotOff: {
      backgroundColor: theme.colors.placeholder,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: spacing.xs + 3,
    },
    buttonLabel: {
      fontSize: typography.small,
      fontWeight: '700',
      color: theme.colors.text,
    },
    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    segmentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: spacing.xs + 2,
    },
    segmentDivider: {
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.border,
    },
    segmentActive: {
      backgroundColor: theme.colors.accentSoft,
    },
    segmentLabel: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    segmentLabelActive: {
      color: theme.colors.accent,
    },
    footnote: {
      marginTop: spacing.md,
      fontSize: typography.small,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
  });

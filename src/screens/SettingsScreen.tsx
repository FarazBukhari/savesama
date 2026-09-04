import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ffmpegVersion } from '../../modules/savesama-audio-extractor';
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
import { ENTER, TINT_TRANSITION } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';

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

/*
  Read from the app config rather than written out here, so the number in Settings
  can never drift from the one in app.json.
*/
const APP_VERSION = Constants.expoConfig?.version ?? '—';

/** Resolved once: the native module doesn't change while the app runs. */
const FFMPEG_VERSION = ffmpegVersion();
const ENGINE_LABEL = FFMPEG_VERSION ? `FFmpeg ${FFMPEG_VERSION}` : 'System codecs';

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
      'SaveSama will stop being able to open posts that need an account until you sign in again.',
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
                  accessibilityRole="button"
                  accessibilityLabel={`${choice.mode} theme`}
                  accessibilityState={{ selected: active }}
                >
                  <Animated.View
                    style={[
                      styles.segmentItem,
                      index > 0 && styles.segmentDivider,
                      active && styles.segmentActive,
                      TINT_TRANSITION,
                    ]}
                  >
                    <Feather
                      name={choice.icon}
                      size={18}
                      color={active ? theme.colors.accent : theme.colors.textSecondary}
                    />
                    {choice.mode === 'auto' ? (
                      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                        Auto
                      </Text>
                    ) : null}
                  </Animated.View>
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
            accessibilityRole="button"
            accessibilityLabel={`${row.platform} default quality, currently ${shortResolution(
              prefs[row.key]
            )}`}
            accessibilityHint="Opens the quality chooser"
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>{row.platform}</Text>
              <Text style={styles.rowHint}>{row.hint}</Text>
            </View>
            <Text style={styles.value}>{shortResolution(prefs[row.key])}</Text>
            <Feather name="chevron-right" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        ))}
        <Text style={styles.footnote}>
          Lower quality downloads faster and takes less space. If the size you picked isn't
          offered, SaveSama takes the next one down.
        </Text>

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Original quality (Instagram &amp; Threads)</Text>
            <Text style={styles.rowHint}>
              {FFMPEG_VERSION
                ? 'With "Highest", save the full-resolution upload (VP9) instead of the capped H.264 rendition'
                : 'Needs the FFmpeg engine, which this build doesn\u2019t include'}
            </Text>
          </View>
          <Switch
            value={prefs.preferOriginalQuality}
            disabled={!FFMPEG_VERSION}
            onValueChange={(value) => void savePreferences({ preferOriginalQuality: value })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Prefer original quality for Instagram and Threads"
          />
        </View>
        <Text style={styles.footnote}>
          Meta only publishes the true original as VP9 video, roughly 1.5x the pixels of the
          normal download. It plays in every Android gallery; iPhones and some desktop players
          don't handle VP9 in MP4, so keep this off if you share files there.
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
                <Animated.View entering={ENTER}>
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.rowPressed]}
                  onPress={() => handleSignOut(row)}
                  accessibilityRole="button"
                >
                  <Feather name="log-out" size={16} color={theme.colors.text} />
                  <Text style={styles.buttonLabel}>Sign out</Text>
                </Pressable>
                </Animated.View>
              ) : null}
            </View>
          );
        })}
        <Text style={styles.footnote}>
          SaveSama downloads as the account you sign in to, so anything you can view, you can save.
          Signing in happens the first time a post needs it. YouTube needs no account.
        </Text>

        <Text style={styles.overline}>Where files are saved</Text>
        {/*
          Read-only on purpose: Android's MediaStore roots an album by media type, so
          photos/videos and audio cannot share one folder. the app has no say in the
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

        <Text style={styles.overline}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabelGrow}>Version</Text>
          <Text style={styles.rowFigure}>{APP_VERSION}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabelGrow}>Media engine</Text>
          <Text style={styles.rowFigure}>{ENGINE_LABEL}</Text>
        </View>
        <Text style={styles.footnote}>
          Audio extraction, HD muxing and downscaling run through {ENGINE_LABEL}
          {FFMPEG_VERSION ? ', falling back to Android\u2019s own codecs if a command fails.' : '.'}
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
      fontSize: typography.caption,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: MIN_TAP + 12,
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
      fontSize: typography.body,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowLabelGrow: {
      flex: 1,
      fontSize: typography.body,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowHint: {
      marginTop: 3,
      fontSize: typography.subtitle,
      color: theme.colors.textSecondary,
    },
    rowFigure: {
      marginTop: 3,
      fontFamily: fonts.mono,
      fontSize: typography.figure,
      color: theme.colors.textSecondary,
    },
    value: {
      fontFamily: fonts.mono,
      fontSize: typography.subtitle + 1,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: theme.colors.success,
    },
    dotOff: {
      backgroundColor: theme.colors.placeholder,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: MIN_TAP - 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md + 2,
    },
    buttonLabel: {
      fontSize: typography.subtitle + 1,
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
      justifyContent: 'center',
      gap: spacing.sm - 2,
      minWidth: MIN_TAP,
      minHeight: MIN_TAP - 8,
      paddingHorizontal: spacing.md,
    },
    segmentDivider: {
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.border,
    },
    segmentActive: {
      backgroundColor: theme.colors.accentSoft,
    },
    segmentLabel: {
      fontSize: typography.subtitle,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    segmentLabelActive: {
      color: theme.colors.accent,
    },
    footnote: {
      marginTop: spacing.md,
      fontSize: typography.subtitle,
      color: theme.colors.textSecondary,
      lineHeight: 21,
    },
  });

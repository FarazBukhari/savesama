import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '../components/Header';
import { ResolutionChoiceModal } from '../components/ResolutionChoiceModal';
import { usePreferences } from '../hooks/usePreferences';
import {
  Preferences,
  ResolutionPref,
  resolutionLabel,
  savePreferences,
} from '../services/preferences';
import { colors, radius, shadows, spacing, typography } from '../theme';

interface PlatformRow {
  key: keyof Preferences;
  platform: string;
  glyph: string;
  hint: string;
}

const PLATFORM_ROWS: PlatformRow[] = [
  {
    key: 'instagramResolution',
    platform: 'Instagram',
    glyph: '📸',
    hint: 'Reels and video posts',
  },
  {
    key: 'youtubeResolution',
    platform: 'YouTube',
    glyph: '▶️',
    hint: 'Videos and Shorts',
  },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const [editing, setEditing] = useState<PlatformRow | null>(null);

  const handleSelect = (key: keyof Preferences, value: ResolutionPref) => {
    void savePreferences({ [key]: value });
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        <Header
          title="Settings"
          subtitle="Choose the default download quality for each source"
          glyph="⚙️"
        />

        <Text style={styles.sectionLabel}>Default resolution</Text>
        <View style={styles.card}>
          {PLATFORM_ROWS.map((row, index) => (
            <Pressable
              key={row.key}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              onPress={() => setEditing(row)}
            >
              <View style={styles.iconTile}>
                <Text style={styles.iconGlyph}>{row.glyph}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>{row.platform}</Text>
                <Text style={styles.rowHint}>{row.hint}</Text>
              </View>
              <View style={styles.rowValue}>
                <View style={styles.valueChip}>
                  <Text style={styles.valueChipLabel}>{resolutionLabel(prefs[row.key])}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footnote}>
          Lower resolutions download faster and use less storage. When a video isn’t offered
          below your chosen size, Foxy shrinks it on-device where supported.
        </Text>
      </ScrollView>

      {editing ? (
        <ResolutionChoiceModal
          visible
          title={`${editing.platform} quality`}
          value={prefs[editing.key]}
          onSelect={(value) => handleSelect(editing.key, value)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.sunken,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconGlyph: {
    fontSize: 20,
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  rowHint: {
    marginTop: 2,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  valueChipLabel: {
    fontSize: typography.small,
    color: colors.accent,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: spacing.sm,
    fontSize: typography.headline,
    color: colors.placeholder,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
    marginHorizontal: spacing.xs,
  },
});

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResolutionChoiceModal } from '../components/ResolutionChoiceModal';
import { usePreferences } from '../hooks/usePreferences';
import {
  Preferences,
  ResolutionPref,
  resolutionLabel,
  savePreferences,
} from '../services/preferences';
import { colors, radius, spacing, typography } from '../theme';

type EditingKey = keyof Preferences | null;

interface PlatformRow {
  key: keyof Preferences;
  platform: string;
  hint: string;
}

const PLATFORM_ROWS: PlatformRow[] = [
  {
    key: 'instagramResolution',
    platform: 'Instagram',
    hint: 'Reels and video posts',
  },
  {
    key: 'youtubeResolution',
    platform: 'YouTube',
    hint: 'Videos and Shorts',
  },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const [editing, setEditing] = useState<EditingKey>(null);

  const handleSelect = (key: keyof Preferences, value: ResolutionPref) => {
    void savePreferences({ [key]: value });
  };

  const editingRow = PLATFORM_ROWS.find((row) => row.key === editing) ?? null;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Choose the default download quality for each source</Text>
        </View>

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
              onPress={() => setEditing(row.key)}
            >
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>{row.platform}</Text>
                <Text style={styles.rowHint}>{row.hint}</Text>
              </View>
              <View style={styles.rowValue}>
                <Text style={styles.rowValueText}>{resolutionLabel(prefs[row.key])}</Text>
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

      {editingRow ? (
        <ResolutionChoiceModal
          visible
          title={`${editingRow.platform} quality`}
          value={prefs[editingRow.key]}
          onSelect={(value) => handleSelect(editingRow.key, value)}
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
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.subtitle,
    color: colors.textSecondary,
  },
  sectionLabel: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.background,
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  rowHint: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValueText: {
    fontSize: typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: spacing.xs,
    fontSize: typography.body,
    color: colors.placeholder,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

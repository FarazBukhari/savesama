import Feather from '@expo/vector-icons/Feather';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SavedAsset } from '../services/library';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { prettyName } from './savedName';

type FeatherName = keyof typeof Feather.glyphMap;

interface AssetActionsSheetProps {
  asset: SavedAsset | null;
  onClose: () => void;
  onOpen: (asset: SavedAsset) => void;
  onShare: (asset: SavedAsset) => void;
  onRename: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

/** Long-press menu for a saved file. Delete used to be the only long-press action. */
export function AssetActionsSheet({
  asset,
  onClose,
  onOpen,
  onShare,
  onRename,
  onDelete,
}: AssetActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!asset) return null;
  const name = prettyName(asset.filename, asset.mediaType);

  const rows: { icon: FeatherName; label: string; onPress: () => void; destructive?: boolean }[] = [
    { icon: 'maximize-2', label: 'Open', onPress: () => onOpen(asset) },
    { icon: 'share-2', label: 'Share', onPress: () => onShare(asset) },
    { icon: 'edit-3', label: 'Rename', onPress: () => onRename(asset) },
    { icon: 'trash-2', label: 'Delete', onPress: () => onDelete(asset), destructive: true },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessible={false}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>
            {name.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {asset.filename ?? name.kind}
          </Text>
          {rows.map((row) => (
            <Pressable
              key={row.label}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                onClose();
                row.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <Feather
                name={row.icon}
                size={20}
                color={row.destructive ? theme.colors.error : theme.colors.accent}
              />
              <Text style={[styles.rowLabel, row.destructive && styles.rowLabelDestructive]}>
                {row.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.colors.scrim,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      ...theme.shadows.raised,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: theme.colors.border,
      alignSelf: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: typography.headline,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 2,
      marginBottom: spacing.sm,
      fontSize: typography.caption,
      fontFamily: fonts.mono,
      color: theme.colors.textSecondary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    rowPressed: {
      opacity: 0.65,
    },
    rowLabel: {
      fontSize: typography.body,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowLabelDestructive: {
      color: theme.colors.error,
    },
  });

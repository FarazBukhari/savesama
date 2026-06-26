import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNotice } from '../components/ErrorNotice';
import { SavedFileTile } from '../components/SavedFileTile';
import {
  LibraryError,
  SavedAsset,
  deleteSavedAsset,
  listSavedAssets,
  openAsset,
} from '../services/library';
import { colors, radius, spacing, typography } from '../theme';

const COLUMNS = 3;
const GAP = spacing.sm;
const H_PADDING = spacing.lg;
const TILE_SIZE =
  (Dimensions.get('window').width - 2 * H_PADDING - (COLUMNS - 1) * GAP) / COLUMNS;

function friendlyMessage(error: unknown): string {
  if (error instanceof LibraryError) return error.userMessage;
  return 'Could not load your saved files. Please try again.';
}

interface LibraryScreenProps {
  /** Bumped by the parent to trigger a refresh (e.g. on tab focus or new save). */
  refreshToken: number;
}

export function LibraryScreen({ refreshToken }: LibraryScreenProps) {
  const insets = useSafeAreaInsets();

  const [assets, setAssets] = useState<SavedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const saved = await listSavedAssets();
      setAssets(saved);
      setError(null);
    } catch (loadError) {
      setError(friendlyMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // First mount shows the full-screen spinner; later refreshes (tab re-focus,
    // a new download) refresh quietly without blanking the existing grid.
    void load(hasLoaded.current ? 'refresh' : 'initial');
    hasLoaded.current = true;
  }, [load, refreshToken]);

  const handleOpen = useCallback(async (asset: SavedAsset) => {
    try {
      await openAsset(asset);
    } catch (openError) {
      Alert.alert('Cannot open file', friendlyMessage(openError));
    }
  }, []);

  const handleDelete = useCallback(
    (asset: SavedAsset) => {
      Alert.alert('Delete file', 'Remove this file from your device?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedAsset(asset.id);
              setAssets((previous) => previous.filter((a) => a.id !== asset.id));
            } catch (deleteError) {
              Alert.alert('Cannot delete file', friendlyMessage(deleteError));
            }
          },
        },
      ]);
    },
    []
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={assets}
      keyExtractor={(asset) => asset.id}
      numColumns={COLUMNS}
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg },
        assets.length === 0 && styles.contentEmpty,
      ]}
      columnWrapperStyle={styles.row}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Saved files</Text>
          <Text style={styles.subtitle}>Everything you've saved with Foxy</Text>
          {error ? <ErrorNotice message={error} /> : null}
        </View>
      }
      ListEmptyComponent={
        error ? null : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No saved files yet</Text>
            <Text style={styles.emptyBody}>
              Files you download will show up here. Long-press a file to delete it.
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <SavedFileTile
          asset={item}
          size={TILE_SIZE}
          onOpen={(asset) => void handleOpen(asset)}
          onDelete={handleDelete}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingBottom: spacing.xxl,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: GAP,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.lg,
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
  emptyCard: {
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    marginTop: spacing.sm,
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});

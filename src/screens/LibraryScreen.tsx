import Feather from '@expo/vector-icons/Feather';
import { MediaType } from 'expo-media-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNotice } from '../components/ErrorNotice';
import { Header } from '../components/Header';
import { SavedFileRow } from '../components/SavedFileRow';
import { SavedFileTile } from '../components/SavedFileTile';
import { usePreferences } from '../hooks/usePreferences';
import {
  LibraryError,
  SavedAsset,
  deleteSavedAsset,
  listSavedAssets,
  openAsset,
} from '../services/library';
import { LibraryView, savePreferences } from '../services/preferences';
import { ENTER, enterRow, EXIT, REFLOW, TINT_TRANSITION } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';

const COLUMNS = 2;
const GAP = spacing.sm - 2;
/** Grid runs closer to the edge than the list — the media is the page. */
const GRID_PADDING = spacing.sm;
const LIST_PADDING = spacing.lg;
const TILE_SIZE =
  (Dimensions.get('window').width - 2 * GRID_PADDING - (COLUMNS - 1) * GAP) / COLUMNS;

type Filter = 'all' | 'video' | 'photo' | 'audio';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'video', label: 'Video' },
  { key: 'photo', label: 'Photo' },
  { key: 'audio', label: 'Audio' },
];

function matchesFilter(asset: SavedAsset, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'audio') return asset.mediaType === MediaType.AUDIO;
  if (filter === 'video') return asset.mediaType === MediaType.VIDEO;
  return asset.mediaType !== MediaType.AUDIO && asset.mediaType !== MediaType.VIDEO;
}

function friendlyMessage(error: unknown): string {
  // Always log so the real cause is visible in Metro / a development build.
  console.warn('[library]', error);
  if (error instanceof LibraryError) return error.userMessage;
  // In a dev build surface the actual error so it's debuggable on-screen; ship a
  // generic message in production.
  if (__DEV__) return `Could not load your saved files:\n${String(error)}`;
  return 'Could not load your saved files. Please try again.';
}

interface LibraryScreenProps {
  /** Bumped by the parent to trigger a refresh (e.g. on tab focus or new save). */
  refreshToken: number;
}

export function LibraryScreen({ refreshToken }: LibraryScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { libraryView } = usePreferences();

  const [assets, setAssets] = useState<SavedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
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
    // The first pass is a full load; every later token bump (a tab switch, or
    // a new download) refreshes quietly without blanking the existing grid.
    void load(hasLoaded.current ? 'refresh' : 'initial');
    hasLoaded.current = true;
  }, [refreshToken, load]);

  const handleOpen = useCallback(async (asset: SavedAsset) => {
    try {
      await openAsset(asset);
    } catch (openError) {
      Alert.alert('Cannot open file', friendlyMessage(openError));
    }
  }, []);

  const handleDelete = useCallback((asset: SavedAsset) => {
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
  }, []);

  const visible = useMemo(
    () => assets.filter((asset) => matchesFilter(asset, filter)),
    [assets, filter]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const isGrid = libraryView === 'grid';
  const padding = isGrid ? GRID_PADDING : LIST_PADDING;

  return (
    <Animated.FlatList
      // numColumns can't change on a mounted FlatList — remounting on the view
      // toggle is the supported way, and without it the switch throws.
      key={libraryView}
      // Item layout animations only work on a single-column list; passing this
      // with numColumns > 1 is unsupported, so the grid goes without.
      itemLayoutAnimation={isGrid ? undefined : REFLOW}
      data={visible}
      keyExtractor={(asset) => asset.id}
      numColumns={isGrid ? COLUMNS : 1}
      style={styles.list}
      contentContainerStyle={[
        { paddingHorizontal: padding, paddingTop: insets.top + spacing.md },
        styles.content,
        visible.length === 0 && styles.contentEmpty,
      ]}
      columnWrapperStyle={isGrid ? styles.row : undefined}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={theme.colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ paddingHorizontal: isGrid ? LIST_PADDING - GRID_PADDING : 0 }}>
          <Header
            title="Saved"
            subtitle={assets.length > 0 ? undefined : 'Everything you keep lands here'}
            right={
              <ViewToggle
                value={libraryView}
                onChange={(next) => void savePreferences({ libraryView: next })}
              />
            }
          />
          <View style={styles.filters}>
            {FILTERS.map((option) => {
              const active = option.key === filter;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setFilter(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Animated.View
                    style={[styles.chip, active && styles.chipActive, TINT_TRANSITION]}
                  >
                    <Animated.Text
                      style={[styles.chipLabel, active && styles.chipLabelActive, TINT_TRANSITION]}
                    >
                      {option.label}
                    </Animated.Text>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
          {assets.length > 0 ? (
            <Animated.Text entering={ENTER} exiting={EXIT} style={styles.count}>
              {visible.length} {visible.length === 1 ? 'FILE' : 'FILES'}
              {filter === 'all' ? '' : ` OF ${assets.length}`}
            </Animated.Text>
          ) : null}
          {error ? <ErrorNotice title="Couldn't read your library" message={error} /> : null}
        </View>
      }
      ListEmptyComponent={
        error ? null : (
          <Animated.View entering={ENTER} style={styles.empty}>
            <Feather name="inbox" size={34} color={theme.colors.placeholder} />
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'Nothing saved yet' : 'Nothing of that kind yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {filter === 'all'
                ? 'Files you save land here. Long-press one to delete it.'
                : 'Try another filter, or save something new from the Get tab.'}
            </Text>
          </Animated.View>
        )
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={enterRow(index)}>
          {isGrid ? (
            <SavedFileTile
              asset={item}
              size={TILE_SIZE}
              onOpen={(asset) => void handleOpen(asset)}
              onDelete={handleDelete}
            />
          ) : (
            <SavedFileRow
              asset={item}
              onOpen={(asset) => void handleOpen(asset)}
              onDelete={handleDelete}
            />
          )}
        </Animated.View>
      )}
    />
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: LibraryView;
  onChange: (next: LibraryView) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.segment}>
      {(['grid', 'list'] as const).map((option, index) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.segmentItem, index > 0 && styles.segmentDivider, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityLabel={option === 'grid' ? 'Grid view' : 'List view'}
            accessibilityState={{ selected: active }}
          >
            <Feather
              name={option}
              size={18}
              color={active ? theme.colors.accent : theme.colors.textSecondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: {
      flex: 1,
    },
    content: {
      paddingBottom: spacing.xxl,
    },
    contentEmpty: {
      flexGrow: 1,
    },
    row: {
      gap: GAP,
      marginBottom: GAP,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filters: {
      flexDirection: 'row',
      gap: spacing.sm - 1,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    chip: {
      justifyContent: 'center',
      minHeight: MIN_TAP - 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
    },
    chipActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    chipLabel: {
      fontSize: typography.subtitle + 1,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    chipLabelActive: {
      color: theme.colors.textOnAccent,
    },
    count: {
      fontFamily: fonts.mono,
      fontSize: typography.caption,
      letterSpacing: 0.6,
      color: theme.colors.textSecondary,
      paddingBottom: spacing.sm,
    },
    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    segmentItem: {
      alignItems: 'center',
      justifyContent: 'center',
      width: MIN_TAP,
      height: MIN_TAP - 8,
    },
    segmentDivider: {
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.border,
    },
    segmentActive: {
      backgroundColor: theme.colors.accentSoft,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    emptyTitle: {
      fontSize: typography.headline,
      marginTop: spacing.sm,
      fontWeight: '700',
      color: theme.colors.text,
    },
    emptyBody: {
      fontSize: typography.body,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
  });

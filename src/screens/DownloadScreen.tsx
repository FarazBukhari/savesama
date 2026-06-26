import * as Clipboard from 'expo-clipboard';
import { useShareIntent } from 'expo-share-intent';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { FormatChoiceModal } from '../components/FormatChoiceModal';
import { Header } from '../components/Header';
import { LinkInput } from '../components/LinkInput';
import { ItemDownloadState, MediaCard } from '../components/MediaCard';
import { extractMedia } from '../extraction/extract';
import { ExtractionError, ExtractionResult, MediaItem } from '../extraction/types';
import { DownloadError, downloadAudioToGallery, downloadToGallery } from '../services/download';
import { colors, radius, spacing, typography } from '../theme';

function stateKey(item: MediaItem, format: 'video' | 'audio' = 'video'): string {
  return item.type === 'video' ? `${item.id}:${format}` : item.id;
}

const IDLE_STATE: ItemDownloadState = { status: 'idle', progress: 0 };

function friendlyMessage(error: unknown): string {
  if (error instanceof ExtractionError || error instanceof DownloadError) {
    return error.userMessage;
  }
  return 'Something went wrong. Check your connection and try again.';
}

interface DownloadScreenProps {
  /** Called after a file is successfully saved, so the Saved tab can refresh. */
  onSaved?: () => void;
}

export function DownloadScreen({ onSaved }: DownloadScreenProps) {
  const insets = useSafeAreaInsets();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  const [linkText, setLinkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [downloads, setDownloads] = useState<Record<string, ItemDownloadState>>({});
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);

  const runExtraction = useCallback(async (text: string) => {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    setResult(null);
    setDownloads({});
    try {
      const extraction = await extractMedia(text);
      setResult(extraction);
    } catch (extractionError) {
      setError(friendlyMessage(extractionError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!hasShareIntent) return;
    const sharedText = shareIntent.webUrl ?? shareIntent.text;
    if (sharedText) {
      setLinkText(sharedText);
      void runExtraction(sharedText);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, runExtraction]);

  const handlePaste = useCallback(async () => {
    const clipboardText = await Clipboard.getStringAsync();
    if (clipboardText.trim().length > 0) {
      setLinkText(clipboardText);
      void runExtraction(clipboardText);
    }
  }, [runExtraction]);

  const handleSubmit = useCallback(() => {
    if (linkText.trim().length > 0) {
      void runExtraction(linkText);
    }
  }, [linkText, runExtraction]);

  const handleDownload = useCallback(
    async (item: MediaItem, format: 'video' | 'audio' = 'video') => {
      const key = stateKey(item, format);
      setDownloads((previous) => ({
        ...previous,
        [key]: { status: 'downloading', progress: 0 },
      }));
      try {
        const downloader = format === 'audio' ? downloadAudioToGallery : downloadToGallery;
        await downloader(item, (fraction) => {
          setDownloads((previous) => ({
            ...previous,
            [key]: { status: 'downloading', progress: fraction },
          }));
        });
        setDownloads((previous) => ({ ...previous, [key]: { status: 'done', progress: 1 } }));
        onSaved?.();
      } catch (downloadError) {
        setDownloads((previous) => ({ ...previous, [key]: { status: 'error', progress: 0 } }));
        setError(friendlyMessage(downloadError));
      }
    },
    [onSaved]
  );

  const handleSavePress = useCallback(
    (item: MediaItem) => {
      if (item.type === 'video') {
        setModalItem(item);
      } else {
        void handleDownload(item);
      }
    },
    [handleDownload]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    setError(null);
    for (const item of result.items) {
      const key = stateKey(item, 'video');
      const state = downloads[key] ?? IDLE_STATE;
      if (state.status === 'done' || state.status === 'downloading') continue;
      await handleDownload(item, 'video');
    }
  }, [result, downloads, handleDownload]);

  const pendingCount = result
    ? result.items.filter(
        (item) => (downloads[stateKey(item, 'video')] ?? IDLE_STATE).status !== 'done'
      ).length
    : 0;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Header />
        <LinkInput
          value={linkText}
          busy={busy}
          onChangeText={setLinkText}
          onPaste={() => void handlePaste()}
          onSubmit={handleSubmit}
        />

        {error ? <ErrorNotice message={error} /> : null}

        {busy ? (
          <View style={styles.fetchingCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.fetchingLabel}>Fetching media…</Text>
          </View>
        ) : null}

        {result ? (
          <View style={styles.results}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>
                {result.username ? `@${result.username}` : 'Post'}
                <Text style={styles.resultsCount}>
                  {'  ·  '}
                  {result.items.length} {result.items.length === 1 ? 'item' : 'items'}
                </Text>
              </Text>
              {result.items.length > 1 && pendingCount > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.downloadAll, pressed && styles.pressed]}
                  onPress={() => void handleDownloadAll()}
                >
                  <Text style={styles.downloadAllLabel}>Save all</Text>
                </Pressable>
              ) : null}
            </View>
            {result.items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                state={downloads[stateKey(item, 'video')] ?? IDLE_STATE}
                onDownload={handleSavePress}
              />
            ))}
          </View>
        ) : null}

        {!busy && !result && !error ? <EmptyState /> : null}
      </ScrollView>

      {modalItem ? (
        <FormatChoiceModal
          visible
          videoState={downloads[stateKey(modalItem, 'video')] ?? IDLE_STATE}
          audioState={downloads[stateKey(modalItem, 'audio')] ?? IDLE_STATE}
          onSaveVideo={() => void handleDownload(modalItem, 'video')}
          onSaveAudio={() => void handleDownload(modalItem, 'audio')}
          onClose={() => setModalItem(null)}
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
  fetchingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  fetchingLabel: {
    marginLeft: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  results: {
    marginTop: spacing.xl,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultsTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  resultsCount: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  downloadAll: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  downloadAllLabel: {
    color: colors.textOnAccent,
    fontWeight: '700',
    fontSize: typography.small,
  },
  pressed: {
    opacity: 0.8,
  },
});

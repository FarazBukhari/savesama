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
import { DownloadError } from '../services/download';
import { DownloadJob, cancelDownload, enqueueDownload, jobId } from '../services/downloadQueue';
import { useDownloadJobs } from '../hooks/useDownloadJobs';
import { colors, radius, shadows, spacing, typography } from '../theme';

const IDLE_STATE: ItemDownloadState = { status: 'idle', progress: 0 };

/**
 * Projects queue jobs onto the per-item state MediaCard renders. 'active' becomes
 * 'downloading'; a cancelled job reads as idle so it can simply be re-queued.
 */
function jobsToStates(jobs: DownloadJob[]): Record<string, ItemDownloadState> {
  const states: Record<string, ItemDownloadState> = {};
  for (const job of jobs) {
    const status: ItemDownloadState['status'] =
      job.status === 'active'
        ? 'downloading'
        : job.status === 'cancelled'
          ? 'idle'
          : job.status;
    states[job.id] = { status, progress: job.progress };
  }
  return states;
}

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
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);
  // Download state lives in the queue module, not here, so a download outlives
  // this screen's re-renders and tab switches.
  const jobs = useDownloadJobs();
  const downloads = jobsToStates(jobs);

  const runExtraction = useCallback(async (text: string) => {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    setResult(null);
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
    (item: MediaItem, format: 'video' | 'audio' = 'video') => {
      setError(null);
      enqueueDownload(item, format, { onSaved });
    },
    [onSaved]
  );

  const handleCancel = useCallback((item: MediaItem) => {
    cancelDownload(jobId(item, 'video'));
    cancelDownload(jobId(item, 'audio'));
  }, []);

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

  const handleDownloadAll = useCallback(() => {
    if (!result) return;
    setError(null);
    // Queue them all; the runner drains them one at a time.
    for (const item of result.items) {
      const state = downloads[jobId(item, 'video')] ?? IDLE_STATE;
      if (state.status === 'done' || state.status === 'downloading' || state.status === 'queued') continue;
      enqueueDownload(item, 'video', { onSaved });
    }
  }, [result, downloads, onSaved]);

  const pendingCount = result
    ? result.items.filter(
        (item) => (downloads[jobId(item, 'video')] ?? IDLE_STATE).status !== 'done'
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
                state={downloads[jobId(item, 'video')] ?? IDLE_STATE}
                onCancel={handleCancel}
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
          videoState={downloads[jobId(modalItem, 'video')] ?? IDLE_STATE}
          audioState={downloads[jobId(modalItem, 'audio')] ?? IDLE_STATE}
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
    padding: spacing.xl,
    marginTop: spacing.md,
    ...shadows.card,
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
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  resultsTitle: {
    fontSize: typography.headline,
    fontWeight: '700',
    color: colors.text,
  },
  resultsCount: {
    fontWeight: '500',
    fontSize: typography.subtitle,
    color: colors.textSecondary,
  },
  downloadAll: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadows.glow,
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

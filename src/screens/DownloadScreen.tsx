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
import { ResolutionChoiceModal } from '../components/ResolutionChoiceModal';
import { useDownloadJobs } from '../hooks/useDownloadJobs';
import { usePreferences } from '../hooks/usePreferences';
import { DownloadJob, cancelDownload, enqueueDownload, jobId } from '../services/downloadQueue';
import { ResolutionPref, resolutionForPlatform } from '../services/preferences';
import Animated from 'react-native-reanimated';

import { ENTER, EXIT, enterRow, REFLOW } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';

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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
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
  const prefs = usePreferences();
  // One-off quality for the item in the format sheet. Cleared when the sheet
  // closes, so it never leaks into the next save or into Settings.
  const [overrideResolution, setOverrideResolution] = useState<ResolutionPref | null>(null);
  const [choosingResolution, setChoosingResolution] = useState(false);

  // Download failures live on the job, not in this component's state — without
  // this they were invisible, which is how a broken audio URL looked like "nothing
  // happens".
  const failedJob = jobs.find((job) => job.status === 'error');
  const visibleError = error ?? failedJob?.error ?? null;

  const defaultResolution = modalItem
    ? resolutionForPlatform(prefs, modalItem.platform ?? 'instagram')
    : 'max';
  const effectiveResolution = overrideResolution ?? defaultResolution;

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
    (item: MediaItem, format: 'video' | 'audio' = 'video', resolution?: ResolutionPref) => {
      setError(null);
      // force: the user pressed Save deliberately, so a finished job re-runs (e.g.
      // to save the same video again at a different quality).
      enqueueDownload(item, format, { onSaved, resolution, force: true });
    },
    [onSaved]
  );

  const handleCancel = useCallback((item: MediaItem) => {
    // Cancels whichever of the two is live; the other call is a no-op.
    cancelDownload(jobId(item, 'video'));
    cancelDownload(jobId(item, 'audio'));
  }, []);

  const closeFormatSheet = useCallback(() => {
    setModalItem(null);
    setChoosingResolution(false);
    setOverrideResolution(null);
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
    // Queue them all; the runner drains them one at a time. No force here: already
    // saved items are skipped rather than downloaded twice.
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

  const activeCount = jobs.filter(
    (job) => job.status === 'active' || job.status === 'queued'
  ).length;
  const failedCount = jobs.filter((job) => job.status === 'error').length;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="Foxy"
          subtitle="Save video, photos and audio from Instagram, Threads and YouTube"
          right={
            failedCount > 0 ? (
              <Animated.Text entering={ENTER} exiting={EXIT} style={[styles.pip, styles.pipError]}>
                {failedCount} failed
              </Animated.Text>
            ) : activeCount > 0 ? (
              <Animated.Text entering={ENTER} exiting={EXIT} style={styles.pip}>
                {activeCount} active
              </Animated.Text>
            ) : null
          }
        />
        <LinkInput
          value={linkText}
          busy={busy}
          onChangeText={setLinkText}
          onPaste={() => void handlePaste()}
          onSubmit={handleSubmit}
        />

        {visibleError ? (
          <ErrorNotice title="Couldn't get that one" message={visibleError} />
        ) : null}

        {busy ? (
          <Animated.View entering={ENTER} exiting={EXIT} style={styles.fetchingRow}>
            <ActivityIndicator color={theme.colors.accent} size="small" />
            <Text style={styles.fetchingLabel}>Reading the post…</Text>
          </Animated.View>
        ) : null}

        {result ? (
          <Animated.View entering={ENTER} layout={REFLOW} style={styles.results}>
            <View style={styles.resultsHeader}>
              <Text style={styles.overline}>
                Found · {result.items.length} {result.items.length === 1 ? 'item' : 'items'}
                {result.username ? ` · @${result.username}` : ''}
              </Text>
              {result.items.length > 1 && pendingCount > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.saveAll, pressed && styles.pressed]}
                  onPress={() => void handleDownloadAll()}
                  accessibilityRole="button"
                  accessibilityLabel={`Save all ${pendingCount} remaining items`}
                >
                  <Text style={styles.saveAllLabel}>Save all</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.group}>
              {result.items.map((item, index) => (
                <Animated.View key={item.id} entering={enterRow(index)} layout={REFLOW}>
                  <MediaCard
                    item={item}
                    state={downloads[jobId(item, 'video')] ?? IDLE_STATE}
                    onCancel={handleCancel}
                    onDownload={handleSavePress}
                    last={index === result.items.length - 1}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {!busy && !result && !error ? (
          <Animated.View entering={ENTER} exiting={EXIT}>
            <EmptyState />
          </Animated.View>
        ) : null}
      </ScrollView>

      {modalItem ? (
        <>
          <FormatChoiceModal
            visible={!choosingResolution}
            videoState={downloads[jobId(modalItem, 'video')] ?? IDLE_STATE}
            audioState={downloads[jobId(modalItem, 'audio')] ?? IDLE_STATE}
            resolution={effectiveResolution}
            resolutionOverridden={overrideResolution !== null}
            onSaveVideo={() => {
              handleDownload(modalItem, 'video', overrideResolution ?? undefined);
              closeFormatSheet();
            }}
            onSaveAudio={() => {
              // Sheet stays open: unlike video, audio has no card row of its own, so
              // closing here would leave the download with nowhere to show progress.
              // The Audio row reports its own percentage and ✓ Saved state.
              handleDownload(modalItem, 'audio');
            }}
            onChangeResolution={() => setChoosingResolution(true)}
            onClose={closeFormatSheet}
          />
          <ResolutionChoiceModal
            visible={choosingResolution}
            title="Quality for this download"
            value={effectiveResolution}
            onSelect={(value) => {
              setOverrideResolution(value);
              setChoosingResolution(false);
            }}
            onClose={() => setChoosingResolution(false)}
          />
        </>
      ) : null}
    </>
  );
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
    pip: {
      fontFamily: fonts.mono,
      fontSize: typography.caption,
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    pipError: {
      color: theme.colors.error,
      backgroundColor: theme.colors.errorSoft,
    },
    fetchingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: spacing.lg,
    },
    fetchingLabel: {
      color: theme.colors.textSecondary,
      fontSize: typography.body,
    },
    results: {
      marginTop: spacing.xl,
    },
    resultsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    overline: {
      flexShrink: 1,
      fontSize: typography.caption,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
    },
    saveAll: {
      backgroundColor: theme.colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
      minHeight: MIN_TAP - 8,
    },
    saveAllLabel: {
      color: theme.colors.textOnAccent,
      fontWeight: '700',
      fontSize: typography.subtitle + 1,
    },
    group: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    pressed: {
      opacity: 0.7,
    },
  });

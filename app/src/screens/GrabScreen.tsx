import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, IconButton, SectionTitle, webNoOutline } from '@/components/controls';
import { Icon, PLATFORM_ICON } from '@/components/Icon';
import { JobRow } from '@/components/JobRow';
import { StatusPill, useServerState } from '@/components/StatusPill';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { relativeTime } from '@/lib/format';
import { isActive } from '@/lib/jobState';
import { displayLink, hostOf, parseLink, parseLinks, PLATFORM_NAMES, PLATFORMS } from '@/lib/links';
import { EDGE, radius, type as typeRoles } from '@/lib/theme';
import { clearLinks } from '@/state/history';
import { intakeText } from '@/state/lifecycle';
import { useJobRows } from '@/state/rows';
import { checkServer } from '@/state/servers';
import { historyStore, settingsStore, uiStore } from '@/state/stores';
import { cancelJob, retryJob, syncJobs } from '@/state/sync';
import { canOpenTermux, openTermux } from '@/state/system';
import { confirm, haptic, openSheet } from '@/state/ui';

export function GrabScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const fieldText = uiStore.use((s) => s.fieldText);
  const rows = useJobRows();
  const active = rows.filter((r) => isActive(r.stage));
  const links = historyStore.use((s) => s.links);
  const recent = links.slice(0, 5);

  useEffect(() => {
    if (fieldText == null) return;
    // Text handed over by the share sheet or a finished save; consumed once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(fieldText);
    uiStore.set({ fieldText: null });
  }, [fieldText]);

  const parsed = useMemo(() => parseLinks(text), [text]);
  const n = parsed.links.length;

  const get = () => {
    if (!n) return;
    haptic.light();
    intakeText(parsed.links.map((l) => l.url).join('\n'));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.ground }} contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: c.deck, paddingTop: insets.top, paddingBottom: 20 }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: EDGE, gap: 12, marginTop: 8 }}>
          <T role="wordmark" color="onDeck" style={{ flex: 1 }} accessibilityRole="header">
            SaveSama
          </T>
          <StatusPill onDeck onPress={() => router.navigate('/server')} />
        </View>
        <View style={{ paddingHorizontal: EDGE, gap: 12, marginTop: 12 }}>
          <PasteField text={text} setText={setText} n={n} onGet={get} />
          <ClipboardSuggestion text={text} />
          <ParseMessage text={text} n={n} skipped={parsed.skipped} />
          <DeckBanners />
        </View>
      </View>

      {active.length ? (
        <View>
          <SectionTitle title="Now saving" meta={`${active.length} ${active.length === 1 ? 'job' : 'jobs'}`} />
          <View style={{ gap: 8, marginHorizontal: 8 }}>
            {active.slice(0, 2).map((r) => (
              <JobRow key={r.key} row={r} card onCancel={() => void cancelJob(r.jobId, () => void retryJob(r.jobId))} />
            ))}
          </View>
          {active.length > 2 ? (
            <View style={{ paddingHorizontal: 8, marginTop: 4 }}>
              <Button variant="text" label="See all in Activity" onPress={() => router.navigate('/activity')} />
            </View>
          ) : null}
        </View>
      ) : null}

      {recent.length ? (
        <View>
          <SectionTitle
            title="Recent"
            trailing={
              <Button
                variant="text"
                label="Clear"
                onPress={() =>
                  confirm({
                    title: 'Clear recent links?',
                    body: "They're removed from this list and from duplicate checks. Saved files stay.",
                    confirm: 'Clear',
                    destructive: true,
                    onConfirm: clearLinks,
                  })
                }
              />
            }
          />
          {recent.map((l) => (
            <Pressable
              key={l.key}
              onPress={() => openSheet({ kind: 'preview', url: l.url })}
              android_ripple={{ color: c.ripple }}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 64, paddingHorizontal: EDGE, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pressed ? c.pressed : 'transparent' })}
            >
              <Icon name={PLATFORM_ICON[l.platform]} />
              <View style={{ flex: 1 }}>
                <T role="body" numberOfLines={1}>
                  {l.title || l.author || displayLink(l.url)}
                </T>
                <T role="meta" color="ink2" numberOfLines={1}>
                  {`${hostOf(l.url)} · Saved ${relativeTime(l.savedAt)}`}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!active.length && !recent.length ? (
        <View style={{ paddingHorizontal: EDGE, paddingTop: 24, gap: 16 }}>
          <T role="body" color="ink2">
            Share a post to SaveSama from any of these apps, or paste its link above.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 12 }}>
            {PLATFORMS.map((p) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={PLATFORM_ICON[p]} color="ink2" />
                <T role="metaStrong" color="ink2">
                  {PLATFORM_NAMES[p]}
                </T>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PasteField({ text, setText, n, onGet }: { text: string; setText: (t: string) => void; n: number; onGet: () => void }) {
  const { c, scheme } = useTheme();
  const [focus, setFocus] = useState(false);
  const paste = async () => {
    haptic.light();
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (!clip) return;
    setText(text.trim() ? `${text.trim()}\n${clip.trim()}` : clip.trim());
  };
  return (
    <View style={{ backgroundColor: c.deckWell, borderRadius: radius.lg, padding: 16, borderWidth: 2, borderColor: focus ? c.ink : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="Paste links from YouTube, Instagram, TikTok, Facebook, Threads or Reddit. One per line."
          placeholderTextColor={scheme === 'light' ? c.ink3 : c.ink3}
          selectionColor={c.select}
          cursorColor={c.ink}
          accessibilityLabel="Links"
          maxFontSizeMultiplier={1.6}
          textAlignVertical="top"
          style={[typeRoles.bodyLarge, { flex: 1, color: c.ink, minHeight: 72, maxHeight: 6 * 24, padding: 0 }, webNoOutline]}
        />
        {text ? (
          <View style={{ marginTop: -12, marginRight: -12 }}>
            <IconButton name="X" label="Clear links" onPress={() => setText('')} color="ink2" />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button variant="tonal" label="Paste" icon="ClipboardText" onPress={paste} />
        <Button label={n > 1 ? `Get ${n} links` : 'Get'} disabled={n === 0} onPress={onGet} />
      </View>
    </View>
  );
}

function ParseMessage({ text, n, skipped }: { text: string; n: number; skipped: number }) {
  if (!text.trim()) return null;
  if (n === 0) {
    return (
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 8 }} accessibilityLiveRegion="polite">
        <View style={{ paddingTop: 2 }}>
          <Icon name="WarningCircle" size={16} color="onDeck" />
        </View>
        <T role="meta" color="onDeck" style={{ flex: 1 }}>
          {"That isn't a link SaveSama can open. Try a link from YouTube, Instagram, TikTok, Facebook, Threads or Reddit."}
        </T>
      </View>
    );
  }
  if (n === 1 && !skipped) return null;
  const parts = [n > 1 ? `${n} links ready.` : '1 link ready.'];
  if (skipped) parts.push(`${skipped} ${skipped === 1 ? "line isn't a link SaveSama can open and will be skipped." : "lines aren't links SaveSama can open and will be skipped."}`);
  return (
    <T role="meta" color="onDeck2" style={{ paddingHorizontal: 8 }} accessibilityLiveRegion="polite">
      {parts.join(' ')}
    </T>
  );
}

function ClipboardSuggestion({ text }: { text: string }) {
  const { c } = useTheme();
  const [link, setLink] = useState<{ url: string; platform: ReturnType<typeof parseLink> } | null>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const check = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      if (!(await Clipboard.hasStringAsync())) return setLink(null);
      const clip = await Clipboard.getStringAsync();
      const found = parseLinks(clip).links[0];
      const { dismissedClipboard, lastResolved } = settingsStore.get();
      if (!found || dismissedClipboard.includes(found.url) || found.url === lastResolved || textRef.current.includes(found.url)) return setLink(null);
      setLink({ url: found.url, platform: found });
    } catch {
      setLink(null);
    }
  }, []);

  useEffect(() => {
    // Reads the clipboard once per foreground; the state update happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, [check]);

  if (!link || text.includes(link.url)) return null;
  const platform = link.platform?.platform;
  return (
    <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(120)}>
      <View style={{ backgroundColor: c.deckWell, borderRadius: radius.banner, paddingVertical: 8, paddingRight: 4, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {platform ? <Icon name={PLATFORM_ICON[platform]} /> : null}
        <View style={{ flex: 1 }}>
          <T role="metaStrong">Link on your clipboard</T>
          <T role="meta" color="ink2" numberOfLines={1} ellipsizeMode="middle">
            {displayLink(link.url)}
          </T>
        </View>
        <Button
          label="Get it"
          compact
          onPress={() => {
            haptic.light();
            setLink(null);
            intakeText(link.url);
          }}
        />
        <IconButton
          name="X"
          label="Ignore this link"
          color="ink2"
          onPress={() => {
            settingsStore.set((s) => ({ dismissedClipboard: [link.url, ...s.dismissedClipboard].slice(0, 50) }));
            setLink(null);
          }}
        />
      </View>
    </Animated.View>
  );
}

function DeckBanners() {
  const { server, status } = useServerState();
  if (!server) {
    return (
      <Banner tone="info" icon="Plugs" onDeck title="Pair a server to start saving" body="It takes a minute on this phone.">
        <Button
          variant="text"
          label="Pair a server"
          onPress={() => {
            router.navigate('/server');
            openSheet({ kind: 'pair' });
          }}
        />
      </Banner>
    );
  }
  if (status === 'offline') {
    return (
      <Banner tone="err" icon="Plugs" onDeck title="Server isn't answering" body="Open Termux and run savesama, then come back. SaveSama checks again by itself.">
        {canOpenTermux ? <Button variant="text" label="Open Termux" onPress={() => void openTermux()} /> : null}
        <Button
          variant="text"
          label="Try again"
          onPress={async () => {
            if ((await checkServer(server)) === 'online') void syncJobs();
          }}
        />
      </Banner>
    );
  }
  return null;
}

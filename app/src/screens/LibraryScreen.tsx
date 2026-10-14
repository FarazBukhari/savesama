import { useFocusEffect, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Chip, EmptyState, IconButton, MediaPill, Skeleton, Thumb, webNoOutline } from '@/components/controls';
import { Icon } from '@/components/Icon';
import { PressScale } from '@/components/Press';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { dateGroup, formatDuration } from '@/lib/format';
import { PLATFORM_NAMES } from '@/lib/links';
import { EDGE, radius, type as typeRoles } from '@/lib/theme';
import { allowAllMedia } from '@/state/gallery';
import { deleteItems, libraryStore, loadLibrary, typeName, type LibraryItem } from '@/state/library';
import { historyStore } from '@/state/stores';
import { confirm, haptic, snack } from '@/state/ui';

type Filter = 'all' | 'video' | 'image' | 'audio';
type Entry = { kind: 'header'; title: string; key: string } | { kind: 'row'; items: LibraryItem[]; key: string };

export const libraryView: { filter: Filter; query: string } = { filter: 'all', query: '' };

export function filterItems(items: LibraryItem[], filter: Filter, query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (filter !== 'all' && i.type !== filter) return false;
    if (!q) return true;
    return [i.title, i.author, i.platform ? PLATFORM_NAMES[i.platform] : '', i.filename].some((s) => s?.toLowerCase().includes(q));
  });
}

export function LibraryScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cols = width >= 600 ? 4 : 3;
  const tile = (width - (cols - 1) * 2) / cols;
  const { items, status, access } = libraryStore.use((s) => s);
  const savesCount = historyStore.use((s) => s.saves.length);
  const [filter, setFilter] = useState<Filter>(libraryView.filter);
  const [query, setQuery] = useState(libraryView.query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selecting = selected.size > 0;
  useEffect(() => {
    // The viewer swipes through the same filtered list.
    libraryView.filter = filter;
    libraryView.query = query;
  }, [filter, query]);

  useFocusEffect(
    useCallback(() => {
      if (savesCount >= 0) void loadLibrary();
    }, [savesCount]),
  );

  const visible = useMemo(() => filterItems(items, filter, query), [items, filter, query]);
  const entries = useMemo(() => {
    const out: Entry[] = [];
    let group = '';
    let row: LibraryItem[] = [];
    const flush = () => {
      if (row.length) out.push({ kind: 'row', items: row, key: `r:${row[0].key}` });
      row = [];
    };
    for (const it of visible) {
      const g = dateGroup(it.savedAt);
      if (g !== group) {
        flush();
        group = g;
        out.push({ kind: 'header', title: g, key: `h:${g}` });
      }
      row.push(it);
      if (row.length === cols) flush();
    }
    flush();
    return out;
  }, [visible, cols]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const removeSelected = () => {
    const keys = [...selected];
    const one = keys.length === 1 ? items.find((i) => i.key === keys[0]) : null;
    confirm({
      title: one ? `Delete this ${typeName(one.type).toLowerCase()}?` : `Delete ${keys.length} files?`,
      body: one
        ? "It's removed from your phone and the SaveSama album. This can't be undone."
        : "They're removed from your phone and the SaveSama album. This can't be undone.",
      confirm: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteItems(keys);
          setSelected(new Set());
        } catch {
          void loadLibrary();
        }
      },
    });
  };

  const shareSelected = async () => {
    const it = items.find((i) => selected.has(i.key));
    if (!it) return;
    try {
      await Sharing.shareAsync(it.uri);
    } catch {
      snack("Couldn't share this file");
    }
  };

  const header = (
    <View>
      {selecting ? (
        <View style={{ height: 88, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
          <IconButton name="X" label="Exit selection" onPress={() => setSelected(new Set())} />
          <T role="title" style={{ flex: 1 }}>{`${selected.size} selected`}</T>
          {selected.size === 1 ? <IconButton name="ShareNetwork" label="Share" onPress={shareSelected} /> : null}
          <IconButton name="Trash" label="Delete" onPress={removeSelected} />
        </View>
      ) : (
        <View style={{ height: 88, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: EDGE, paddingBottom: 12 }}>
          <T role="display" accessibilityRole="header" style={{ flex: 1 }}>
            Library
          </T>
          {items.length ? (
            <T role="meta" color="ink2" style={{ marginBottom: 4 }}>
              {`${items.length} saved`}
            </T>
          ) : null}
        </View>
      )}
      {items.length || query ? (
        <View style={{ paddingHorizontal: EDGE, gap: 12, paddingBottom: 4 }}>
          <View style={{ height: 48, borderRadius: radius.pill, backgroundColor: c.sunk, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 10 }}>
            <Icon name="MagnifyingGlass" size={20} color="ink2" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your saves"
              placeholderTextColor={c.placeholderOnSunk}
              selectionColor={c.select}
              cursorColor={c.ink}
              accessibilityLabel="Search your saves"
              returnKeyType="search"
              maxFontSizeMultiplier={1.6}
              style={[typeRoles.body, { flex: 1, color: c.ink, paddingVertical: 10 }, webNoOutline]}
            />
            {query ? <IconButton name="X" label="Clear search" onPress={() => setQuery('')} color="ink2" size={20} /> : <View style={{ width: 16 }} />}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingVertical: 6 }}>
            {(
              [
                ['all', 'All'],
                ['video', 'Video'],
                ['image', 'Photo'],
                ['audio', 'Audio'],
              ] as [Filter, string][]
            ).map(([f, l]) => (
              <Chip key={f} label={l} selected={filter === f} onPress={() => setFilter(f)} role="radio" />
            ))}
          </View>
        </View>
      ) : null}
      {access === 'limited' ? (
        <Banner tone="warn" icon="ImageSquare" title="SaveSama can only see some of your media" body="Allow access to all photos, videos and audio to see everything it saved." style={{ marginHorizontal: 8, marginTop: 12 }}>
          <Button variant="text" label="Allow all" onPress={() => void allowAllMedia().then(() => loadLibrary())} />
        </Banner>
      ) : null}
    </View>
  );

  let empty: React.ReactNode = null;
  if (status === 'loading' && !items.length) {
    empty = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 24 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} style={{ width: tile, height: tile, borderRadius: radius.xs }} />
        ))}
      </View>
    );
  } else if (access === 'denied' || access === 'blocked' || access === 'undetermined') {
    empty = (
      <EmptyState
        icon="ImageSquare"
        title="SaveSama can't see your gallery"
        body="Allow access to photos, videos and audio so the Library can show what you've saved."
        action={
          access === 'blocked' ? (
            <Button variant="tonal" label="Open settings" onPress={() => void Linking.openSettings()} />
          ) : (
            <Button variant="tonal" label="Allow access" onPress={() => void loadLibrary(true)} />
          )
        }
      />
    );
  } else if (status === 'error') {
    empty = <EmptyState icon="WarningCircle" title="Couldn't read your gallery" body="Something went wrong while loading." action={<Button variant="tonal" label="Try again" onPress={() => void loadLibrary()} />} />;
  } else if (!items.length) {
    empty = (
      <EmptyState
        icon="Images"
        title="Nothing saved yet"
        body="Everything SaveSama saves lands here and in your gallery's SaveSama album."
        action={<Button variant="tonal" label="Grab a link" onPress={() => router.navigate('/')} />}
      />
    );
  } else if (!visible.length) {
    empty = (
      <EmptyState
        icon="MagnifyingGlass"
        title={query ? `No saves match "${query}"` : 'Nothing here'}
        body="Try a different word, or another filter."
        action={<Button variant="tonal" label="Clear search" onPress={() => { setQuery(''); setFilter('all'); }} />}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <FlatList
        data={empty ? [] : entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ? <View style={{ marginTop: status === 'loading' ? 0 : 96 }}>{empty}</View> : null}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => void loadLibrary()}
        refreshing={false}
        renderItem={({ item: e }) =>
          e.kind === 'header' ? (
            <T role="title" accessibilityRole="header" style={{ paddingHorizontal: EDGE, marginTop: 24, marginBottom: 8 }}>
              {e.title}
            </T>
          ) : (
            <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
              {e.items.map((it) => (
                <Tile
                  key={it.key}
                  item={it}
                  size={tile}
                  selecting={selecting}
                  selected={selected.has(it.key)}
                  onPress={() => (selecting ? toggle(it.key) : router.push({ pathname: '/viewer', params: { key: it.key } }))}
                  onLongPress={() => {
                    haptic.medium();
                    toggle(it.key);
                  }}
                />
              ))}
            </View>
          )
        }
      />
    </View>
  );
}

function Tile({
  item,
  size,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  item: LibraryItem;
  size: number;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { c } = useTheme();
  const audioNoThumb = item.type === 'audio' && !item.thumbnail;
  const label = [typeName(item.type), item.title, item.duration ? formatDuration(item.duration) : ''].filter(Boolean).join(', ');
  return (
    <PressScale
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={selecting ? 0.92 : 0.97}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={label}
      style={{ width: size, height: size, transform: [{ scale: selected ? 0.92 : 1 }] }}
    >
      {audioNoThumb ? (
        <View style={{ width: size, height: size, borderRadius: radius.xs, backgroundColor: c.sunk, padding: 12, paddingTop: 40, justifyContent: 'space-between' }}>
          <Icon name="MusicNotes" size={32} color="ink2" />
          <T role="caption" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontVariant: [] }}>
            {item.title}
          </T>
        </View>
      ) : (
        <Thumb
          uri={item.thumbnail ?? item.uri}
          platform={item.platform ?? undefined}
          size={size}
          rounded={radius.xs}
          duration={item.type === 'video' ? item.duration : null}
        />
      )}
      {item.type === 'audio' ? <MediaPill text="Audio" style={{ position: 'absolute', top: 6, left: 6 }} /> : null}
      {selecting ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? c.select : c.mediaScrim,
            borderWidth: selected ? 0 : 2,
            borderColor: '#FFFFFF',
          }}
        >
          {selected ? <Icon name="Check" size={16} color="onSelect" weight="bold" /> : null}
        </View>
      ) : null}
    </PressScale>
  );
}

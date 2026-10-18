import { useEffect, useRef } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';

import { parseLinks } from '@/lib/links';

import { checkServer, discoverLocal, findServer, LOCAL } from './servers';
import { activeServer, serversStore, uiStore } from './stores';
import { hasUnfinished, syncJobs } from './sync';
import { closeAllSheets, handleBack, openSheet } from './ui';

/** Foreground: re-check the server, sync jobs, pull finished files. Poll while foregrounded. */
export function useAppLifecycle(ready: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = AppState.currentState === 'active' || Platform.OS === 'web';
    let ticks = 0;

    const onForeground = async () => {
      const server = activeServer();
      if (server) {
        await checkServer(server);
        void syncJobs();
      }
      if (!findServer(LOCAL.host, LOCAL.port)) void discoverLocal();
    };

    const loop = async () => {
      if (!active) return;
      ticks += 1;
      const server = activeServer();
      if (server) {
        const status = serversStore.get().status[server.id];
        if (status === 'offline') {
          // Termux may come back on its own: probe every 5 s while offline.
          if (ticks % 5 === 0) {
            const st = await checkServer(server, true);
            if (st === 'online') void syncJobs();
          }
        } else if (status !== 'updating' && (hasUnfinished() || ticks % 5 === 0)) {
          await syncJobs();
        }
      }
      timer.current = setTimeout(loop, 1000);
    };

    void onForeground();
    timer.current = setTimeout(loop, 1000);
    const sub = AppState.addEventListener('change', (st) => {
      const nowActive = st === 'active';
      if (nowActive && !active) {
        active = true;
        void onForeground();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(loop, 1000);
      } else if (!nowActive) {
        active = false;
        if (timer.current) clearTimeout(timer.current);
      }
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ready]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => handleBack());
    return () => sub.remove();
  }, []);
}

/** Share sheet / pasted text → Preview (one link), Batch (several) or the Grab field (none). */
export function intakeText(text: string): 'preview' | 'batch' | 'none' {
  const { links } = parseLinks(text);
  closeAllSheets();
  if (links.length === 1) {
    openSheet({ kind: 'preview', url: links[0].url });
    return 'preview';
  }
  if (links.length > 1) {
    openSheet({ kind: 'batch', urls: links.map((l) => l.url) });
    return 'batch';
  }
  uiStore.set({ fieldText: text });
  return 'none';
}

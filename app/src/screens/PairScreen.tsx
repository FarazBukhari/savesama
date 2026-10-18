import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/components/theme';
import { validatePair } from '@/lib/pairing';
import { openSheet, snack } from '@/state/ui';

/** Target of savesama://pair?host=&port=&token=&name= — confirms over whatever was open. */
export function PairScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string; name?: string }>();
  useEffect(() => {
    const info = validatePair({ host: params.host ?? '', port: params.port ?? '', token: params.token ?? '', name: params.name ?? null });
    if (router.canGoBack()) router.back();
    else router.replace('/');
    if (info) openSheet({ kind: 'pairConfirm', info });
    else snack("That isn't a SaveSama pairing code.");
  }, [params.host, params.port, params.token, params.name]);
  return <View style={{ flex: 1, backgroundColor: c.ground }} />;
}

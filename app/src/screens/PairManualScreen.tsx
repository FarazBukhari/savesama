import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Field, IconButton } from '@/components/controls';
import { SmallBar } from '@/components/Screen';
import { useTheme } from '@/components/theme';
import { pairErrorCopy } from '@/lib/copy';
import { hostPort, isValidHost, parsePairLink, parsePort } from '@/lib/pairing';
import { EDGE } from '@/lib/theme';
import { pairServer } from '@/state/servers';

const back = () => (router.canGoBack() ? router.back() : router.replace('/server'));

export function PairManualScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8765');
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ host?: string; port?: string; token?: string }>({});
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pasting a whole savesama://pair link into any field fills the form.
  const absorb = (text: string, set: (v: string) => void) => {
    const info = parsePairLink(text);
    if (info) {
      setHost(info.host);
      setPort(String(info.port));
      setToken(info.token);
      if (info.name) setName(info.name);
      return;
    }
    set(text);
  };

  const submit = async () => {
    const e: typeof errors = {};
    const h = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const p = parsePort(port);
    if (!isValidHost(h)) e.host = 'Enter an address like 192.168.1.20';
    if (p === null) e.port = 'Port is a number from 1 to 65535';
    if (!token.trim()) e.token = 'Paste the key the server printed';
    setErrors(e);
    setResult(null);
    if (Object.keys(e).length || p === null) return;
    setBusy(true);
    try {
      await pairServer({ host: h, port: p, token: token.trim(), name: name.trim() || null });
      setBusy(false);
      back();
    } catch (err) {
      setBusy(false);
      setResult(pairErrorCopy(err, hostPort(h, p)));
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: c.ground }}>
      <SmallBar title="Enter details" onBack={back} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: EDGE, paddingTop: 8, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" helper="Optional. Shown in the Server tab." placeholder="My PC" value={name} onChangeText={(t) => absorb(t, setName)} autoCapitalize="words" />
        <Field
          label="Address"
          placeholder="192.168.1.20"
          value={host}
          onChangeText={(t) => absorb(t, setHost)}
          error={errors.host}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Field label="Port" placeholder="8765" value={port} onChangeText={setPort} error={errors.port} keyboardType="number-pad" />
        <Field
          label="Key"
          placeholder="Paste the key the server printed"
          value={token}
          onChangeText={(t) => absorb(t, setToken)}
          error={errors.token}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          trailing={<IconButton name={show ? 'EyeSlash' : 'Eye'} label={show ? 'Hide key' : 'Show key'} onPress={() => setShow(!show)} color="ink2" />}
        />
        {result ? <Banner tone="err" icon="WarningCircle" title={result} style={{ marginHorizontal: -12 }} /> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: EDGE, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
        <Button label="Pair" big full loading={busy} loadingLabel="Checking…" onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

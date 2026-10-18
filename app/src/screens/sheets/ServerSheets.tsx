import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, ListGroup, ListRow } from '@/components/controls';
import { Sheet, useSheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { EDGE } from '@/lib/theme';
import { removeServer, renameServer } from '@/state/servers';
import { serversStore } from '@/state/stores';
import { confirm, openSheet } from '@/state/ui';

export function ServerMenuSheet({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <Menu id={id} />
    </Sheet>
  );
}

function Menu({ id }: { id: string }) {
  const { close } = useSheet();
  const server = serversStore.use((s) => s.servers.find((x) => x.id === id));
  if (!server) return null;
  return (
    <View style={{ paddingBottom: 8 }}>
      <T role="title" style={{ paddingHorizontal: EDGE, paddingVertical: 16 }} numberOfLines={1}>
        {server.name}
      </T>
      <ListGroup>
        <ListRow
          icon="PencilSimple"
          title="Rename"
          onPress={() => {
            close();
            openSheet({ kind: 'rename', id });
          }}
        />
        <ListRow
          icon="Trash"
          title="Remove"
          danger
          onPress={() => {
            close();
            confirm({
              title: `Remove ${server.name}?`,
              body: 'SaveSama forgets its address and key. You can pair it again any time.',
              confirm: 'Remove',
              destructive: true,
              onConfirm: () => void removeServer(id),
            });
          }}
        />
      </ListGroup>
    </View>
  );
}

export function RenameSheet({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Rename server">
      <Rename id={id} />
    </Sheet>
  );
}

function Rename({ id }: { id: string }) {
  const { close } = useSheet();
  const server = serversStore.get().servers.find((x) => x.id === id);
  const [name, setName] = useState(server?.name ?? '');
  const save = () => {
    renameServer(id, name);
    close();
  };
  return (
    <View style={{ paddingHorizontal: EDGE, paddingBottom: 8, gap: 16 }}>
      <T role="headline" style={{ marginTop: 8 }}>
        Rename server
      </T>
      <Field label="Name" value={name} onChangeText={setName} autoFocus onSubmitEditing={save} returnKeyType="done" />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="text" label="Cancel" onPress={close} />
        <Button label="Save" onPress={save} disabled={!name.trim()} />
      </View>
    </View>
  );
}

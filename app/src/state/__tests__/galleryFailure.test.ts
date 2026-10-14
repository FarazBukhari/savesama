import { saveToGallery } from '../gallery';
import { jobsStore, serversStore, settingsStore } from '../stores';
import { syncJobs } from '../sync';

jest.mock('../persist', () => ({ loadJson: jest.fn(), persistStore: jest.fn(), getToken: jest.fn(), setToken: jest.fn(), deleteToken: jest.fn() }));
jest.mock('../ui', () => ({ snack: jest.fn(), haptic: { success: jest.fn(), error: jest.fn(), light: jest.fn() } }));
jest.mock('../gallery', () => ({
  galleryAccess: jest.fn(async () => 'granted'),
  saveToGallery: jest.fn(async () => {
    throw new Error('Primary directory DCIM not allowed for content://media/external/file');
  }),
  deleteFromGallery: jest.fn(async () => undefined),
  listGallery: jest.fn(async () => []),
}));
jest.mock('../download', () => {
  class TransferError extends Error {
    kind: string;
    constructor(k: string, message: string) {
      super(message);
      this.kind = k;
    }
  }
  return {
    downloadJobFile: jest.fn(async () => ({ uri: 'file:///cache/a.mp4', size: 10 })),
    discardLocal: jest.fn(),
    discardPartial: jest.fn(),
    TransferError,
  };
});

const job = {
  id: 'job1', url: 'https://www.tiktok.com/@a/video/1', platform: 'tiktok', status: 'done', progress: 1,
  title: 'Clip', author: 'a', thumbnail: null, mode: 'media', quality: 'max', created_at: 1, error: null,
  file: { name: 'a.mp4', size: 10, mime: 'video/mp4', type: 'video' },
};

it('a gallery refusal is reported as a gallery failure, not a stopped transfer', async () => {
  settingsStore.set({ keepOnServer: false });
  globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({ jobs: [job] }), { status: 200 })) as unknown as typeof fetch;
  serversStore.set({
    servers: [{ id: 's1', name: 'T', host: '127.0.0.1', port: 8765, addedAt: 0, lastSeen: null }],
    activeId: 's1',
    tokens: { s1: 't' },
  });

  await syncJobs();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));

  expect(saveToGallery).toHaveBeenCalled();
  expect(jobsStore.get().transfers.job1).toMatchObject({ phase: 'failed', failure: 'gallery' });
  // The server copy must stay until the file is really in the gallery.
  const calls = (globalThis.fetch as jest.Mock).mock.calls.map(([, init]) => init?.method ?? 'GET');
  expect(calls).not.toContain('DELETE');
});

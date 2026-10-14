import { downloadJobFile } from '../download';
import { addSave } from '../history';
import { deleteItems, libraryStore } from '../library';
import { historyStore, jobsStore, serversStore, settingsStore } from '../stores';
import { syncJobs } from '../sync';

jest.mock('../persist', () => ({ loadJson: jest.fn(), persistStore: jest.fn(), getToken: jest.fn(), setToken: jest.fn(), deleteToken: jest.fn() }));
jest.mock('../ui', () => ({ snack: jest.fn(), haptic: { success: jest.fn(), error: jest.fn(), light: jest.fn() } }));
jest.mock('../gallery', () => ({
  galleryAccess: jest.fn(async () => 'granted'),
  saveToGallery: jest.fn(async () => 'content://media/1'),
  deleteFromGallery: jest.fn(async () => undefined),
  listGallery: jest.fn(async () => []),
}));
jest.mock('../download', () => ({
  downloadJobFile: jest.fn(async () => ({ uri: 'file:///cache/a.mp4', size: 10 })),
  discardLocal: jest.fn(),
  discardPartial: jest.fn(),
  TransferError: class extends Error {},
}));

const job = {
  id: 'job1',
  url: 'https://www.tiktok.com/@a/video/1',
  platform: 'tiktok',
  status: 'done',
  progress: 1,
  title: 'Clip',
  author: 'a',
  thumbnail: null,
  mode: 'media',
  quality: 'max',
  created_at: 1,
  error: null,
  file: { name: 'a.mp4', size: 10, mime: 'video/mp4', type: 'video' },
};

it('a file deleted from the Library is not downloaded again when the server keeps its copy', async () => {
  settingsStore.set({ keepOnServer: true });
  serversStore.set({
    servers: [{ id: 's1', name: 'T', host: '127.0.0.1', port: 8765, addedAt: 0, lastSeen: null }],
    activeId: 's1',
    tokens: { s1: 't' },
  });
  globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({ jobs: [job] }), { status: 200 })) as unknown as typeof fetch;

  addSave({ jobId: 'job1', assetId: 'content://media/1', uri: null, url: job.url, platform: 'tiktok', title: 'Clip', author: 'a', thumbnail: null, type: 'video', mime: 'video/mp4', name: 'a.mp4', size: 10, mode: 'media', quality: 'max', savedAt: 1 } as never);
  libraryStore.set({ items: [{ key: 'content://media/1', assetId: 'content://media/1' } as never], status: 'ready' });

  await deleteItems(['content://media/1']);
  expect(historyStore.get().saves).toHaveLength(0);
  expect(jobsStore.get().hidden).toContain('job1');

  await syncJobs();
  await new Promise((r) => setTimeout(r, 0));
  expect(downloadJobFile).not.toHaveBeenCalled();
});

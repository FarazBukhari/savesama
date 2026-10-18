import { safeName } from '../download';

// Not in the package's exports, so load expo-file-system's real path join by file.
const { PathUtilities } = jest.requireActual<{ PathUtilities: { join: (...p: string[]) => string } }>(
  '../../../node_modules/expo-file-system/src/pathUtilities/index.ts',
);

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

const CACHE = 'file:///data/user/0/com.foxysama.savesama/cache/transfers';
// The URL expo-file-system builds for new File(dir, name), with its own join (WHATWG URL, like
// expo's runtime). Its last segment must match what android.webkit.MimeTypeMap accepts; that set
// is also legal for java.net.URI, which rejects e.g. [ ] (the first on-device failure).
const lastSegment = (name: string) => PathUtilities.join(CACHE, name).split('/').pop()!;
const ANDROID_OK = /^[a-zA-Z_0-9.\-()%]+$/;

it.each([
  ["EP. 02 Don't Get Sick, Idiot. 🌧️💚 [DedbYT-zqSl].mp4", 'EP. 02 Don’t Get Sick Idiot. 🌧️💚 (DedbYT-zqSl).mp4'],
  ['He thinks she hates him... but she’s... [DedQq1].mp4', 'He thinks she hates him... but she’s... (DedQq1).mp4'],
  ['#girls #women #job #work [Deb_p3pxcjQ].mp4', 'girls women job work (Deb_p3pxcjQ).mp4'],
  ['Wow!!! ~so* good~ & "more"; a=b, c@d [x].M4A', 'Wow so good more a b c d (x).m4a'],
  ['کراچی کی بارش [abc].jpg', 'کراچی کی بارش (abc).jpg'],
  ['tab\there nbsp {y}.mp4', 'tab here nbsp (y).mp4'],
])('%s', (input, expected) => {
  const out = safeName(input, 'job123456789');
  expect(out).toBe(expected);
  expect(lastSegment(out)).toMatch(ANDROID_OK);
});

it('stays under the 255-byte file name limit without splitting an emoji', () => {
  const out = safeName(`${'💚'.repeat(100)}.mp4`, 'job123456789');
  expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(155);
  expect(out).toBe(`${'💚'.repeat(37)}.mp4`);
  expect(lastSegment(out)).toMatch(ANDROID_OK);
});

it('falls back to the job id when nothing usable is left', () => {
  expect(safeName('!!!.mp4', 'abcdef1234')).toBe('SaveSama abcdef12.mp4');
});

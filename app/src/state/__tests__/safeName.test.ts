import { safeName } from '../download';

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

// android.webkit.MimeTypeMap.getFileExtensionFromUrl only reads the extension when the encoded
// file name matches this; otherwise the gallery save is refused. encodeURIComponent leaves the
// same characters unencoded as Android's Uri.encode (letters, digits, _-!.~'()*).
const ANDROID_EXTENSION_OK = /^[a-zA-Z_0-9.\-()%]+$/;

it.each([
  ["EP. 02 Don't Get Sick, Idiot. 🌧️💚 [DedbYT-zqSl].mp4", 'EP. 02 Don’t Get Sick, Idiot. 🌧️💚 [DedbYT-zqSl].mp4'],
  ['#girls #women #job #work [Deb_p3pxcjQ].mp4', 'girls women job work [Deb_p3pxcjQ].mp4'],
  ['Wow!!! ~so* good~ [x].M4A', 'Wow so good [x].m4a'],
  ['کراچی کی بارش [abc].jpg', 'کراچی کی بارش [abc].jpg'],
])('%s', (input, expected) => {
  const out = safeName(input, 'job123456789');
  expect(out).toBe(expected);
  expect(encodeURIComponent(out)).toMatch(ANDROID_EXTENSION_OK);
});

it('never splits an emoji when shortening', () => {
  const out = safeName(`${'a'.repeat(79)}💚tail.mp4`, 'job123456789');
  expect(out).toBe(`${'a'.repeat(79)}💚.mp4`);
  expect(() => encodeURIComponent(out)).not.toThrow();
});

it('falls back to the job id when nothing usable is left', () => {
  expect(safeName('!!!.mp4', 'abcdef1234')).toBe('SaveSama abcdef12.mp4');
});

// Instagram encodes a post's numeric media id (the "pk") as a shortcode using a
// URL-safe base64 alphabet. Converting back gives the id needed by the private
// api/v1/media/{id}/info/ endpoint. Media ids exceed Number.MAX_SAFE_INTEGER, so
// the conversion runs in BigInt and returns a decimal string.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function shortcodeToMediaId(shortcode: string): string | null {
  if (!shortcode) return null;
  let id = 0n;
  for (const ch of shortcode) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) return null;
    id = id * 64n + BigInt(value);
  }
  return id.toString();
}

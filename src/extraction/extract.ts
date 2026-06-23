import { resolveFinalUrl } from './http';
import { extractInstagram } from './instagram';
import { ExtractionError, ExtractionResult, ParsedLink } from './types';
import { parseLink } from './urlParser';

export async function extractMedia(rawText: string): Promise<ExtractionResult> {
  const parsed = parseLink(rawText);
  if (!parsed) {
    throw new ExtractionError(
      'unrecognized link',
      "That doesn't look like an Instagram link. Paste a link to a post, reel, or photo."
    );
  }

  // Instagram song/audio pages (/reels/audio/<id>) aren't downloadable: Instagram serves
  // only a JS shell for them anonymously, its audio APIs require auth, and it never serves
  // full licensed tracks even when logged in. Fail with a clear message rather than a
  // generic "couldn't read this post" error.
  if (parsed.platform === 'instagram' && parsed.unsupported === 'audio') {
    throw new ExtractionError(
      'instagram audio pages not supported',
      'Downloading songs isn’t supported — Instagram doesn’t allow audio from song pages to be saved. Paste a reel, post, or photo link instead.'
    );
  }

  const link = parsed.needsResolution ? await resolveShareLink(parsed) : parsed;
  if (!link.shortcode) {
    throw new ExtractionError(
      `no shortcode after resolution: ${link.canonicalUrl}`,
      'Could not resolve this share link. Open the post and copy its direct link instead.'
    );
  }

  return extractInstagram(link.shortcode);
}

async function resolveShareLink(link: ParsedLink): Promise<ParsedLink> {
  const finalUrl = await resolveFinalUrl(link.canonicalUrl);
  const resolved = parseLink(finalUrl);
  if (!resolved || resolved.needsResolution || !resolved.shortcode) {
    throw new ExtractionError(
      `share link did not resolve to a post: ${finalUrl}`,
      'Could not resolve this share link. Open the post and copy its direct link instead.'
    );
  }
  return resolved;
}

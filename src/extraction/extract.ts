import { resolveFinalUrl } from './http';
import { extractInstagram } from './instagram';
import { extractThreads } from './threads';
import { ExtractionError, ExtractionResult, ParsedLink } from './types';
import { parseLink } from './urlParser';

export async function extractMedia(rawText: string): Promise<ExtractionResult> {
  const parsed = parseLink(rawText);
  if (!parsed) {
    throw new ExtractionError(
      'unrecognized link',
      "That doesn't look like an Instagram or Threads post link. Paste a link to a post, reel, or thread."
    );
  }

  const link = parsed.needsResolution ? await resolveShareLink(parsed) : parsed;
  if (!link.shortcode) {
    throw new ExtractionError(
      `no shortcode after resolution: ${link.canonicalUrl}`,
      'Could not resolve this share link. Open the post and copy its direct link instead.'
    );
  }

  if (link.platform === 'instagram') {
    return extractInstagram(link.shortcode);
  }
  return extractThreads(link.shortcode, link.canonicalUrl);
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

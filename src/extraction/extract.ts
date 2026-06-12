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

  // Threads is intentionally not supported yet: its media isn't in the logged-out page
  // and its GraphQL doc_id rotates, so it needs a backend or an in-app WebView (the
  // mapping helpers in threads.ts are kept for that future work). Instagram-only for now.
  if (parsed.platform === 'threads') {
    throw new ExtractionError(
      'threads not supported yet',
      'Threads links aren’t supported yet — Instagram only for now. Paste an Instagram post, reel, or photo link.'
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

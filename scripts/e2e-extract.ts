// Manual end-to-end check against live endpoints. Run: npx tsx scripts/e2e-extract.ts <url>
import { extractMedia } from '../src/extraction/extract';

const url = process.argv[2] ?? 'https://www.instagram.com/p/DZaLkntlSS2/';

extractMedia(url)
  .then((result) => {
    console.log('platform:', result.platform);
    console.log('username:', result.username);
    console.log('items:', result.items.length);
    for (const item of result.items) {
      console.log(`  - ${item.type} ${item.url.slice(0, 70)}…`);
    }
  })
  .catch((error) => {
    console.error('FAILED:', error?.userMessage ?? error);
    process.exit(1);
  });

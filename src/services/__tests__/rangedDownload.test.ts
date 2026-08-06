import {
  RangedDownloadDeps,
  planRanges,
  probeRangedDownload,
  runRangedDownload,
  shouldSplit,
} from '../rangedDownload';

function headers(map: Record<string, string>): Headers {
  return { get: (name: string) => map[name.toLowerCase()] ?? null } as unknown as Headers;
}

describe('probeRangedDownload', () => {
  it('reads the total size out of content-range on a 206', () => {
    const fetchImpl = (async () =>
      ({
        status: 206,
        headers: headers({ 'content-range': 'bytes 0-0/89478485' }),
      }) as Response) as unknown as typeof fetch;
    return expect(probeRangedDownload('https://cdn/v.mp4', fetchImpl)).resolves.toEqual({
      totalBytes: 89478485,
      supportsRanges: true,
    });
  });

  it('reports no range support when the server answers 200', async () => {
    const fetchImpl = (async () =>
      ({
        status: 200,
        headers: headers({ 'content-length': '1234' }),
      }) as Response) as unknown as typeof fetch;
    await expect(probeRangedDownload('https://cdn/v.mp4', fetchImpl)).resolves.toEqual({
      totalBytes: 1234,
      supportsRanges: false,
    });
  });

  it('degrades to a single download when the probe throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(probeRangedDownload('https://cdn/v.mp4', fetchImpl)).resolves.toEqual({
      totalBytes: null,
      supportsRanges: false,
    });
  });
});

describe('shouldSplit', () => {
  it('splits only large files on range-capable servers with a known size', () => {
    expect(shouldSplit({ totalBytes: 80 * 1024 * 1024, supportsRanges: true })).toBe(true);
    // Too small to be worth the extra requests.
    expect(shouldSplit({ totalBytes: 1024, supportsRanges: true })).toBe(false);
    expect(shouldSplit({ totalBytes: 80 * 1024 * 1024, supportsRanges: false })).toBe(false);
    // Unknown size: chunk boundaries can't be computed.
    expect(shouldSplit({ totalBytes: null, supportsRanges: true })).toBe(false);
  });
});

describe('planRanges', () => {
  it('covers every byte exactly once with no gaps or overlaps', () => {
    const total = 89478485; // deliberately not divisible by 4
    const ranges = planRanges(total, 4);
    expect(ranges[0].start).toBe(0);
    expect(ranges[ranges.length - 1].end).toBe(total - 1);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].start).toBe(ranges[i - 1].end + 1);
    }
    const covered = ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
    expect(covered).toBe(total);
  });

  it('never emits more ranges than there are bytes', () => {
    expect(planRanges(3, 4)).toHaveLength(3);
    expect(planRanges(1, 4)).toEqual([{ start: 0, end: 0 }]);
  });
});

function trackingDeps(overrides: Partial<RangedDownloadDeps> = {}) {
  const calls = { downloaded: [] as string[], concatenated: [] as string[][], removed: [] as string[] };
  const deps: RangedDownloadDeps = {
    downloadRange: async (_url, fileUri, range, onBytes) => {
      calls.downloaded.push(fileUri);
      onBytes(range.end - range.start + 1);
    },
    concatenate: async (parts) => {
      calls.concatenated.push([...parts]);
    },
    remove: async (fileUri) => {
      calls.removed.push(fileUri);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('runRangedDownload', () => {
  it('joins the parts in order and finishes at 1', async () => {
    const { deps, calls } = trackingDeps();
    const seen: number[] = [];

    await runRangedDownload('https://cdn/v.mp4', 'file:///out.mp4', 4000, (f) => seen.push(f), deps, 4);

    expect(calls.concatenated).toEqual([
      [
        'file:///out.mp4.part0',
        'file:///out.mp4.part1',
        'file:///out.mp4.part2',
        'file:///out.mp4.part3',
      ],
    ]);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('reports monotonic progress summed across parts', async () => {
    // Each part reports its own bytes; a naive per-part fraction would jump
    // backwards as chunks interleave.
    const { deps } = trackingDeps();
    const seen: number[] = [];
    await runRangedDownload('https://cdn/v.mp4', 'file:///out.mp4', 4000, (f) => seen.push(f), deps, 4);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    expect(seen.every((f) => f <= 1)).toBe(true);
  });

  it('never exceeds 1 when a server sends more than advertised', async () => {
    const { deps } = trackingDeps({
      downloadRange: async (_url, _fileUri, range, onBytes) => {
        onBytes((range.end - range.start + 1) * 3);
      },
    });
    const seen: number[] = [];
    await runRangedDownload('https://cdn/v.mp4', 'file:///out.mp4', 4000, (f) => seen.push(f), deps, 4);
    expect(Math.max(...seen)).toBe(1);
  });

  it('deletes every part AND the output when a range fails', async () => {
    const { deps, calls } = trackingDeps({
      downloadRange: async (_url, fileUri) => {
        if (fileUri.endsWith('part2')) throw new Error('range failed');
      },
    });

    await expect(
      runRangedDownload('https://cdn/v.mp4', 'file:///out.mp4', 4000, () => {}, deps, 4)
    ).rejects.toThrow('range failed');

    // A leaked part file would silently consume cache space; a leaked partial
    // output could be saved to the gallery as a corrupt file.
    for (const part of ['part0', 'part1', 'part2', 'part3']) {
      expect(calls.removed).toContain(`file:///out.mp4.${part}`);
    }
    expect(calls.removed).toContain('file:///out.mp4');
    expect(calls.concatenated).toEqual([]);
  });

  it('cleans up when concatenation itself fails', async () => {
    const { deps, calls } = trackingDeps({
      concatenate: async () => {
        throw new Error('concat failed');
      },
    });
    await expect(
      runRangedDownload('https://cdn/v.mp4', 'file:///out.mp4', 4000, () => {}, deps, 4)
    ).rejects.toThrow('concat failed');
    expect(calls.removed).toContain('file:///out.mp4');
  });
});

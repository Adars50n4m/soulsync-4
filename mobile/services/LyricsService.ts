/**
 * LyricsService — Fetches synced lyrics from LRCLIB (free, no API key)
 *
 * Returns timestamped lyrics lines for karaoke-style display.
 * Falls back to plain (unsynced) lyrics if synced not available.
 */

const LRCLIB_BASE = 'https://lrclib.net/api';

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
}

/**
 * Parse LRC format into timestamped lines
 * Format: [mm:ss.xx] text
 */
function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tsRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  // Process line-by-line. A single line can have multiple leading timestamps
  // (LRC repeats), e.g. "[00:30.00][01:53.40] text" — we emit one entry per
  // timestamp and strip ALL bracketed timestamps + LRC metadata tags from the
  // text so they never leak into the displayed lyric.
  for (const rawLine of lrc.split(/\r?\n/)) {
    const timestamps: number[] = [];
    let m: RegExpExecArray | null;
    tsRegex.lastIndex = 0;
    while ((m = tsRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      timestamps.push(minutes * 60 + seconds + ms / 1000);
    }
    if (timestamps.length === 0) continue;

    // Strip every bracketed tag (timestamps + metadata like [ar:], [ti:], [by:])
    // and any inline word-level timestamps (<00:00.00>).
    const text = rawLine
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<\d{2}:\d{2}\.\d{2,3}>/g, '')
      .trim();
    if (!text) continue;

    for (const time of timestamps) lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

class LyricsService {
  private cache = new Map<string, LyricsResult>();

  async getLyrics(title: string, artist: string, duration?: number): Promise<LyricsResult | null> {
    const cacheKey = `${title}::${artist}`.toLowerCase();
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    try {
      // Try exact match first
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist,
        ...(duration ? { duration: String(Math.round(duration)) } : {}),
      });

      const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
        headers: { 'User-Agent': 'Soul Music Player v1.0' },
      });

      if (res.ok) {
        const data = await res.json();
        const result = this.parseResponse(data);
        if (result) {
          this.cache.set(cacheKey, result);
          return result;
        }
      }

      // Fallback: search
      const searchRes = await fetch(
        `${LRCLIB_BASE}/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
        { headers: { 'User-Agent': 'Soul Music Player v1.0' } }
      );

      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0) {
          const result = this.parseResponse(results[0]);
          if (result) {
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      }

      return null;
    } catch (e) {
      console.warn('[LyricsService] Fetch error:', e);
      return null;
    }
  }

  private parseResponse(data: any): LyricsResult | null {
    if (!data) return null;

    // Prefer synced lyrics
    if (data.syncedLyrics) {
      const lines = parseLRC(data.syncedLyrics);
      if (lines.length > 0) {
        return { synced: true, lines, plain: data.plainLyrics || undefined };
      }
    }

    // Fall back to plain lyrics
    if (data.plainLyrics) {
      const lines = data.plainLyrics.split('\n')
        .filter((l: string) => l.trim())
        .map((text: string, i: number) => ({ time: i * 4, text: text.trim() })); // Approximate timing
      return { synced: false, lines, plain: data.plainLyrics };
    }

    return null;
  }

  /** Get the current lyric line index based on playback time */
  getCurrentLineIndex(lines: LyricLine[], currentTime: number): number {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time) return i;
    }
    return 0;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const lyricsService = new LyricsService();

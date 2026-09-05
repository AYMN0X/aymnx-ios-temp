import { searchITunes, Track } from './musicApi';

const TARGET_MIN = 5;
const TARGET_MAX = 10;

export async function getRecommendedNextTracks(
  currentTrack: Track,
  playedTrackIds: string[]
): Promise<Track[]> {
  const played = new Set(playedTrackIds);
  const seen = new Set<string>();
  const collected: Track[] = [];

  const push = (track: Track) => {
    if (!track || !track.id || seen.has(track.id) || played.has(track.id)) {
      return;
    }
    seen.add(track.id);
    collected.push(track);
  };

  const queries = [
    `${currentTrack.artist} songs`,
    currentTrack.artist,
    `${currentTrack.title} ${currentTrack.artist}`,
  ];

  try {
    const batchResults = await Promise.all(
      queries.map((query) => searchITunes(query, 10).catch(() => [] as Track[]))
    );
    for (const result of batchResults) {
      result.forEach(push);
    }
  } catch (error) {
    console.warn('[autoplay] Recomendation queries failed.', error);
  }

  if (collected.length < TARGET_MIN && currentTrack.title) {
    try {
      const byTitle = await searchITunes(currentTrack.title, 10).catch(() => [] as Track[]);
      byTitle.forEach(push);
    } catch {
      // keep whatever we already collected
    }
  }

  if (collected.length < TARGET_MIN) {
    try {
      const filler = await searchITunes('trending now', 15).catch(() => [] as Track[]);
      filler.forEach(push);
    } catch {
      // keep whatever we already collected
    }
  }

  return collected.slice(0, TARGET_MAX);
}
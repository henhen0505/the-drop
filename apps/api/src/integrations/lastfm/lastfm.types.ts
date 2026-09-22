export interface LastfmArtistResult {
  name: string;
  mbid: string | null;
  bio: string | null;
  tags: string[];
  similarArtists: string[];
  listeners: number;
  playcount: number;
}

// Raw Last.fm API types (only fields we use)
export interface LastfmArtistInfoResponse {
  artist: {
    name: string;
    mbid?: string;
    bio?: { summary?: string; content?: string };
    tags?: { tag: Array<{ name: string }> | { name: string } };
    similar?: { artist: Array<{ name: string }> | { name: string } };
    stats?: { listeners: string; playcount: string };
  };
}

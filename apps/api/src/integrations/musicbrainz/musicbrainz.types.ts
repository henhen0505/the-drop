export interface MusicBrainzArtistResult {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
  country: string | null;
}

// Raw MB API types
export interface MusicBrainzArtistRaw {
  id: string;
  name: string;
  disambiguation?: string;
  type?: string;
  country?: string;
}

export interface MusicBrainzBrowseResponse {
  artists: MusicBrainzArtistRaw[];
}

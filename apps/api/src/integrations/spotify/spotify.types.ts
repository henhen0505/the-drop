export interface SpotifyArtistResult {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string;
  genres: string[];
  popularity: number;
  followerCount: number;
}

// Raw Spotify API response types (only the fields we use)
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtistRaw {
  id: string;
  name: string;
  images: SpotifyImage[];
  external_urls: { spotify: string };
  genres: string[];
  popularity: number;
  followers: { total: number };
}

export interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtistRaw[];
    total: number;
    limit: number;
    offset: number;
  };
}

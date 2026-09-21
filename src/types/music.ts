export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
  streamUrl?: string;
  streamMimeType?: string;
  duration?: number;
  provider?: 'itunes' | 'soundcloud' | 'jiosaavn' | 'lan' | 'spotify';
  permalink?: string;
}

export interface StreamResult {
  url: string;
  mimeType: string;
  provider?: 'jiosaavn' | 'soundcloud';
}
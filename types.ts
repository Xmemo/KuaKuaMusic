export enum KwaKwaState {
  IDLE = 'IDLE',      // Sleeping, breathing
  HYPE = 'HYPE',      // Headbanging, crest up
  PRO = 'PRO',        // Glasses, EQ bars
  EMO = 'EMO',        // Melancholy (replaces SAD)
  OVERHEAT = 'OVERHEAT', // Limit reached / Glitch
  AWKWARD = 'AWKWARD' // For "bad" songs
}

export interface SongMetadata {
  id?: string;
  title: string;
  artist: string;
  coverUrl?: string;
  album?: string;
  genre?: string;
  previewUrl?: string;
  trackUrl?: string;
  releaseYear?: string;
  platform?: 'NETEASE' | 'QQ' | 'YOUTUBE' | 'MANUAL';
}

export interface DeepDivePoint {
  title: string;
  publicText: string; 
  geekText: string;   
}

export interface PraiseContent {
  hook: string; 
  colorHex: string; 
  kwaKwaState: KwaKwaState;
  modes: {
    emo: string; // 走心
    hype: string; // 上头 (Was Fun)
    pro: string; // 懂行
  };
  deepDive: {
    culture: DeepDivePoint;
    harmony: DeepDivePoint;
    rhythm: DeepDivePoint;
    timbre: DeepDivePoint;
  };
  isBadSong: boolean;
}

export type AppState = 'HOME' | 'SEARCHING' | 'SEARCH_RESULTS' | 'ANALYZING' | 'RESULT' | 'ERROR';


export type ItemType = 'loop' | 'stem' | 'mix' | 'master';

// src/app/core/models/models.ts (or wherever Pack is declared)
export interface Pack {
  id: string;
  ownerUid: string;
  title: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;

  // new metadata (optional)
  producer?: string | null;
  publisher?: string | null;
  year?: number | null;
  tags?: string[];        // display/search
  desc?: string | null;
  artworkPath?: string | null;  // storage path
  artworkUrl?: string | null;   // cached HTTPS (optional)
  bpmMin?: number|null;
  bpmMax?: number|null;
  keys?: string[];
}


export interface Item {
  id?: string;
  packId: string;
  type: ItemType;
  name: string;
  bpm?: number; key?: string; lengthSec?: number;
  sampleRate?: number; bitDepth?: number; format?: 'wav'|'aiff'|'mp3';
  storagePath: string;         // gs://…/original.wav
  previewUrl?: string;         // https URL
  createdAt: number;
}

export interface ShareLink {
  id?: string;
  packId: string;
  createdByUid: string;
  tokenHash: string;           // sha256(token)
  expiresAt: number;           // ms since epoch
  maxDownloads?: number; downloads?: number;
  allowComments?: boolean; allowZip?: boolean;
  createdAt: number;
}

export type ItemType = 'loop' | 'stem' | 'mix' | 'master';

export interface Pack {
  id?: string;
  ownerUid: string;
  title: string;
  coverUrl?: string;
  isPublic?: boolean;
  bpmMin?: number; bpmMax?: number;
  keys?: string[];             // e.g. ["E♭","Gm"]
  tags?: string[];
  createdAt: number; updatedAt: number;
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

export enum ModelType {
  Note = 1,
  Folder = 2,
  Setting = 3,
  Resource = 4,
  Tag = 5,
  NoteTag = 6,
  MasterKey = 9,
}

export interface JoplinItem {
  id: string;
  parent_id: string;
  title: string;
  body?: string;
  created_time: number;
  updated_time: number;
  user_created_time: number;
  user_updated_time: number;
  type_: ModelType;
  encryption_applied: number;
  encryption_cipher_text: string;
  markup_language?: number;
  deleted_time?: number;
  // Resource-specific
  mime?: string;
  filename?: string;
  file_extension?: string;
  size?: number;
  blob_updated_time?: number;
  // Joplin NoteTag specifics
  note_id?: string;
  tag_id?: string;
  // Tolerate unknown fields for forward compatibility
  [key: string]: unknown;
}

export interface RemoteItemStat {
  name: string;
  updated_time: number;
  jop_updated_time?: number;
}

export interface DeltaItem extends RemoteItemStat {
  type: DeltaChangeType;
}

export enum DeltaChangeType { Create = 1, Update = 2, Delete = 3 }

export interface Paginated<T> {
  items: T[];
  has_more: boolean;
  cursor?: string;
}

export interface SyncLock {
  id?: string;
  type: LockType;
  clientType: string;
  clientId: string;
  updatedTime?: number;
}

export enum LockType { Sync = 1, Exclusive = 2 }
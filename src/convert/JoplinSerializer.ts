import { JoplinItem, ModelType } from '../api/models';

const NOTE_FIELD_ORDER = [
  'id', 'parent_id', 'created_time', 'updated_time', 'is_conflict', 'latitude',
  'longitude', 'altitude', 'author', 'source_url', 'is_todo', 'todo_due',
  'todo_completed', 'source', 'source_application', 'application_data', 'order',
  'user_created_time', 'user_updated_time', 'encryption_cipher_text',
  'encryption_applied', 'markup_language', 'is_shared', 'share_id',
  'conflict_original_id', 'master_key_id', 'user_data', 'deleted_time', 'type_',
];

const FOLDER_FIELD_ORDER = [
  'id', 'created_time', 'updated_time', 'user_created_time', 'user_updated_time',
  'encryption_cipher_text', 'encryption_applied', 'parent_id', 'is_shared',
  'share_id', 'master_key_id', 'icon', 'user_data', 'deleted_time', 'type_',
];

const RESOURCE_FIELD_ORDER = [
  'id', 'mime', 'filename', 'created_time', 'updated_time',
  'user_created_time', 'user_updated_time', 'file_extension',
  'encryption_cipher_text', 'encryption_applied', 'encryption_blob_encrypted',
  'size', 'is_shared', 'share_id', 'master_key_id', 'user_data',
  'blob_updated_time', 'ocr_text', 'ocr_details', 'ocr_status', 'ocr_error', 'type_',
];

const TIME_FIELDS = new Set([
  'created_time', 'updated_time', 'user_created_time', 'user_updated_time',
]);

const DEFAULTS: Record<string, any> = {
  is_conflict: 0, latitude: '0.00000000', longitude: '0.00000000', altitude: '0.0000',
  author: '', source_url: '', is_todo: 0, todo_due: 0, todo_completed: 0,
  source: 'obsidian-joplin-sync', source_application: 'net.obsidian.joplin-server-sync',
  application_data: '', order: 0, encryption_cipher_text: '', encryption_applied: 0,
  markup_language: 1, is_shared: 0, share_id: '', conflict_original_id: '',
  master_key_id: '', user_data: '', deleted_time: 0, icon: '',
};

export class JoplinSerializer {

  serialize(item: JoplinItem): string {
    const order = this.fieldOrder(item.type_);
    const lines: string[] = [];

    lines.push(item.title ?? '');
    lines.push('');
    if (item.type_ === ModelType.Note) {
      lines.push(item.body ?? '');
      lines.push('');
    }

    for (const key of order) {
      let value: any = item[key] ?? DEFAULTS[key] ?? '';
      if (TIME_FIELDS.has(key)) value = this.formatTime(value as number);
      lines.push(key + ': ' + value);
    }
    return lines.join('\n');
  }

  unserialize(raw: string): JoplinItem {
    const lines = raw.split('\n');
    const item: Record<string, any> = {};
    let bodyEndIndex = lines.length;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.trim() === '') { bodyEndIndex = i; break; }
      const sep = line.indexOf(':');
      if (sep < 0) throw new Error('Invalid metadata line: ' + line);
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim();
      item[key] = TIME_FIELDS.has(key) ? this.parseTime(value) : this.coerce(key, value);
    }

    const headerBody = lines.slice(0, bodyEndIndex);
    item.title = headerBody[0] ?? '';
    if (Number(item.type_) === ModelType.Note) {
      item.body = headerBody.slice(2).join('\n');
    }
    item.type_ = Number(item.type_);
    return item as unknown as JoplinItem;
  }

  private fieldOrder(type: ModelType): string[] {
    switch (type) {
      case ModelType.Note: return NOTE_FIELD_ORDER;
      case ModelType.Folder: return FOLDER_FIELD_ORDER;
      case ModelType.Resource: return RESOURCE_FIELD_ORDER;
      default: return NOTE_FIELD_ORDER;
    }
  }

  private formatTime(ms: number): string { return new Date(ms || 0).toISOString(); }
  private parseTime(s: string): number { return s ? new Date(s).getTime() : 0; }

  private coerce(key: string, value: string): string | number {
    const numeric = new Set(['type_', 'is_conflict', 'is_todo', 'todo_due', 'todo_completed',
      'encryption_applied', 'markup_language', 'is_shared', 'order', 'size',
      'deleted_time', 'blob_updated_time']);
    return numeric.has(key) ? Number(value) : value;
  }
}
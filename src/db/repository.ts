import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BaseEntity } from '../types';

type NewItem<T> = Omit<T, keyof BaseEntity>;

// One generic class stores any entity (employers, candidates, jobs, applications).
// Data lives in memory and is saved to a JSON file after every change.
export class Repository<T extends BaseEntity> {
  private items: T[] = [];
  private file: string;

  constructor(name: string, dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, `${name}.json`);
    if (fs.existsSync(this.file)) {
      this.items = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    }
  }

  private save() {
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }

  all(): T[] {
    return [...this.items];
  }

  findById(id: string): T | undefined {
    return this.items.find((item) => item.id === id);
  }

  where(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }

  create(data: NewItem<T>): T {
    const now = new Date().toISOString();
    // T is generic, so TypeScript cannot check this object literal: we cast it
    const item = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as unknown as T;
    this.items.push(item);
    this.save();
    return item;
  }

  update(id: string, changes: Partial<NewItem<T>>): T | undefined {
    const item = this.findById(id);
    if (!item) return undefined;
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    this.save();
    return item;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    this.save();
    return this.items.length < before;
  }
}

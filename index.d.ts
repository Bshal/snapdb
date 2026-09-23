export type Doc = Record<string, any>;

export interface FieldOperators<V = any> {
  $eq?: V;
  $ne?: V;
  $gt?: V;
  $gte?: V;
  $lt?: V;
  $lte?: V;
  $in?: V[];
  $nin?: V[];
  $exists?: boolean;
  $regex?: string | RegExp;
  $options?: string;
  $not?: FieldCondition<V>;
  $size?: number;
  $elemMatch?: Query | FieldOperators;
}

export type FieldCondition<V = any> = V | RegExp | FieldOperators<V> | ((value: V) => boolean);

export type Query<T extends Doc = Doc> =
  | ({ [K in keyof T]?: FieldCondition<T[K]> } & {
      [path: string]: any;
      $and?: Query<T>[];
      $or?: Query<T>[];
      $nor?: Query<T>[];
    })
  | ((doc: T) => boolean);

export interface UpdateOperators {
  $set?: Doc;
  $unset?: Record<string, any>;
  $inc?: Record<string, number>;
  $min?: Doc;
  $max?: Doc;
  $push?: Doc;
  $addToSet?: Doc;
  $pull?: Doc;
}

export type Update<T extends Doc = Doc> = UpdateOperators | Partial<T> | ((doc: T) => Partial<T> | void);

export interface FindOptions {
  sort?: Record<string, 1 | -1> | ((a: Doc, b: Doc) => number);
  skip?: number;
  limit?: number;
  select?: string[] | Record<string, 0 | 1 | boolean>;
}

export interface UpdateOptions {
  /** Insert a new doc when nothing matches. */
  upsert?: boolean;
}

export interface IndexOptions {
  unique?: boolean;
}

export interface DatabaseOptions {
  /** Write to the adapter after every change. Default true. */
  autosave?: boolean;
  /** Index a field the first time it is queried by equality. Default true. */
  autoIndex?: boolean;
}

export interface Adapter {
  load(): Promise<Record<string, Doc[]>>;
  save(data: Record<string, Doc[]>): Promise<void>;
}

export class Database {
  constructor(adapter: Adapter, options?: DatabaseOptions);
  data: Record<string, Doc[]>;

  load(): Promise<void>;
  /** Rebuilds indexes (picking up direct edits to docs) and writes to the adapter. */
  save(): Promise<void>;
  /** Waits for pending writes to finish. */
  flush(): Promise<void>;
  reindex(): void;

  collection<T extends Doc = Doc>(name: string): Collection<T>;
  collections(): string[];
  drop(collection: string): Promise<boolean>;

  insert<T extends Doc>(collection: string, item: T): Promise<T>;
  insert<T extends Doc>(collection: string, items: T[]): Promise<T[]>;
  insertMany<T extends Doc>(collection: string, items: T[]): Promise<T[]>;
  find<T extends Doc = Doc>(collection: string, query?: Query<T>, options?: FindOptions): T[];
  findOne<T extends Doc = Doc>(collection: string, query?: Query<T>, options?: FindOptions): T | null;
  count<T extends Doc = Doc>(collection: string, query?: Query<T>): number;
  /** Updates every match. Resolves to the number of docs updated. */
  update<T extends Doc = Doc>(collection: string, query: Query<T>, changes: Update<T>, options?: UpdateOptions): Promise<number>;
  /** Updates the first match. Resolves to the doc, or null. */
  updateOne<T extends Doc = Doc>(collection: string, query: Query<T>, changes: Update<T>, options?: UpdateOptions): Promise<T | null>;
  /** Removes every match. Resolves to the number removed. */
  remove<T extends Doc = Doc>(collection: string, query: Query<T>): Promise<number>;

  createIndex(collection: string, field: string, options?: IndexOptions): void;
  dropIndex(collection: string, field?: string): boolean;
  getIndexes(collection: string): { field: string; unique: boolean }[];
}

export class Collection<T extends Doc = Doc> {
  constructor(db: Database, name: string);
  readonly db: Database;
  readonly name: string;
  insert(item: T): Promise<T>;
  insert(items: T[]): Promise<T[]>;
  insertMany(items: T[]): Promise<T[]>;
  find(query?: Query<T>, options?: FindOptions): T[];
  findOne(query?: Query<T>, options?: FindOptions): T | null;
  count(query?: Query<T>): number;
  update(query: Query<T>, changes: Update<T>, options?: UpdateOptions): Promise<number>;
  updateOne(query: Query<T>, changes: Update<T>, options?: UpdateOptions): Promise<T | null>;
  remove(query: Query<T>): Promise<number>;
  drop(): Promise<boolean>;
  createIndex(field: string, options?: IndexOptions): void;
  dropIndex(field: string): boolean;
  getIndexes(): { field: string; unique: boolean }[];
}

export interface FileAdapterOptions {
  /** Indent the JSON file. Default false. */
  pretty?: boolean;
  /** Write via temp file + rename so a crash can't corrupt the file. Default true. */
  atomic?: boolean;
}

export class FileAdapter implements Adapter {
  constructor(filePath: string, options?: FileAdapterOptions);
  load(): Promise<Record<string, Doc[]>>;
  save(data: Record<string, Doc[]>): Promise<void>;
}

export class MemoryAdapter implements Adapter {
  constructor(initialData?: Record<string, Doc[]>);
  load(): Promise<Record<string, Doc[]>>;
  save(data: Record<string, Doc[]>): Promise<void>;
}

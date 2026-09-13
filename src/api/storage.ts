import { api } from "./client";

const STORAGE_URL = "/api/storage";

export type StoragePartition = {
  /** What to label it in the UI — "Boot", "System", "Data". */
  name: string;
  /** Where it is mounted, e.g. `/data`. */
  mount: string;
  /** The filesystem's size, in bytes. */
  total: number;
  used: number;
  /**
   * What is still writable. `used` + `free` falls short of `total` by the
   * slice ext4 reserves for root, which is why the bar is drawn from
   * `used` / `total` rather than from `free`.
   */
  free: number;
};

export type StorageStatus = { partitions: StoragePartition[] };

export const getStorage = () => api<StorageStatus>(STORAGE_URL);

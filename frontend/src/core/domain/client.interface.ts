import type {
  EngineInfo,
  TorrentDetailEntity,
  TorrentEntity,
  AddTorrentPayload,
  SessionStats,
} from "./entities";
import type { TransmissionSessionSettings, TransmissionFreeSpace } from "../types";

export interface ITorrentClient {
  handshake?(): Promise<unknown>;
  fetchSessionSettings?(): Promise<TransmissionSessionSettings>;
  updateSessionSettings?(settings: Partial<TransmissionSessionSettings>): Promise<void>;
  testPort?(): Promise<boolean>;
  checkFreeSpace?(path: string): Promise<TransmissionFreeSpace>;
  getTorrents(): Promise<TorrentEntity[]>;
  getTorrentDetails(id: string): Promise<TorrentDetailEntity>;
  getSessionStats(): Promise<SessionStats>;
  addTorrent(payload: AddTorrentPayload): Promise<void>;
  pause(ids: string[]): Promise<void>;
  resume(ids: string[]): Promise<void>;
  remove(ids: string[], deleteData: boolean): Promise<void>;
  verify(ids: string[]): Promise<void>;
  moveToTop(ids: string[]): Promise<void>;
  moveUp(ids: string[]): Promise<void>;
  moveDown(ids: string[]): Promise<void>;
  moveToBottom(ids: string[]): Promise<void>;
  updateFileSelection(id: string, indexes: number[], wanted: boolean): Promise<void>;
  setSequentialDownload?(id: string, enabled: boolean): Promise<void>;
  setSuperSeeding?(id: string, enabled: boolean): Promise<void>;
  forceTrackerReannounce?(id: string): Promise<void>;
  detectEngine?(): Promise<EngineInfo>;
  updateRequestTimeout?(timeout: number): void;
}

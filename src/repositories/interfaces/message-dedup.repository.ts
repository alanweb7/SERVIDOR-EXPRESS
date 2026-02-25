export interface MessageDedupRepository {
  has(messageId: string): Promise<boolean>;
  save(messageId: string): Promise<void>;
}

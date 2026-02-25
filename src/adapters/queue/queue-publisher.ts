export interface QueuePublisher {
  publish(topic: string, payload: unknown): Promise<void>;
  ping(): Promise<boolean>;
}

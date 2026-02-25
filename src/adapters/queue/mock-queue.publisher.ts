import type { QueuePublisher } from "./queue-publisher.js";

export class MockQueuePublisher implements QueuePublisher {
  async publish(_topic: string, _payload: unknown): Promise<void> {
    return;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

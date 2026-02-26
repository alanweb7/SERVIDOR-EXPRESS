export type DispatchOutboundInput = {
  unitId: string;
  conversationId: string;
  inputMessageId: string;
  outputMessageId: string;
  source: string;
  text: string;
  metadata?: {
    channel?: string;
    attachments?: unknown[];
  };
};

export interface OutboundDispatcher {
  dispatchReply(input: DispatchOutboundInput): Promise<{ dispatchId?: string }>;
}

export class DispatchOutboundError extends Error {
  constructor(
    public readonly code: "dispatch_failed",
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

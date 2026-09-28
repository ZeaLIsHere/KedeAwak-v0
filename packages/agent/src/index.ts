export { createDeepSeekClient, DeepSeekClientError } from "./deepseek-client.js";
export type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  DeepSeekClientConfig,
  DeepSeekErrorCode,
  ToolCall,
  ToolDefinition,
} from "./deepseek-client.js";

export { InMemoryContextLock } from "./context-lock.js";
export type {
  ApprovalRequest,
  AuditEvent,
  ContextLockOptions,
  HandleResult,
  PendingAction,
  PendingLock,
  TrustedSession,
} from "./context-lock.js";

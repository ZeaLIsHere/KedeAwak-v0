import { randomUUID } from "node:crypto";

export type TrustedSession = {
  shopId: string;
  senderPhone: string;
  role: "owner" | "staff" | "customer";
};

export type PendingAction = {
  type: string;
  payload: Record<string, unknown>;
};

export type ApprovalRequest =
  | { type: "approve"; lockId: string }
  | { type: "reject"; lockId: string }
  | { type: "change"; lockId: string; action: PendingAction }
  | { type: "unrelated" };

export type PendingLock = {
  lockId: string;
  action: PendingAction;
  expiresAt: number;
};

export type AuditEvent = {
  shopId: string;
  senderPhone: string;
  lockId: string;
  decision: "approved" | "rejected";
  decidedAt: number;
};

type StartResult =
  | { status: "awaiting_approval"; lock: PendingLock }
  | { status: "already_pending"; lock: PendingLock };

type LookupResult =
  | { status: "idle" | "expired" }
  | { status: "awaiting_approval"; lock: PendingLock };

export type HandleResult =
  | { status: "idle" | "expired" | "stale" }
  | { status: "unrelated"; lock: PendingLock }
  | { status: "changed"; lock: PendingLock }
  | { status: "approved"; action: PendingAction; audit: AuditEvent }
  | { status: "rejected"; audit: AuditEvent };

export type ContextLockOptions = {
  ttlMs?: number;
  now?: () => number;
};

export class InMemoryContextLock {
  private readonly locks = new Map<string, Map<string, PendingLock>>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor({ ttlMs = 30 * 60 * 1000, now = Date.now }: ContextLockOptions = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new RangeError("TTL must be a positive integer in milliseconds");
    }
    this.ttlMs = ttlMs;
    this.now = now;
  }

  start(session: TrustedSession, action: PendingAction): StartResult {
    this.assertOwner(session);
    const existing = this.lookup(session);
    if (existing.status === "awaiting_approval") {
      return { status: "already_pending", lock: existing.lock };
    }
    const lock = this.newLock(action);
    let shopLocks = this.locks.get(session.shopId);
    if (!shopLocks) {
      shopLocks = new Map();
      this.locks.set(session.shopId, shopLocks);
    }
    shopLocks.set(session.senderPhone, lock);
    return { status: "awaiting_approval", lock: structuredClone(lock) };
  }

  getPending(session: TrustedSession): LookupResult {
    this.assertOwner(session);
    return this.lookup(session);
  }

  handle(session: TrustedSession, request: ApprovalRequest): HandleResult {
    this.assertOwner(session);
    const current = this.lookup(session);
    if (current.status !== "awaiting_approval") {
      return current;
    }
    const lock = current.lock;
    if (request.type === "unrelated") {
      return { status: "unrelated", lock };
    }
    if (request.lockId !== lock.lockId) {
      return { status: "stale" };
    }
    if (request.type === "change") {
      const updated = this.newLock(request.action, lock.expiresAt);
      this.locks.get(session.shopId)?.set(session.senderPhone, updated);
      return { status: "changed", lock: structuredClone(updated) };
    }

    this.remove(session);
    const audit: AuditEvent = {
      shopId: session.shopId,
      senderPhone: session.senderPhone,
      lockId: lock.lockId,
      decision: request.type === "approve" ? "approved" : "rejected",
      decidedAt: this.now(),
    };
    this.auditEvents.push(audit);
    return request.type === "approve"
      ? { status: "approved", action: lock.action, audit: { ...audit } }
      : { status: "rejected", audit: { ...audit } };
  }

  getAuditEvents(session: TrustedSession): AuditEvent[] {
    this.assertOwner(session);
    return this.auditEvents
      .filter((event) => event.shopId === session.shopId && event.senderPhone === session.senderPhone)
      .map((event) => ({ ...event }));
  }

  private lookup(session: TrustedSession): LookupResult {
    const lock = this.locks.get(session.shopId)?.get(session.senderPhone);
    if (!lock) {
      return { status: "idle" };
    }
    if (this.now() >= lock.expiresAt) {
      this.remove(session);
      return { status: "expired" };
    }
    return { status: "awaiting_approval", lock: structuredClone(lock) };
  }

  private newLock(action: PendingAction, expiresAt = this.now() + this.ttlMs): PendingLock {
    if (!action.type?.trim() || !action.payload || typeof action.payload !== "object" || Array.isArray(action.payload)) {
      throw new TypeError("A pending action requires a type and object payload");
    }
    if (!Number.isSafeInteger(expiresAt)) {
      throw new RangeError("Lock expiry must be a safe integer timestamp");
    }
    return { lockId: randomUUID(), action: structuredClone(action), expiresAt };
  }

  private remove(session: TrustedSession): void {
    const shopLocks = this.locks.get(session.shopId);
    shopLocks?.delete(session.senderPhone);
    if (shopLocks?.size === 0) {
      this.locks.delete(session.shopId);
    }
  }

  private assertOwner(session: TrustedSession): void {
    if (session.role !== "owner" || !session.shopId?.trim() || !session.senderPhone?.trim()) {
      throw new Error("A trusted owner session with shop and sender is required");
    }
  }
}

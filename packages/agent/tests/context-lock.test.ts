import { describe, expect, it } from "vitest";
import { InMemoryContextLock } from "../src/index.js";
import type { PendingAction, TrustedSession } from "../src/index.js";

const owner: TrustedSession = { shopId: "shop-a", senderPhone: "synthetic-owner", role: "owner" };
const action: PendingAction = {
  type: "send_purchase_order",
  payload: { draftId: "synthetic-draft", quantity: 20 },
};

function setup(ttlMs = 30 * 60 * 1000) {
  let time = 1_700_000_000_000;
  const locks = new InMemoryContextLock({ ttlMs, now: () => time });
  const advance = (ms: number) => { time += ms; };
  return { locks, advance, now: () => time };
}

function start(locks: InMemoryContextLock, session = owner, pendingAction = action) {
  const result = locks.start(session, pendingAction);
  if (result.status !== "awaiting_approval") {
    throw new Error("Expected a new approval lock");
  }
  return result.lock;
}

describe("InMemoryContextLock", () => {
  it("returns an action only after explicit owner approval, records it, and consumes once", () => {
    const { locks, now } = setup();
    const lock = start(locks);
    expect(lock.expiresAt).toBe(now() + 30 * 60 * 1000);
    expect(locks.handle(owner, { type: "approve", lockId: lock.lockId })).toEqual({
      status: "approved",
      action,
      audit: {
        shopId: owner.shopId,
        senderPhone: owner.senderPhone,
        lockId: lock.lockId,
        decision: "approved",
        decidedAt: now(),
      },
    });
    expect(locks.handle(owner, { type: "approve", lockId: lock.lockId })).toEqual({ status: "idle" });
    expect(locks.getPending(owner)).toEqual({ status: "idle" });
    expect(locks.getAuditEvents(owner)).toHaveLength(1);
  });

  it("rejects without releasing the action and records the decision", () => {
    const { locks, now } = setup();
    const lock = start(locks);
    expect(locks.handle(owner, { type: "reject", lockId: lock.lockId })).toEqual({
      status: "rejected",
      audit: {
        shopId: owner.shopId,
        senderPhone: owner.senderPhone,
        lockId: lock.lockId,
        decision: "rejected",
        decidedAt: now(),
      },
    });
    expect(locks.getPending(owner)).toEqual({ status: "idle" });
  });

  it("changes the draft without extending TTL and requires a fresh approval", () => {
    const { locks, advance } = setup(1000);
    const original = start(locks);
    advance(100);
    const updatedAction: PendingAction = { type: "send_purchase_order", payload: { draftId: "synthetic-revised" } };
    const changed = locks.handle(owner, { type: "change", lockId: original.lockId, action: updatedAction });
    expect(changed.status).toBe("changed");
    if (changed.status !== "changed") return;
    expect(changed.lock.action).toEqual(updatedAction);
    expect(changed.lock.expiresAt).toBe(original.expiresAt);
    expect(changed.lock.lockId).not.toBe(original.lockId);
    expect(locks.handle(owner, { type: "approve", lockId: original.lockId })).toEqual({ status: "stale" });
    expect(locks.handle(owner, { type: "approve", lockId: changed.lock.lockId })).toMatchObject({
      status: "approved", action: updatedAction,
    });
  });

  it("expires at the TTL boundary and never releases an expired action", () => {
    const { locks, advance } = setup(1000);
    const lock = start(locks);
    advance(999);
    expect(locks.getPending(owner).status).toBe("awaiting_approval");
    advance(1);
    expect(locks.handle(owner, { type: "approve", lockId: lock.lockId })).toEqual({ status: "expired" });
    expect(locks.getPending(owner)).toEqual({ status: "idle" });
    expect(locks.getAuditEvents(owner)).toEqual([]);
  });

  it("keeps unrelated messages locked instead of treating them as transactions", () => {
    const { locks } = setup();
    const lock = start(locks);
    expect(locks.handle(owner, { type: "unrelated" })).toEqual({ status: "unrelated", lock });
    expect(locks.start(owner, action)).toEqual({ status: "already_pending", lock });
    expect(locks.getPending(owner)).toEqual({ status: "awaiting_approval", lock });
  });

  it("separates shops and senders and refuses non-owner sessions", () => {
    const { locks } = setup();
    const otherShop: TrustedSession = { ...owner, shopId: "shop-b" };
    const otherSender: TrustedSession = { ...owner, senderPhone: "synthetic-owner-two" };
    const customer: TrustedSession = { ...owner, role: "customer" };
    const staff: TrustedSession = { ...owner, role: "staff" };
    const first = start(locks);
    const second = start(locks, otherShop);
    const third = start(locks, otherSender);
    expect(locks.handle(otherShop, { type: "approve", lockId: first.lockId })).toEqual({ status: "stale" });
    expect(locks.handle(otherSender, { type: "reject", lockId: second.lockId })).toEqual({ status: "stale" });
    expect(locks.handle(owner, { type: "approve", lockId: first.lockId }).status).toBe("approved");
    expect(locks.getPending(otherShop)).toEqual({ status: "awaiting_approval", lock: second });
    expect(locks.getPending(otherSender)).toEqual({ status: "awaiting_approval", lock: third });
    expect(locks.getAuditEvents(otherShop)).toEqual([]);
    expect(() => locks.start(customer, action)).toThrow();
    expect(() => locks.handle(customer, { type: "approve", lockId: second.lockId })).toThrow();
    expect(() => locks.getPending(staff)).toThrow();
    expect(() => locks.getAuditEvents(customer)).toThrow();
  });

  it("does not let callers mutate a pending action or a returned audit record", () => {
    const { locks } = setup();
    const input: PendingAction = { type: "send_purchase_order", payload: { draftId: "synthetic-draft" } };
    const lock = start(locks, owner, input);
    input.payload.draftId = "modified";
    lock.action.payload.draftId = "also-modified";
    const pending = locks.getPending(owner);
    expect(pending.status).toBe("awaiting_approval");
    if (pending.status !== "awaiting_approval") return;
    pending.lock.action.payload.draftId = "modified-again";
    const approved = locks.handle(owner, { type: "approve", lockId: lock.lockId });
    expect(approved.status).toBe("approved");
    if (approved.status !== "approved") return;
    expect(approved.action.payload.draftId).toBe("synthetic-draft");
    approved.audit.decision = "rejected";
    expect(locks.getAuditEvents(owner)[0]?.decision).toBe("approved");
  });

  it("cannot replay approval from a consumed lock against a later draft", () => {
    const { locks } = setup();
    const oldLock = start(locks);
    expect(locks.handle(owner, { type: "reject", lockId: oldLock.lockId }).status).toBe("rejected");
    const nextLock = start(locks, owner, { type: "send_purchase_order", payload: { draftId: "synthetic-next" } });
    expect(locks.handle(owner, { type: "approve", lockId: oldLock.lockId })).toEqual({ status: "stale" });
    expect(locks.getPending(owner)).toEqual({ status: "awaiting_approval", lock: nextLock });
  });

  it("rejects invalid TTLs and trusted contexts", () => {
    expect(() => new InMemoryContextLock({ ttlMs: 0 })).toThrow(RangeError);
    expect(() => new InMemoryContextLock({ ttlMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    const { locks } = setup();
    expect(() => locks.start({ ...owner, shopId: "" }, action)).toThrow();
    expect(() => locks.start(owner, { ...action, type: " " })).toThrow(TypeError);
  });
});

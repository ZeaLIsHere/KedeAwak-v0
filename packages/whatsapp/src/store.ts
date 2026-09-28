import type { IncomingMessage } from "./parser.js";

type ShopState = { messageIds: Set<string>; pending: IncomingMessage[] };

export function createInMemoryMessageStore() {
  const shops = new Map<string, ShopState>();

  return {
    accept(shopId: string, messages: readonly IncomingMessage[]) {
      if (!shopId) throw new Error("Trusted shop ID is required");
      let state = shops.get(shopId);
      if (!state) {
        state = { messageIds: new Set(), pending: [] };
        shops.set(shopId, state);
      }

      let accepted = 0;
      let duplicates = 0;
      for (const message of messages) {
        if (state.messageIds.has(message.waMessageId)) {
          duplicates++;
          continue;
        }
        state.messageIds.add(message.waMessageId);
        state.pending.push({ ...message });
        accepted++;
      }
      return { accepted, duplicates };
    },
    takePending(shopId: string): IncomingMessage[] {
      if (!shopId) throw new Error("Trusted shop ID is required");
      const state = shops.get(shopId);
      if (!state) return [];
      const pending = state.pending;
      state.pending = [];
      return pending;
    },
  };
}

export type InMemoryMessageStore = ReturnType<typeof createInMemoryMessageStore>;

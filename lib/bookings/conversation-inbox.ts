export type ConversationInboxItem = {
  id: string;
  created_at: string;
  latestMessage?: { created_at: string } | null;
};

export function getConversationActivityAt(item: ConversationInboxItem) {
  return item.latestMessage?.created_at || item.created_at;
}

export function orderBookingConversations<T extends ConversationInboxItem>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(getConversationActivityAt(left));
    const rightTime = Date.parse(getConversationActivityAt(right));
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    return safeRight - safeLeft;
  });
}

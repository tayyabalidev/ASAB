/** Reserved height for the viewer host info card above the chat input. */
export const LIVE_VIEWER_HOST_BAND = 96;
export const LIVE_VIEWER_HOST_BAND_COMPACT = 72;
export const LIVE_CHAT_INPUT_HEIGHT = 52;
export const LIVE_CHAT_GAP = 8;
export const LIVE_CHAT_MESSAGE_MAX = 180;
export const LIVE_CHAT_MESSAGE_MAX_COMPACT = 140;

/**
 * Viewer layout: host card sits on the bottom; chat input sits directly above it.
 * @param {{ bottom?: number }} insets
 * @param {{ compact?: boolean }} [options]
 */
export function getViewerLiveChatLayout(insets, { compact = false } = {}) {
  const safeBottom = Math.max(insets?.bottom ?? 0, 16);
  const hostBand = compact ? LIVE_VIEWER_HOST_BAND_COMPACT : LIVE_VIEWER_HOST_BAND;
  const chatBottomOffset = safeBottom + hostBand + LIVE_CHAT_GAP;
  const messageMaxHeight = compact ? LIVE_CHAT_MESSAGE_MAX_COMPACT : LIVE_CHAT_MESSAGE_MAX;
  return {
    hostOverlayPadding: safeBottom,
    chatBottomOffset,
    messageMaxHeight,
    chatToggleBottom: chatBottomOffset + LIVE_CHAT_INPUT_HEIGHT + messageMaxHeight + 12,
  };
}

/**
 * Broadcaster layout: end-stream button sits below the chat input.
 * @param {{ bottom?: number }} insets
 * @param {{ compact?: boolean }} [options]
 */
export function getBroadcasterLiveChatLayout(insets, { compact = false } = {}) {
  const safeBottom = Math.max(insets.bottom ?? 0, 16);
  const endStreamBand = 56;
  const chatBottomOffset = safeBottom + endStreamBand + LIVE_CHAT_GAP;
  const messageMaxHeight = compact ? LIVE_CHAT_MESSAGE_MAX_COMPACT : LIVE_CHAT_MESSAGE_MAX;
  return { chatBottomOffset, messageMaxHeight };
}

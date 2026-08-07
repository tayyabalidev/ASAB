/**
 * Navigation helpers for Friends Live Map actions (Step 4).
 */
import { router } from "expo-router";
import { Alert } from "react-native";
import { startOutgoingCall } from "./startOutgoingCall";

export function openFriendProfile(userId) {
  if (!userId) return;
  router.push(`/profile/${userId}`);
}

export function openFriendChat(userId) {
  if (!userId) return;
  router.push({ pathname: "/chat", params: { userId: String(userId) } });
}

export async function callFriend({
  currentUserId,
  receiverId,
  callType = "audio",
}) {
  try {
    await startOutgoingCall({
      userId: currentUserId,
      receiverId,
      callType,
    });
  } catch (error) {
    Alert.alert(
      "Call failed",
      error?.message || "Could not start the call. Please try again."
    );
  }
}

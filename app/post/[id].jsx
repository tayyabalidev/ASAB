import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useGlobalContext } from "../../context/GlobalProvider";
import {
  getVideoById,
  getComments,
  addComment,
  toggleLikePost,
} from "../../lib/appwrite";
import { images, icons } from "../../constants";

const PostDetails = () => {
  const { id } = useLocalSearchParams();
  const { theme, isDarkMode, user } = useGlobalContext();
  const videoRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const themedColor = (darkValue, lightValue) =>
    isDarkMode ? darkValue : lightValue;

  const fetchPost = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const video = await getVideoById(id);
      setPost(video);
      setLiked(video?.likes?.includes(user?.$id));
      setLikesCount(video?.likes?.length || 0);
    } catch (err) {
      setError(err.message || "Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  const fetchPostComments = async () => {
    if (!id) return;
    setCommentsLoading(true);
    try {
      const postComments = await getComments(id);
      setComments(postComments);
    } catch (err) {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
    fetchPostComments();
  }, [id]);

  const creatorAvatar = useMemo(() => {
    if (!post) return images.profile;
    return (
      post.creator?.avatar ||
      post.creatorAvatar ||
      post.avatar ||
      images.profile
    );
  }, [post]);

  const creatorName = useMemo(() => {
    if (!post) return "Unknown";
    return (
      post.creator?.username ||
      post.creator?.name ||
      post.creatorUsername ||
      post.creatorName ||
      post.username ||
      "Unknown"
    );
  }, [post]);

  const handleLike = async () => {
    if (!user?.$id || !post?.$id) return;
    const newLikedState = !liked;
    setLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : Math.max(prev - 1, 0)));
    try {
      await toggleLikePost(post.$id, user.$id);
    } catch (error) {
      setLiked(!newLikedState);
      setLikesCount((prev) =>
        newLikedState ? Math.max(prev - 1, 0) : prev + 1
      );
      Alert.alert("Error", error.message || "Failed to like the post.");
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.$id || !post?.$id) return;
    setPostingComment(true);
    try {
      const comment = await addComment(post.$id, user.$id, newComment.trim());
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to add comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/home");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.divider,
          }}
        >
          <TouchableOpacity onPress={handleBack}>
            <Image
              source={icons.leftArrow}
              style={{ width: 24, height: 24, tintColor: theme.textPrimary }}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <Text
            style={{
              flex: 1,
              textAlign: "center",
              color: theme.textPrimary,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Post Details
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : error ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 16 }}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={fetchPost}
              style={{
                marginTop: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: theme.accent,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !post ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 16 }}>
              Post not found.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            <View style={{ width: "100%", height: 400, backgroundColor: "#000" }}>
              {post.video ? (
                <Video
                  ref={videoRef}
                  source={{ uri: post.video }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  shouldPlay
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#111",
                  }}
                >
                  <Text style={{ color: "#fff" }}>Video unavailable</Text>
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}
              >
                <Image
                  source={{ uri: creatorAvatar }}
                  style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {creatorName}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    {post.title || "Untitled video"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    router.push(`/profile/${post.creator?.$id || post.creator?.id || post.creator}`)
                  }
                >
                  <Text
                    style={{
                      color: theme.accent,
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    View Profile
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {post.description || "No description provided."}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 16,
                }}
              >
                <TouchableOpacity
                  onPress={handleLike}
                  style={{ flexDirection: "row", alignItems: "center", marginRight: 24 }}
                >
                  <Image
                    source={liked ? icons.heartCheck : icons.heartUncheck}
                    style={{ width: 32, height: 32, marginRight: 6 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}
                  >
                    {likesCount}
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image
                    source={icons.messages}
                    style={{ width: 28, height: 28, marginRight: 6 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}
                  >
                    {comments.length}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 0.5,
                borderBottomWidth: 0.5,
                borderColor: theme.divider,
              }}
            >
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 12,
                }}
              >
                Comments
              </Text>

              {commentsLoading ? (
                <ActivityIndicator color={theme.accent} size="small" />
              ) : comments.length === 0 ? (
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                  No comments yet.
                </Text>
              ) : (
                comments.map((comment) => (
                  <View
                    key={comment.$id}
                    style={{ flexDirection: "row", marginBottom: 14 }}
                  >
                    <Image
                      source={{ uri: comment.avatar || images.profile }}
                      style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {comment.username || comment.userId}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 14,
                          marginVertical: 2,
                        }}
                      >
                        {comment.content}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                        {new Date(comment.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {post && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: themedColor("#1c1c2e", theme.surface),
              borderTopWidth: 0.5,
              borderTopColor: theme.divider,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={{ uri: user?.avatar || images.profile }}
                style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
              />
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Add a comment..."
                placeholderTextColor={theme.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: themedColor("#2a2a40", theme.cardSoft),
                  color: theme.textPrimary,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: Platform.OS === "ios" ? 12 : 8,
                }}
              />
              <TouchableOpacity
                onPress={handleAddComment}
                disabled={postingComment || !newComment.trim()}
                style={{
                  marginLeft: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: postingComment
                    ? theme.textMuted
                    : theme.accent,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {postingComment ? "..." : "Send"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PostDetails;


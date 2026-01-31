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
  Modal,
  FlatList,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { useGlobalContext } from "../../context/GlobalProvider";
import {
  getVideoById,
  getComments,
  addComment,
  toggleLikePost,
  toggleLikeComment,
  getCommentLikes,
} from "../../lib/appwrite";
import { databases, appwriteConfig } from "../../lib/appwrite";
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
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const [likesList, setLikesList] = useState([]);
  const [loadingLikes, setLoadingLikes] = useState(false);

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
      console.log("Comments fetched:", postComments.length);
      if (postComments.length > 0) {
        console.log("First comment:", {
          id: postComments[0].$id,
          likes: postComments[0].likes,
          likesType: typeof postComments[0].likes,
          isArray: Array.isArray(postComments[0].likes),
          parentCommentId: postComments[0].parentCommentId,
        });
      }
      setComments(postComments);
    } catch (err) {
      console.error("Error fetching comments:", err);
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
      await fetchPostComments(); // Refresh comments to get structured data
      setNewComment("");
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to add comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleAddReply = async (parentCommentId) => {
    console.log("handleAddReply called:", { parentCommentId, replyText, userId: user?.$id, postId: post?.$id });
    if (!replyText.trim()) {
      Alert.alert("Error", "Please enter a reply.");
      return;
    }
    if (!user?.$id) {
      Alert.alert("Error", "Please log in to reply.");
      return;
    }
    if (!post?.$id) {
      Alert.alert("Error", "Post not found.");
      return;
    }
    
    setPostingReply(true);
    try {
      const result = await addComment(post.$id, user.$id, replyText.trim(), parentCommentId);
      console.log("Reply added:", result);
      await fetchPostComments(); // Refresh comments to get structured data
      setReplyText("");
      setReplyingTo(null);
    } catch (error) {
      console.error("Error adding reply:", error);
      Alert.alert("Error", error.message || "Failed to add reply.");
    } finally {
      setPostingReply(false);
    }
  };

  const handleLikeComment = async (commentId, currentLikes) => {
    console.log("handleLikeComment called:", { commentId, currentLikes, userId: user?.$id });
    if (!user?.$id) {
      Alert.alert("Error", "Please log in to like comments.");
      return;
    }
    
    const isLiked = Array.isArray(currentLikes) ? currentLikes.includes(user.$id) : false;
    const newLikedState = !isLiked;
    console.log("Like state:", { isLiked, newLikedState });
    
    // Optimistic update
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.$id === commentId) {
          const currentLikesArray = Array.isArray(comment.likes) ? comment.likes : [];
          const updatedLikes = newLikedState
            ? [...currentLikesArray, user.$id]
            : currentLikesArray.filter((id) => id !== user.$id);
          return { ...comment, likes: updatedLikes };
        }
        // Also update in replies
        if (comment.replies && Array.isArray(comment.replies)) {
          const updatedReplies = comment.replies.map((reply) => {
            if (reply.$id === commentId) {
              const replyLikesArray = Array.isArray(reply.likes) ? reply.likes : [];
              const updatedLikes = newLikedState
                ? [...replyLikesArray, user.$id]
                : replyLikesArray.filter((id) => id !== user.$id);
              return { ...reply, likes: updatedLikes };
            }
            return reply;
          });
          return { ...comment, replies: updatedReplies };
        }
        return comment;
      })
    );
    
    try {
      await toggleLikeComment(commentId, user.$id);
    } catch (error) {
      console.error("Error liking comment:", error);
      // Revert on error
      await fetchPostComments();
      Alert.alert("Error", error.message || "Failed to like comment.");
    }
  };

  const handleShowLikes = async (commentId, commentAuthorId) => {
    // Only show likes modal if current user is the comment author
    if (user?.$id !== commentAuthorId) {
      return;
    }
    
    setSelectedCommentId(commentId);
    setLikesModalVisible(true);
    setLoadingLikes(true);
    
    try {
      const userIds = await getCommentLikes(commentId);
      // Fetch user info for each userId
      const users = await Promise.all(
        userIds.map(async (uid) => {
          try {
            const u = await databases.getDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userCollectionId,
              uid
            );
            return { $id: u.$id, username: u.username, avatar: u.avatar };
          } catch {
            return { $id: uid, username: "Unknown", avatar: images.profile };
          }
        })
      );
      setLikesList(users);
    } catch (error) {
      setLikesList([]);
    } finally {
      setLoadingLikes(false);
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
                comments.map((comment) => {
                  const commentLikes = Array.isArray(comment.likes) ? comment.likes : [];
                  const isLiked = commentLikes.includes(user?.$id);
                  const isCommentAuthor = comment.userId === user?.$id;
                  
                  return (
                    <View key={comment.$id} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: "row" }}>
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
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                            <Text style={{ color: theme.textMuted, fontSize: 11, marginRight: 12 }}>
                              {new Date(comment.createdAt).toLocaleString()}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleLikeComment(comment.$id, commentLikes)}
                              style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}
                            >
                              <Image
                                source={isLiked ? icons.heartCheck : icons.heartUncheck}
                                style={{ width: 20, height: 20, marginRight: 4 }}
                                resizeMode="contain"
                              />
                              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                {commentLikes.length}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setReplyingTo(comment.$id);
                                setReplyText("");
                              }}
                              style={{ marginRight: 16 }}
                            >
                              <Text style={{ color: theme.accent, fontSize: 12 }}>
                                Reply
                              </Text>
                            </TouchableOpacity>
                            {isCommentAuthor && commentLikes.length > 0 && (
                              <TouchableOpacity
                                onPress={() => handleShowLikes(comment.$id, comment.userId)}
                              >
                                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                  View {commentLikes.length} {commentLikes.length === 1 ? "like" : "likes"}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          {/* Reply input */}
                          {replyingTo === comment.$id && (
                            <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                              <Image
                                source={{ uri: user?.avatar || images.profile }}
                                style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                              />
                              <TextInput
                                value={replyText}
                                onChangeText={setReplyText}
                                placeholder="Write a reply..."
                                placeholderTextColor={theme.textMuted}
                                style={{
                                  flex: 1,
                                  backgroundColor: themedColor("#2a2a40", theme.cardSoft),
                                  color: theme.textPrimary,
                                  borderRadius: 16,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  fontSize: 13,
                                }}
                              />
                              <TouchableOpacity
                                onPress={() => handleAddReply(comment.$id)}
                                disabled={postingReply || !replyText.trim()}
                                style={{
                                  marginLeft: 8,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  backgroundColor: postingReply ? theme.textMuted : theme.accent,
                                  borderRadius: 16,
                                }}
                              >
                                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                                  {postingReply ? "..." : "Send"}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                                style={{ marginLeft: 8 }}
                              >
                                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          
                          {/* Nested replies */}
                          {comment.replies && comment.replies.length > 0 && (
                            <View style={{ marginTop: 12, marginLeft: 20, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: theme.divider }}>
                              {comment.replies.map((reply) => {
                                const replyLikes = Array.isArray(reply.likes) ? reply.likes : [];
                                const isReplyLiked = replyLikes.includes(user?.$id);
                                const isReplyAuthor = reply.userId === user?.$id;
                                
                                return (
                                  <View key={reply.$id} style={{ marginBottom: 12 }}>
                                    <View style={{ flexDirection: "row" }}>
                                      <Image
                                        source={{ uri: reply.avatar || images.profile }}
                                        style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                                      />
                                      <View style={{ flex: 1 }}>
                                        <Text
                                          style={{
                                            color: theme.textPrimary,
                                            fontWeight: "600",
                                            fontSize: 13,
                                          }}
                                        >
                                          {reply.username || reply.userId}
                                        </Text>
                                        <Text
                                          style={{
                                            color: theme.textSecondary,
                                            fontSize: 13,
                                            marginVertical: 2,
                                          }}
                                        >
                                          {reply.content}
                                        </Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                                          <Text style={{ color: theme.textMuted, fontSize: 10, marginRight: 12 }}>
                                            {new Date(reply.createdAt).toLocaleString()}
                                          </Text>
                                          <TouchableOpacity
                                            onPress={() => handleLikeComment(reply.$id, replyLikes)}
                                            style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}
                                          >
                                            <Image
                                              source={isReplyLiked ? icons.heartCheck : icons.heartUncheck}
                                              style={{ width: 18, height: 18, marginRight: 4 }}
                                              resizeMode="contain"
                                            />
                                            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                                              {replyLikes.length}
                                            </Text>
                                          </TouchableOpacity>
                                          {isReplyAuthor && replyLikes.length > 0 && (
                                            <TouchableOpacity
                                              onPress={() => handleShowLikes(reply.$id, reply.userId)}
                                            >
                                              <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                                                View {replyLikes.length} {replyLikes.length === 1 ? "like" : "likes"}
                                              </Text>
                                            </TouchableOpacity>
                                          )}
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
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

        {/* Likes Modal */}
        <Modal
          visible={likesModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setLikesModalVisible(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: themedColor("#1c1c2e", theme.surface),
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "80%",
                paddingTop: 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingBottom: 16,
                  borderBottomWidth: 0.5,
                  borderBottomColor: theme.divider,
                }}
              >
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 18,
                    fontWeight: "600",
                  }}
                >
                  People who liked this comment
                </Text>
                <TouchableOpacity onPress={() => setLikesModalVisible(false)}>
                  <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingLikes ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator color={theme.accent} size="large" />
                </View>
              ) : likesList.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                    No likes yet
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={likesList}
                  keyExtractor={(item) => item.$id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderBottomWidth: 0.5,
                        borderBottomColor: theme.divider,
                      }}
                      onPress={() => {
                        setLikesModalVisible(false);
                        router.push(`/profile/${item.$id}`);
                      }}
                    >
                      <Image
                        source={{ uri: item.avatar || images.profile }}
                        style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                      />
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontSize: 16,
                          fontWeight: "500",
                        }}
                      >
                        {item.username || "Unknown"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PostDetails;


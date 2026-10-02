import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";

import { images } from "../../constants";
import { useGlobalContext } from "../../context/GlobalProvider";
import { emitContentFeedInvalidate } from "../../lib/contentFeedEvents";
import {
  createCirclePhotoPost,
  createCircleTextPost,
  createCircleVideoPost,
} from "../../lib/circlePosts";

const MODES = ["text", "photo", "video"];

export default function CircleCreatePost() {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const params = useLocalSearchParams();

  const circleId = String(
    Array.isArray(params.circleId) ? params.circleId[0] : params.circleId || ""
  ).trim();
  const circleName = String(
    Array.isArray(params.circleName)
      ? params.circleName[0]
      : params.circleName || ""
  ).trim();

  const [mode, setMode] = useState("text");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [photo, setPhoto] = useState(null);
  const [video, setVideo] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const themedColor = useCallback(
    (darkColor, lightColor) => (isDarkMode ? darkColor : lightColor),
    [isDarkMode]
  );

  const panelBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  const pickMedia = useCallback(
    async (kind) => {
      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            t("alerts.permissionRequiredTitle"),
            t("alerts.permissionRequiredMessage")
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes:
            kind === "video"
              ? ImagePicker.MediaTypeOptions.Videos
              : ImagePicker.MediaTypeOptions.Images,
          allowsEditing: kind === "photo",
          quality: 0.85,
          videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets?.[0]?.uri) return;
        const asset = result.assets[0];
        const file = {
          uri: asset.uri,
          name:
            asset.fileName ||
            (kind === "video" ? "circle-video.mp4" : "circle-photo.jpg"),
          type:
            asset.mimeType ||
            (kind === "video" ? "video/mp4" : "image/jpeg"),
          size: asset.fileSize || 0,
        };
        if (kind === "video") {
          setVideo(file);
          setPhoto(null);
        } else {
          setPhoto(file);
          setVideo(null);
        }
      } catch (e) {
        Alert.alert(
          t("common.error"),
          e?.message || t("alerts.mediaSelectError")
        );
      }
    },
    [t]
  );

  const handlePublish = useCallback(async () => {
    if (!user?.$id || publishing) return;
    if (!circleId) {
      Alert.alert(t("common.error"), t("circles.createPostMissingCircle"));
      return;
    }

    if (mode === "text" && !body.trim() && !title.trim()) {
      Alert.alert(t("common.error"), t("circles.createPostNeedText"));
      return;
    }

    setPublishing(true);
    try {
      if (mode === "text") {
        await createCircleTextPost({
          user,
          circleId,
          body,
          title,
        });
      } else if (mode === "photo") {
        if (!photo?.uri) {
          Alert.alert(t("common.error"), t("circles.createPostNeedPhoto"));
          setPublishing(false);
          return;
        }
        await createCirclePhotoPost({
          user,
          circleId,
          photo,
          title: title || body.slice(0, 80),
          caption: body,
        });
      } else {
        if (!video?.uri) {
          Alert.alert(t("common.error"), t("circles.createPostNeedVideo"));
          setPublishing(false);
          return;
        }
        await createCircleVideoPost({
          user,
          circleId,
          video,
          title: title || body.slice(0, 80) || "Circle video",
          prompt: body || " ",
        });
      }

      emitContentFeedInvalidate({
        type: mode === "text" ? "all" : mode,
        userId: user.$id,
        circleId,
      });
      router.replace(`/circle/${circleId}`);
    } catch (e) {
      Alert.alert(
        t("circles.createPostFailedTitle"),
        e?.message || t("circles.createPostFailedMessage")
      );
    } finally {
      setPublishing(false);
    }
  }, [
    user,
    publishing,
    circleId,
    mode,
    body,
    title,
    photo,
    video,
    t,
  ]);

  if (!circleId) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", padding: 24 }}
      >
        <Text
          style={{
            color: theme.textPrimary,
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            textAlign: "center",
          }}
        >
          {t("circles.createPostMissingCircle")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16, alignSelf: "center" }}
        >
          <Text style={{ color: theme.accent, fontFamily: "Poppins-SemiBold" }}>
            {t("circles.back")}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ImageBackground
        source={panelBackgroundImage}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("circles.back")}
            >
              <Feather
                name={isRTL ? "arrow-right" : "arrow-left"}
                size={24}
                color={theme.textPrimary}
              />
            </TouchableOpacity>
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 16,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {t("circles.createForCircleTitle")}
              </Text>
              {circleName ? (
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontFamily: "Poppins-Regular",
                    fontSize: 12,
                    textAlign: "center",
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {t("circles.postingToCircle", { name: circleName })}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={handlePublish}
              disabled={publishing}
              style={{
                backgroundColor: theme.accent,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                opacity: publishing ? 0.6 : 1,
                minWidth: 72,
                alignItems: "center",
              }}
            >
              {publishing ? (
                <ActivityIndicator color="#0B0B0B" size="small" />
              ) : (
                <Text
                  style={{
                    color: "#0B0B0B",
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                  }}
                >
                  {t("circles.publishPost")}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {MODES.map((item) => {
                const selected = mode === item;
                return (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setMode(item)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected
                        ? themedColor("rgba(255,156,1,0.18)", "rgba(255,156,1,0.12)")
                        : theme.surface,
                      alignItems: "center",
                    }}
                  >
                    <Feather
                      name={
                        item === "text"
                          ? "type"
                          : item === "photo"
                            ? "image"
                            : "video"
                      }
                      size={16}
                      color={selected ? theme.accent : theme.textSecondary}
                    />
                    <Text
                      style={{
                        marginTop: 4,
                        color: selected ? theme.accent : theme.textSecondary,
                        fontFamily: selected
                          ? "Poppins-SemiBold"
                          : "Poppins-Regular",
                        fontSize: 12,
                      }}
                    >
                      {t(`circles.postType${item.charAt(0).toUpperCase()}${item.slice(1)}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text
              style={{
                color: theme.textSecondary,
                fontFamily: "Poppins-Regular",
                fontSize: 12,
                marginBottom: 6,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t("circles.createPostTitleLabel")}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("circles.createPostTitlePlaceholder")}
              placeholderTextColor={theme.textSecondary}
              style={{
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.textPrimary,
                fontFamily: "Poppins-Regular",
                fontSize: 14,
                textAlign: isRTL ? "right" : "left",
                marginBottom: 14,
              }}
            />

            <Text
              style={{
                color: theme.textSecondary,
                fontFamily: "Poppins-Regular",
                fontSize: 12,
                marginBottom: 6,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {mode === "text"
                ? t("circles.createPostBodyLabel")
                : t("circles.createPostCaptionLabel")}
            </Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={
                mode === "text"
                  ? t("circles.createPostBodyPlaceholder")
                  : t("circles.createPostCaptionPlaceholder")
              }
              placeholderTextColor={theme.textSecondary}
              multiline
              textAlignVertical="top"
              style={{
                minHeight: mode === "text" ? 160 : 96,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.textPrimary,
                fontFamily: "Poppins-Regular",
                fontSize: 14,
                textAlign: isRTL ? "right" : "left",
                marginBottom: 16,
              }}
            />

            {mode === "photo" ? (
              <View style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => pickMedia("photo")}
                  style={{
                    height: 220,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {photo?.uri ? (
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Feather name="image" size={28} color={theme.accent} />
                      <Text
                        style={{
                          marginTop: 8,
                          color: theme.textSecondary,
                          fontFamily: "Poppins-Regular",
                          fontSize: 13,
                        }}
                      >
                        {t("circles.createPostPickPhoto")}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            {mode === "video" ? (
              <View style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => pickMedia("video")}
                  style={{
                    height: 220,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {video?.uri ? (
                    <Video
                      source={{ uri: video.uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                      isMuted
                    />
                  ) : (
                    <>
                      <Feather name="video" size={28} color={theme.accent} />
                      <Text
                        style={{
                          marginTop: 8,
                          color: theme.textSecondary,
                          fontFamily: "Poppins-Regular",
                          fontSize: 13,
                        }}
                      >
                        {t("circles.createPostPickVideo")}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: themedColor(
                  "rgba(255,156,1,0.12)",
                  "rgba(255,156,1,0.1)"
                ),
                borderWidth: 1,
                borderColor: themedColor(
                  "rgba(255,156,1,0.35)",
                  "rgba(255,156,1,0.25)"
                ),
              }}
            >
              <Text
                style={{
                  color: theme.textPrimary,
                  fontFamily: "Poppins-Regular",
                  fontSize: 12,
                  lineHeight: 18,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t("circles.createPostScopeHint")}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

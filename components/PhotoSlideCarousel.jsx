import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

const PhotoSlideCarousel = ({
  uris = [],
  width,
  height,
  resizeMode = "contain",
  renderFirst,
  renderSlide,
  showDots = true,
  showArrows = true,
  onIndexChange,
  style,
}) => {
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [measured, setMeasured] = useState({ w: 0, h: 0 });

  const slides = (Array.isArray(uris) ? uris : []).filter(
    (uri) => typeof uri === "string" && uri.trim()
  );
  const w = width || measured.w;
  const h = height || measured.h;

  useEffect(() => {
    setIndex(0);
    if (slides.length && listRef.current && w) {
      try {
        listRef.current.scrollToOffset({ offset: 0, animated: false });
      } catch (_) {}
    }
  }, [slides.join("|")]);

  const renderOne = (uri, i) => {
    if (typeof renderSlide === "function") {
      return renderSlide(uri, i);
    }
    if (i === 0 && typeof renderFirst === "function") {
      return renderFirst(uri, i);
    }
    return (
      <Image
        source={{ uri }}
        style={{ width: w || "100%", height: h || "100%" }}
        resizeMode={resizeMode}
      />
    );
  };

  if (!slides.length) return null;

  if (slides.length === 1) {
    return (
      <View
        style={[
          {
            width: width || "100%",
            height: height || "100%",
            overflow: "hidden",
          },
          style,
        ]}
      >
        {renderOne(slides[0], 0)}
      </View>
    );
  }

  const onLayout = (event) => {
    if (width && height) return;
    const { width: lw, height: lh } = event.nativeEvent.layout;
    if (lw > 0 && lh > 0 && (lw !== measured.w || lh !== measured.h)) {
      setMeasured({ w: lw, h: lh });
    }
  };

  const indicators = (
    <View pointerEvents="none" style={styles.overlay}>
      {showDots && slides.length <= 8 ? (
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={`dot-${i}`}
              style={[
                styles.dot,
                i === index ? styles.dotActive : styles.dotIdle,
              ]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1}/{slides.length}
          </Text>
        </View>
      )}
    </View>
  );

  if (!w || !h) {
    return (
      <View
        onLayout={onLayout}
        style={[
          { width: width || "100%", height: height || "100%", overflow: "hidden" },
          style,
        ]}
      >
        {indicators}
      </View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        { width: w, height: h, overflow: "hidden" },
        style,
      ]}
    >
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        disableIntervalMomentum
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(uri, i) => `${uri}-${i}`}
        getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / w);
          const clamped = Math.max(0, Math.min(slides.length - 1, next));
          setIndex(clamped);
          onIndexChange?.(clamped);
        }}
        renderItem={({ item: uri, index: i }) => (
          <View style={{ width: w, height: h }}>{renderOne(uri, i)}</View>
        )}
      />
      {indicators}
      {showArrows && index > 0 ? (
        <TouchableOpacity
          onPress={() => {
            const next = index - 1;
            listRef.current?.scrollToIndex({ index: next, animated: true });
            setIndex(next);
            onIndexChange?.(next);
          }}
          style={styles.arrowLeft}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
      ) : null}
      {showArrows && index < slides.length - 1 ? (
        <TouchableOpacity
          onPress={() => {
            const next = index + 1;
            listRef.current?.scrollToIndex({ index: next, animated: true });
            setIndex(next);
            onIndexChange?.(next);
          }}
          style={styles.arrowRight}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export function PhotoSlideCountBadge({ count, style }) {
  if (!count || count < 2) return null;
  return (
    <View style={[styles.badge, style]}>
      <Feather name="copy" size={11} color="#fff" />
      <Text style={styles.badgeText}>{count}</Text>
    </View>
  );
}

const styles = {
  overlay: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 8,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: "#FFFFFF",
  },
  dotIdle: {
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  counter: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  arrowLeft: {
    position: "absolute",
    left: 8,
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9,
  },
  arrowRight: {
    position: "absolute",
    right: 8,
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9,
  },
  arrowText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
    marginTop: -2,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
};

export default PhotoSlideCarousel;

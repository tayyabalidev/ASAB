module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "@babel/plugin-transform-runtime",
      "nativewind/babel",
      "react-native-reanimated/plugin", // Must be last plugin - includes worklets internally
    ],
  };
};

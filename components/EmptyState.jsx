import { router } from "expo-router";
import { View, Text, Image } from "react-native";
import { useTranslation } from "react-i18next";

import { images } from "../constants";
import CustomButton from "./CustomButton";

const EmptyState = ({ title, subtitle }) => {
  const { t } = useTranslation();

  return (
    <View className="flex justify-center items-center px-4">
      <Image
        source={images.Asearch}
        resizeMode="contain"
        className="w-[270px] h-[216px]"
      />

      <Text className="text-sm font-pmedium text-gray-100">{title}</Text>
      <Text className="text-xl text-center font-psemibold text-white mt-2">
        {subtitle}
      </Text>

      <CustomButton
        title={t('common.backToExplore')}
        handlePress={() => router.push("/home")}
        containerStyles="w-full my-5"
      />
    </View>
  );
};

export default EmptyState;


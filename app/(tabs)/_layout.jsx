import { StatusBar } from "expo-status-bar";
import { Redirect, Tabs } from "expo-router";
import { Text, View } from "react-native";
import { Feather } from '@expo/vector-icons';
import { useTranslation } from "react-i18next";

import { Loader } from "../../components";
import { useGlobalContext } from "../../context/GlobalProvider";

const TabIcon = ({ iconName, color, focused, label, isRTL }) => {
  return (
    <View className="flex items-center justify-center" style={{ gap: 2 }}>
      <Feather name={iconName} size={26} color={color} />
      <Text
        className={`${focused ? "font-psemibold" : "font-pregular"} text-xs text-center`}
        style={{
          color,
          marginTop: 2,
          lineHeight: 16,
          minWidth: 48,
          textAlign: isRTL ? "right" : "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
};

const TabLayout = () => {
  const { loading, isLogged, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();

  const tabLabels = {
    home: t("nav.home"),
    liveStreams: t("nav.liveStreams"),
    friends: t("nav.friends"),
    create: t("nav.create"),
    inbox: t("nav.inbox"),
    profile: t("nav.profile"),
    donation: t("nav.donations"),
    goLive: t("nav.goLive"),
    chat: t("nav.chat"),
  };

  if (!loading && !isLogged) return <Redirect href="/sign-in" />;

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tabActive,
          tabBarInactiveTintColor: theme.tabInactive,
          tabBarShowLabel: false,
          tabBarStyle: {

            backgroundColor: theme.tabBar,
            height: 80,
            borderTopWidth: 0,
            paddingBottom: 0,
            paddingTop: 18,
          },
          tabBarItemStyle: {
            paddingHorizontal: 35,
            marginHorizontal: 15,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: tabLabels.home,
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                iconName="home"
                label={tabLabels.home}
                color={color}
                focused={focused}
                isRTL={isRTL}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: tabLabels.friends,
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                iconName="users"
                label={tabLabels.friends}
                color={color}
                focused={focused}
                isRTL={isRTL}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="create"
          options={{
            title: tabLabels.create,
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                iconName="plus-circle"
                label={tabLabels.create}
                color={color}
                focused={focused}
                isRTL={isRTL}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: tabLabels.inbox,
            headerShown: false,
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: tabLabels.chat,
            headerShown: false,
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: tabLabels.profile,
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                iconName="user"
                label={tabLabels.profile}
                color={color}
                focused={focused}
                isRTL={isRTL}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="donation"
          options={{
            title: tabLabels.donation,
            headerShown: false,
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="go-live"
          options={{
            title: tabLabels.goLive,
            headerShown: false,
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="live-streams"
          options={{
            title: tabLabels.liveStreams,
            headerShown: false,
            href: null, // Hide from tab bar
          }}
        />
      </Tabs>

      <Loader isLoading={loading} />
      <StatusBar backgroundColor={theme.tabBar} style={isDarkMode ? "light" : "dark"} />
    </>
  );
};

export default TabLayout;

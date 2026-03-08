import { Stack } from 'expo-router';

export default function CallLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'fullScreenModal',
        animation: 'slide_from_bottom',
        contentStyle: { backgroundColor: '#000' },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          title: '',
        }}
      />
    </Stack>
  );
}

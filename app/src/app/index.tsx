import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.text} />
    </View>
  );
}

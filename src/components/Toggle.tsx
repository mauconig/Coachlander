import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius } from '@/theme/tokens';

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  /** the editor uses a smaller track than the settings rows */
  size?: 'md' | 'sm';
  label?: string;
};

/** Lime pill switch. Off state is a hairline track. */
export function Toggle({ value, onChange, size = 'md', label }: Props) {
  const dims = size === 'md' ? { w: 44, h: 26, k: 20 } : { w: 38, h: 22, k: 18 };

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={[
        styles.track,
        {
          width: dims.w,
          height: dims.h,
          backgroundColor: value ? color.lime : color.raised,
          borderColor: value ? color.lime : color.border,
          justifyContent: value ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <View
        style={{
          width: dims.k,
          height: dims.k,
          borderRadius: radius.pill,
          backgroundColor: value ? color.ink : color.textFaint,
        }}
      />
    </Pressable>
  );
}

/** Circular radio used by the "assign to" and role pickers. */
export function RadioDot({ selected, size = 20 }: { selected: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: selected ? color.lime : 'transparent',
        borderWidth: selected ? 0 : 1,
        borderColor: color.border,
      }}
    />
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
  },
});

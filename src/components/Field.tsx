import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';

import { Txt } from './Txt';
import { font } from '@/theme/type';
import { color, hitSlop, radius } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  secure?: boolean;
  /** unit suffix pinned to the right, e.g. "kg" */
  suffix?: string;
  autoFocus?: boolean;
  style?: ViewStyle;
};

/**
 * Labelled input. The label turns lime while focused — that highlight is what
 * the design uses to show which field is live.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType,
  autoCapitalize = 'sentences',
  secure,
  suffix,
  autoFocus,
  style,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hot = focused;

  return (
    <View style={[styles.group, style]}>
      <Txt variant="label" tone={hot ? color.lime : color.textMuted}>
        {label}
      </Txt>

      <View style={[styles.box, hot && styles.boxHot]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.textFaint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          secureTextEntry={secure && !revealed}
          autoFocus={autoFocus}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          selectionColor={color.lime}
          style={[styles.input, secure && !revealed && styles.masked]}
        />

        {secure ? (
          <Pressable hitSlop={hitSlop} onPress={() => setRevealed((r) => !r)}>
            <Txt variant="labelTight">{revealed ? 'OCULTAR' : 'VER'}</Txt>
          </Pressable>
        ) : suffix ? (
          <Txt variant="meta">{suffix}</Txt>
        ) : null}
      </View>

      {hint ? <Txt variant="meta" tone={color.textFaint}>{hint}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  box: {
    height: 54,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  boxHot: { borderColor: color.lime },
  input: {
    flex: 1,
    color: color.text,
    fontFamily: font.uiSemi,
    fontSize: 15,
    padding: 0,
  },
  masked: { fontFamily: font.monoBold, letterSpacing: 3 },
});

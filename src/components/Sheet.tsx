import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { Txt } from './Txt';
import { GUTTER, color, hitSlop, radius } from '@/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** mono eyebrow above the title */
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  /** hide the close button (drag-to-dismiss sheets) */
  bare?: boolean;
};

/**
 * Bottom sheet over a scrim. Used by the session player for the weight picker
 * and the up-next queue.
 */
export function Sheet({ visible, onClose, eyebrow, title, children, bare }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Cerrar" />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 26 }]}>
          {bare ? (
            <Pressable onPress={onClose} style={styles.grabberTap} accessibilityLabel="Cerrar">
              <View style={styles.grabber} />
            </Pressable>
          ) : null}

          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                {eyebrow ? <Txt variant="label">{eyebrow}</Txt> : null}
                <Txt variant="h4">{title}</Txt>
              </View>
              <Pressable
                hitSlop={hitSlop}
                onPress={onClose}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Icon name="close" size={16} tone={color.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: GUTTER,
    paddingTop: 18,
    gap: 16,
  },
  grabberTap: { alignItems: 'center', paddingBottom: 4 },
  grabber: { width: 46, height: 4, borderRadius: radius.pill, backgroundColor: color.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, gap: 3 },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

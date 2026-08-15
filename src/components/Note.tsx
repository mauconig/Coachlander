import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

/** Quiet explanatory panel — sets expectations before a destructive/AI step. */
export function Note({ children, icon }: { children: string; icon?: boolean }) {
  return (
    <View style={styles.note}>
      {icon ? <Icon name="info" size={16} tone={color.lime} /> : null}
      <Txt variant="body" tone={color.textMuted} style={styles.noteText}>
        {children}
      </Txt>
    </View>
  );
}

/** "———— O ————" separator between primary and alternative actions. */
export function OrDivider({ label = 'O' }: { label?: string }) {
  return (
    <View style={styles.or}>
      <View style={styles.rule} />
      <Txt variant="label" tone={color.textFaint}>
        {label}
      </Txt>
      <View style={styles.rule} />
    </View>
  );
}

/** Mono eyebrow with an optional right-aligned counter. */
export function SectionHeader({
  title,
  trailing,
  trailingTone = color.lime,
}: {
  title: string;
  trailing?: string;
  trailingTone?: string;
}) {
  return (
    <View style={styles.section}>
      <Txt variant="eyebrow">{title}</Txt>
      {trailing ? (
        <Txt variant="eyebrow" tone={trailingTone}>
          {trailing}
        </Txt>
      ) : null}
    </View>
  );
}

/** Screen title + supporting sentence, the standard heading block. */
export function Heading({
  title,
  subtitle,
  variant = 'h1',
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: 'h1' | 'h2' | 'hero';
  children?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <Txt variant={variant}>{title}</Txt>
      {subtitle ? <Txt variant="body">{subtitle}</Txt> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    padding: 16,
  },
  noteText: { flex: 1 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: color.border },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  heading: { gap: 8 },
});

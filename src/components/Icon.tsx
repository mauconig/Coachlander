import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'check'
  | 'plus'
  | 'question'
  | 'more'
  | 'backspace'
  | 'play'
  | 'grip'
  | 'info'
  | 'file'
  | 'text'
  | 'today'
  | 'progress'
  | 'history'
  | 'profile'
  | 'clients'
  | 'routines'
  | 'messages';

type Props = {
  name: IconName;
  size?: number;
  tone?: string;
  /** stroke weight; solid glyphs ignore it */
  weight?: number;
};

/**
 * Line icons drawn on a 24x24 grid. The design doc used flat placeholder
 * squares for iconography, so these are the concrete glyphs that carry the
 * same meaning at the same optical weight.
 */
export function Icon({ name, size = 20, tone = color.textMuted, weight = 2 }: Props) {
  const stroke = { stroke: tone, strokeWidth: weight, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chevron-left' && <Path d="M15 5 8 12l7 7" {...stroke} />}
      {name === 'chevron-right' && <Path d="M9 5l7 7-7 7" {...stroke} />}
      {name === 'chevron-down' && <Path d="M5 9l7 7 7-7" {...stroke} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
      {name === 'check' && <Path d="M4 12.5l5.5 5.5L20 7" {...stroke} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === 'question' && (
        <>
          <Path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5" {...stroke} />
          <Circle cx={12} cy={18} r={1} fill={tone} />
        </>
      )}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.6} fill={tone} />
          <Circle cx={12} cy={12} r={1.6} fill={tone} />
          <Circle cx={19} cy={12} r={1.6} fill={tone} />
        </>
      )}
      {name === 'backspace' && (
        <>
          <Path d="M20 5H9L3 12l6 7h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" {...stroke} />
          <Path d="M15 9.5l-5 5M10 9.5l5 5" {...stroke} />
        </>
      )}
      {name === 'play' && <Path d="M7 4.5l13 7.5-13 7.5Z" fill={tone} />}
      {name === 'grip' && (
        <>
          <Circle cx={9} cy={6} r={1.5} fill={tone} />
          <Circle cx={15} cy={6} r={1.5} fill={tone} />
          <Circle cx={9} cy={12} r={1.5} fill={tone} />
          <Circle cx={15} cy={12} r={1.5} fill={tone} />
          <Circle cx={9} cy={18} r={1.5} fill={tone} />
          <Circle cx={15} cy={18} r={1.5} fill={tone} />
        </>
      )}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 11v6" {...stroke} />
          <Circle cx={12} cy={7.5} r={1.1} fill={tone} />
        </>
      )}
      {name === 'file' && (
        <>
          <Path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" {...stroke} />
          <Path d="M14 3v4h4" {...stroke} />
        </>
      )}
      {name === 'text' && <Path d="M5 6h14M5 11h14M5 16h9" {...stroke} />}

      {/* --- tab bar --- */}
      {name === 'today' && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={4} {...stroke} />
          <Path d="M3 10h18M8 3v4M16 3v4" {...stroke} />
          <Path d="M11 13.5l4 2.2-4 2.3Z" fill={tone} />
        </>
      )}
      {name === 'progress' && (
        <>
          <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke} />
        </>
      )}
      {name === 'history' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 7v5.3l3.4 2" {...stroke} />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={8.5} r={3.8} {...stroke} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...stroke} />
        </>
      )}
      {name === 'clients' && (
        <>
          <Circle cx={9} cy={8.5} r={3.4} {...stroke} />
          <Path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" {...stroke} />
          <Path d="M16 5.5a3.4 3.4 0 0 1 0 6.6M17 14.5a6.5 6.5 0 0 1 4.5 5" {...stroke} />
        </>
      )}
      {name === 'routines' && (
        <>
          <Path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11M7 12h10" {...stroke} />
        </>
      )}
      {name === 'messages' && (
        <Path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.5L7 20.5V16.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" {...stroke} />
      )}
    </Svg>
  );
}

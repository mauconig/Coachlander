import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type SessionTone =
  | 'countdown'
  | 'start'
  | 'set'
  | 'restStart'
  | 'restEnd'
  | 'overtime'
  | 'overtimePulse'
  | 'exercise'
  | 'finish';

// Short 8 kHz PCM tone embedded in the bundle so feedback never depends on
// the catalog server or an internet connection.
const TONE_URI =
  'data:audio/wav;base64,UklGRiQFAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAFAACAnLG5sp6CZVBHTWF8ma+4s6CFaVJITF55lay3tKOJbFVJTFx2kqq2taWMcFhKS1pyj6e1taePc1tMS1hvi6SztamSd15NS1ZsiKGytauVemFPS1RphJ6wtayYfWRRS1NngZuuta6bgWdTTFJkfpistK+dhGpWTFFiepWps7Cgh21YTVBfd5GnsrCiinBaTk9ddI6ksbGkjXNdUE9bcYuisLGlkHdgUU9aboifrrGnk3piU09YbIWcrLGolX1lVU9XaYKZqrCqmIBoV1BWZ36WqLCrmoNrWVFVZXyTpq+rnIZuW1FUY3mRpK6snolxXVJUYXaOoq2soIt0X1RUX3OLn6ytoo53YlVTXnGInaqto5F6ZFdUXG6FmqmspJN9Z1hUW2yCmKespZV/alpUWmp/laWrppeCbFxVWWh9kqOrp5mFb15WWWZ6kKGqqJuHcmBXWGR3jZ+pqJ2KdGJYWGN1ip2oqJ6Md2RZWGFziJumqJ+OemdaWGBxhZilqKGRfGlcWF9ug5ajqKGTf2tdWV5tgJOip6KUgW5fWV1rfpGgp6OWhHBhWl1pe4+epqOYhnNjW1xneYycpaSZiHVlXFxmd4qapKSbindnXVxldYeYo6ScjHppXlxkc4WWoaSdjnxrX11jcYOUoKOekH5tYV1ib4GSnqOekoFvYl1hbn6QnaKfk4NxZF5hbHyNm6GflYV0Zl9ha3qLmaGflod2aGBhaniJmKCfl4l4aWFhaHeHlp+fmIp6a2JhaHWFlJ2fmYx8bWNhZ3ODkpyfmo5+b2VhZnKBkJuemo+AcWZiZnB/jpmem5CCc2diZW99jJidm5KEdWljZW57ipacm5OFd2pkZW16iJWcm5SHeWxlZWx4h5Obm5WJem5mZWt3hZGam5WKfG9nZWp1g5CYm5aLfnFoZmp0gY6XmpaNgHNpZmpzgIyWmpeOgXRrZ2lyfouVmZePg3ZsZ2lxfYmTmJeQhHhtaGlwe4eSl5eQhnlvaWlveoaQl5eRh3twamlveYSPlpeSiHxya2pud4ONlZaSiX5zbGpudoGMk5aSin91bWptdYCLkpWTi4F2bmttdX+JkZWTjIJ4b2xtdH2IkJSTjYN5cWxtc3yGj5OTjYR6cm1tc3uFjpKTjoV8c25ucnqEjJKSjoZ9dG9ucnmDi5GSjod+dnBucXiBipCRj4h/d3FvcXiAiY+Rj4mAeHJvcXd/h46Qj4mBeXNwcXd+ho2Qj4qCenRxcXZ9hYyPjoqDe3VxcnZ9hIuOjoqEfHZycnV8g4qOjouFfXdzcnV7gomNjouFfnh0c3V7gYiMjYuGf3l0c3V6gIeLjYuGgHp1dHV6gIaKjIuHgXt2dHV5f4WJi4uHgXx3dXZ5foSJi4qHgnx4dXZ5foOIioqHg315dnZ5fYKHioqHg356d3d5fYKGiYmHg396eHd5fIGFiImHhH97eHd5fICEh4iHhIB8eXh5fICEh4iHhIB9enl5fH+DhoeHhIF9enl6fH+ChYeGhIF+e3p6fH+ChYaGhIF+fHp6fH6BhIWFhIJ/fHt7fH6Bg4WFhIJ/fXx7fH6Bg4SEhIKAfnx8fX6AgoSEg4KAfn18fX6AgoODg4KAfn19fX6AgYKDg4KAf359fn6AgYKCgoGAf35+fn+AgYGCgoGAgH9+f3+AgIGBgYGAgH9/f3+AgIGBgYGAgICAgICAgICAgICAgA==';

let audioModePromise: Promise<void> | null = null;

function prepareAudio() {
  if (!audioModePromise) {
    audioModePromise = setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: true,
    }).catch((error: unknown) => {
      console.warn('[Coachlander] No se pudo configurar el audio de sesión', error);
    });
  }
  return audioModePromise;
}

const settings: Record<SessionTone, { volume: number; rate: number; haptic: 'light' | 'medium' | 'success' }> = {
  countdown: { volume: 1, rate: 1.5, haptic: 'light' },
  start: { volume: 1, rate: 0.8, haptic: 'medium' },
  set: { volume: 0.8, rate: 1.2, haptic: 'light' },
  restStart: { volume: 0.7, rate: 0.7, haptic: 'light' },
  restEnd: { volume: 1, rate: 1.3, haptic: 'medium' },
  overtime: { volume: 1, rate: 0.6, haptic: 'medium' },
  overtimePulse: { volume: 0.65, rate: 1.8, haptic: 'light' },
  exercise: { volume: 0.9, rate: 1, haptic: 'medium' },
  finish: { volume: 1, rate: 0.9, haptic: 'success' },
};

function playTone(event: SessionTone) {
  if (Platform.OS === 'web') return;
  const config = settings[event];
  void prepareAudio();
  try {
    const player = createAudioPlayer(TONE_URI, { keepAudioSessionActive: true });
    player.volume = config.volume;
    player.setPlaybackRate(config.rate);
    player.play();
    setTimeout(() => player.remove(), 900);
  } catch (error) {
    console.warn('[Coachlander] No se pudo reproducir el tono de sesión', error);
  }

  const haptic = config.haptic === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(config.haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  void haptic.catch(() => undefined);
}

export function playSessionTone(event: SessionTone) {
  playTone(event);
}

/** Repeated local beeps for countdowns and important session boundaries. */
export function playSessionBeeps(event: SessionTone, count: number, gapMs = 180) {
  if (Platform.OS === 'web') return;
  for (let index = 0; index < count; index += 1) {
    setTimeout(() => playTone(event), index * gapMs);
  }
}

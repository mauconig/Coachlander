import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SESSION_NOTIFICATION_ID = 'coachlander-active-session';
export const SESSION_NOTIFICATION_CATEGORY = 'COACHLANDER_ACTIVE_SESSION';
export const SESSION_NOTIFICATION_CHANNEL = 'coachlander-session';

export const SESSION_NOTIFICATION_ACTIONS = {
  pause: 'COACHLANDER_PAUSE_SESSION',
  skip: 'COACHLANDER_SKIP_SESSION',
  open: 'COACHLANDER_OPEN_SESSION',
} as const;

let configured = false;
let lastUpdateAt = 0;
let updatePromise: Promise<void> = Promise.resolve();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function configureSessionNotifications() {
  if (Platform.OS === 'web' || configured) return;
  configured = true;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(SESSION_NOTIFICATION_CHANNEL, {
        name: 'Sesión activa',
        description: 'Controles del temporizador de entrenamiento',
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: [0, 80],
        sound: null,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) await Notifications.requestPermissionsAsync();

    await Notifications.setNotificationCategoryAsync(SESSION_NOTIFICATION_CATEGORY, [
      {
        identifier: SESSION_NOTIFICATION_ACTIONS.pause,
        buttonTitle: 'Pausar / seguir',
        options: { opensAppToForeground: false },
      },
      {
        identifier: SESSION_NOTIFICATION_ACTIONS.skip,
        buttonTitle: 'Saltar',
        options: { opensAppToForeground: false },
      },
      {
        identifier: SESSION_NOTIFICATION_ACTIONS.open,
        buttonTitle: 'Abrir sesión',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (error) {
    configured = false;
    console.warn('[Coachlander] No se pudieron configurar las notificaciones de sesión', error);
  }
}

function schedule(content: Notifications.NotificationContentInput) {
  updatePromise = updatePromise
    .catch(() => undefined)
    .then(async () => {
      await Notifications.cancelScheduledNotificationAsync(SESSION_NOTIFICATION_ID).catch(() => undefined);
      await Notifications.scheduleNotificationAsync({
        identifier: SESSION_NOTIFICATION_ID,
        content,
        trigger: Platform.OS === 'android' ? { channelId: SESSION_NOTIFICATION_CHANNEL } : null,
      });
    });
  return updatePromise;
}

export function presentSessionNotification(input: {
  routineTitle: string;
  exerciseName: string;
  phaseLabel: string;
  clock: string;
  setLabel: string;
  paused: boolean;
}) {
  if (Platform.OS === 'web' || !configured) return;
  const now = Date.now();
  if (now - lastUpdateAt < 900) return;
  lastUpdateAt = now;

  const status = input.paused ? 'Pausada' : `${input.phaseLabel} · ${input.clock}`;
  void schedule({
    title: input.routineTitle || 'Sesión activa',
    body: `${input.exerciseName} · ${status} · ${input.setLabel}`,
    data: { action: SESSION_NOTIFICATION_ACTIONS.open },
    categoryIdentifier: SESSION_NOTIFICATION_CATEGORY,
    sound: false,
    sticky: true,
    autoDismiss: false,
    color: '#E4FF1A',
    priority: 'low',
  }).catch((error: unknown) => {
    console.warn('[Coachlander] No se pudo actualizar la notificación de sesión', error);
  });
}

export function clearSessionNotification() {
  if (Platform.OS === 'web') return;
  lastUpdateAt = 0;
  updatePromise = updatePromise
    .catch(() => undefined)
    .then(() => Notifications.cancelScheduledNotificationAsync(SESSION_NOTIFICATION_ID).catch(() => undefined));
}

import { Redirect } from 'expo-router';

import { useApp } from '@/state/AppState';

/** Sends the app to onboarding, or to the tab set for the signed-in role. */
export default function Entry() {
  const { signedIn, role } = useApp();

  if (!signedIn) return <Redirect href="/bienvenida" />;
  return <Redirect href={role === 'coach' ? '/alumnos' : '/hoy'} />;
}

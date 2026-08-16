import { Redirect } from 'expo-router';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useApp } from '@/state/AppState';

/** Sends the app to onboarding, or to the tab set for the signed-in role. */
export default function Entry() {
  const { authReady, signedIn, remoteStatus, retryRemoteData, role } = useApp();

  if (!authReady) {
    return <AppLoadingScreen title="Conectando con Coachlander" detail="Verificando tu sesión." />;
  }
  if (!signedIn) return <Redirect href="/bienvenida" />;
  if (remoteStatus === 'error') {
    return (
      <AppLoadingScreen
        error
        title="No pudimos cargar tu cuenta"
        detail="Revisá tu conexión e intentá de nuevo."
        actionLabel="Reintentar"
        onAction={() => void retryRemoteData()}
      />
    );
  }
  if (remoteStatus !== 'ready') {
    return <AppLoadingScreen title="Preparando tu espacio" detail="Estamos cargando tus datos." />;
  }
  return <Redirect href={role === 'coach' ? '/alumnos' : '/hoy'} />;
}

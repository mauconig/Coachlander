import { Redirect, router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { WorkspaceSkeletonScreen } from '@/components/Skeleton';
import { useApp } from '@/state/AppState';

/** Sends the app to onboarding, or to the tab set for the signed-in role. */
export default function Entry() {
  const { authReady, signedIn, remoteStatus, retryRemoteData, role } = useApp();
  const redirecting = useRef(false);

  useEffect(() => {
    if (!authReady || !signedIn || remoteStatus !== 'ready' || redirecting.current) return;
    redirecting.current = true;
    router.replace(role === 'coach' ? '/alumnos' : '/hoy');
  }, [authReady, remoteStatus, role, signedIn]);

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
    return <WorkspaceSkeletonScreen />;
  }
  // Keep the skeleton visible until the destination screen has mounted.
  return <WorkspaceSkeletonScreen />;
}

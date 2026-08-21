import { useSignIn, useSignUp } from '@clerk/expo';
import { useSSO } from '@clerk/expo/experimental';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { resetEphemeralTestAccount } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Heading, OrDivider } from '@/components/Note';
import { Screen } from '@/components/Screen';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { useApp } from '@/state/AppState';
import { EPHEMERAL_TEST_EMAIL } from '@/config/runtime';
import { color, radius } from '@/theme/tokens';

type Mode = 'sign-up' | 'sign-in';

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      longMessage?: string;
      message?: string;
      errors?: { longMessage?: string; message?: string }[];
    };
    const first = candidate.errors?.[0];
    if (first?.longMessage || first?.message) return first.longMessage ?? first.message ?? '';
    if (candidate.longMessage || candidate.message) return candidate.longMessage ?? candidate.message ?? '';
  }
  return error instanceof Error ? error.message : 'No pudimos completar el acceso. Probá de nuevo.';
}

/** Auth screen kept inside the app so the user always sees Coachlander branding. */
export default function CreateAccount() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const { draft, patchDraft } = useApp();
  const [mode, setMode] = useState<Mode>(modeParam === 'sign-in' ? 'sign-in' : 'sign-up');
  const [verificationCode, setVerificationCode] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } = useSignUp();
  const { signIn, errors: signInErrors, fetchStatus: signInStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  const busy = submitting || socialBusy !== null || signUpStatus === 'fetching' || signInStatus === 'fetching';

  const finalize = async (kind: Mode, destination?: '/rol' | '/') => {
    const resource = kind === 'sign-up' ? signUp : signIn;
    const result = await resource.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setError('Tu cuenta requiere un paso adicional antes de entrar.');
          return;
        }
        router.replace(destination ?? (kind === 'sign-up' ? '/rol' : '/'));
      },
    });
    if (result.error) setError(errorMessage(result.error));
  };

  const submit = async () => {
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'sign-up') {
      const normalizedEmail = draft.email.trim().toLowerCase();
      if (!needsVerification && EPHEMERAL_TEST_EMAIL && normalizedEmail === EPHEMERAL_TEST_EMAIL) {
        await resetEphemeralTestAccount(normalizedEmail, draft.password);
        await signIn.reset();
        const testSignIn = await signIn.password({
          emailAddress: normalizedEmail,
          password: draft.password,
        });
        if (testSignIn.error) {
          setError(errorMessage(testSignIn.error));
          return;
        }
        await finalize('sign-in', '/rol');
        return;
      }

      if (needsVerification) {
        const result = await signUp.verifications.verifyEmailCode({ code: verificationCode.trim() });
        if (result.error) {
          setError(errorMessage(result.error));
          return;
        }
        // Clerk updates the resource asynchronously after the code is accepted.
        // Finalize directly instead of relying on the hook's previous status.
        await finalize('sign-up');
        return;
      }

      const result = await signUp.password({
        emailAddress: draft.email.trim(),
        password: draft.password,
        unsafeMetadata: { displayName: draft.name.trim() },
      });
      if (result.error) {
        setError(errorMessage(result.error));
        return;
      }

      if (signUp.status === 'complete' || signUp.createdSessionId) {
        await finalize('sign-up');
        return;
      }

      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) {
        setError(errorMessage(verification.error));
        return;
      }
      setNeedsVerification(true);
      return;
    }

    const result = await signIn.password({
      emailAddress: draft.email.trim(),
      password: draft.password,
    });
    if (result.error) {
      setError(errorMessage(result.error));
      return;
    }
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      setError('Este acceso requiere una verificación adicional configurada en Clerk.');
    } else if (signIn.status === 'complete' || signIn.createdSessionId) {
      await finalize('sign-in');
    } else {
      setError('Clerk could not complete sign-in. Check your details and try again.');
      }
    } catch (submitError: unknown) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const openSocialAuth = (strategy: 'oauth_google' | 'oauth_apple') => {
    setError('');
    setSocialBusy(strategy === 'oauth_google' ? 'google' : 'apple');
    void startSSOFlow({ strategy })
      .then((result) => {
        if (!result.createdSessionId) return;
        router.replace(result.signUp?.createdSessionId ? '/rol' : '/');
      })
      .catch((socialError: unknown) => setError(errorMessage(socialError)))
      .finally(() => setSocialBusy(null));
  };

  const toggleMode = () => {
    void signIn.reset();
    void signUp.reset();
    setMode((current) => (current === 'sign-up' ? 'sign-in' : 'sign-up'));
    setNeedsVerification(false);
    setVerificationCode('');
    setError('');
  };

  const canSubmit =
    draft.email.includes('@') &&
    (needsVerification
      ? verificationCode.trim().length >= 4
      : draft.password.length >= 8 && (mode === 'sign-in' || draft.name.trim().length > 1));

  const hookError =
    error ||
    signUpErrors.global?.[0]?.message ||
    signInErrors.global?.[0]?.message ||
    '';

  if (submitting || socialBusy) {
    return (
      <AppLoadingScreen
        title={
          socialBusy
            ? socialBusy === 'google'
              ? 'Conectando con Google'
              : 'Conectando con Apple'
            : needsVerification
              ? 'Verificando tu email'
              : mode === 'sign-up'
                ? 'Creando tu cuenta'
                : 'Iniciando sesión'
        }
        detail="Un segundo, estamos preparando tu espacio."
      />
    );
  }

  return (
    <Screen>
      <KeyboardAwareScrollView
        enableOnAndroid
        enableAutomaticScroll
        extraHeight={0}
        extraScrollHeight={64}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          <BackButton />

          <View style={styles.brandBlock}>
            <Image source={require('../../assets/icon.png')} style={styles.logo} />
            <Txt variant="label" tone={color.lime}>COACHLANDER</Txt>
          </View>

          <Heading
            title={needsVerification ? 'Revisá tu email' : mode === 'sign-up' ? 'Creá tu cuenta' : 'Iniciá sesión'}
            subtitle={
              needsVerification
                ? `Te mandamos un código a ${draft.email}.`
                : mode === 'sign-up'
                  ? 'Dos minutos y ya podés entrenar.'
                  : 'Volvé a tu plan y seguí donde lo dejaste.'
            }
          />

          <View nativeID="clerk-captcha" />

          <View style={styles.fields}>
            {mode === 'sign-up' && !needsVerification ? (
              <Field
                label="NOMBRE"
                value={draft.name}
                onChangeText={(name) => patchDraft({ name })}
                placeholder="Nombre y apellido"
                autoCapitalize="words"
                testID="auth-name"
              />
            ) : null}
            {!needsVerification ? (
              <>
                <Field
                  label="EMAIL"
                  value={draft.email}
                  onChangeText={(email) => patchDraft({ email })}
                  placeholder="tu@mail.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="auth-email"
                />
                <Field
                  label="CONTRASEÑA"
                  value={draft.password}
                  onChangeText={(password) => patchDraft({ password })}
                  testID="auth-password"
                  secure
                  hint="Mínimo 8 caracteres"
                />
              </>
            ) : (
              <Field
                label="CÓDIGO DE VERIFICACIÓN"
                value={verificationCode}
                onChangeText={setVerificationCode}
                placeholder="123456"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoFocus
                testID="auth-verification-code"
              />
            )}
          </View>

          {hookError ? <Txt variant="body" tone={color.textSoft}>{hookError}</Txt> : null}

          <View style={styles.actions}>
            <Button
              label={needsVerification ? 'Verificar email' : mode === 'sign-up' ? 'Crear cuenta' : 'Iniciar sesión'}
              disabled={!canSubmit || busy}
              testID="auth-submit"
              onPress={() => void submit()}
            />

            {!needsVerification ? (
              <>
                <OrDivider label="O SEGUÍ CON" />
                <View style={styles.social}>
                  <Button
                    label="Google"
                    variant="outline"
                    size="md"
                    fill
                    icon={<View style={styles.googleMark} />}
                    onPress={() => openSocialAuth('oauth_google')}
                  />
                  <Button
                    label="Apple"
                    variant="dark"
                    size="md"
                    fill
                    icon={<View style={styles.appleMark} />}
                    onPress={() => openSocialAuth('oauth_apple')}
                  />
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.switcher}>
            <Txt variant="body" tone={color.textMuted}>
              {mode === 'sign-up' ? '¿Ya tenés cuenta?' : '¿Todavía no tenés cuenta?'}
            </Txt>
            <Button
              label={mode === 'sign-up' ? 'Iniciar sesión' : 'Crear cuenta'}
              variant="ghost"
              size="sm"
              onPress={toggleMode}
            />
          </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20, paddingBottom: 24, flexGrow: 1 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 },
  logo: { width: 42, height: 42, borderRadius: 13 },
  fields: { gap: 12 },
  actions: { gap: 14, marginTop: 'auto', paddingTop: 24 },
  social: { flexDirection: 'row', gap: 10 },
  googleMark: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: color.violet },
  appleMark: { width: 14, height: 14, borderRadius: 4, backgroundColor: color.text },
  switcher: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
});

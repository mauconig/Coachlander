import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { color, radius } from '@/theme/tokens';

/** 09 · Bienvenida — the violet cover screen with the three sign-in paths. */
export default function Welcome() {
  return (
    <Screen background={color.violet} contentStyle={styles.body} padded>
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.mark} />
          <Txt variant="h5">TEMPO</Txt>
        </View>

        <Txt variant="heroXL">{'Tu rutina.\nApretá play.'}</Txt>

        <Txt variant="bodyLg" tone={color.onVioletStrong} style={styles.pitch}>
          Tu entrenador carga el plan. Vos entrenás con los tiempos y las cargas ya calculadas,
          serie por serie.
        </Txt>
      </View>

      <View style={styles.actions}>
        <Button
          label="Continuar con Apple"
          variant="dark"
          size="md"
          icon={<View style={styles.appleMark} />}
          onPress={() => router.push('/rol')}
        />
        <Button
          label="Continuar con Google"
          variant="light"
          size="md"
          icon={<View style={styles.googleMark} />}
          onPress={() => router.push('/rol')}
        />
        <Button
          label="Usar mi email"
          variant="outline"
          size="md"
          style={styles.emailButton}
          onPress={() => router.push('/crear-cuenta')}
        />

        <Pressable
          style={styles.signIn}
          onPress={() => router.push('/crear-cuenta')}
          accessibilityRole="button"
        >
          <Txt variant="body" tone="rgba(255,255,255,0.72)">
            ¿Ya tenés cuenta?
          </Txt>
          <Txt variant="bodyStrong" tone={color.lime}>
            Iniciar sesión
          </Txt>
        </Pressable>

        <Txt variant="metaSm" tone="rgba(255,255,255,0.5)" center style={styles.legal}>
          Al continuar aceptás los términos y la política de privacidad.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { justifyContent: 'space-between', paddingTop: 28, paddingHorizontal: 26 },
  top: { gap: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 26, height: 26, borderRadius: 8, backgroundColor: color.lime },
  pitch: { maxWidth: 280 },
  actions: { gap: 10, paddingBottom: 26 },
  appleMark: { width: 16, height: 16, borderRadius: 5, backgroundColor: color.text },
  googleMark: { width: 16, height: 16, borderRadius: radius.pill, backgroundColor: color.violet },
  emailButton: { borderColor: 'rgba(255,255,255,0.4)' },
  signIn: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 8 },
  legal: { paddingTop: 4, lineHeight: 17 },
});

import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { assignTemplate } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import {
  getClientLastSession,
  getClientWeekRoutines,
  getClients,
  getMetaNumber,
  getNextWeekStart,
  getCurrentWeekStart,
  getTemplates,
  hasPlanForWeek,
  weekIndexOf,
  type ClientRoutineDay,
} from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { Client } from '@/data/types';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

const FILTERS = ['HOY', 'TODOS', 'ATENCIÓN'] as const;
type Filter = (typeof FILTERS)[number];

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** "14 AGO" desde una fecha ISO completa. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`;
}

/** 07 · Mis alumnos — quién entrena ahora y quién tiene la semana programada. */
export default function Clients() {
  const [filter, setFilter] = useState<Filter>('HOY');
  const [selected, setSelected] = useState<Client | null>(null);
  const clients = useQuery(getClients);
  const clientCount = useQuery((db) => getMetaNumber(db, 'client_count'));
  const nextWeekStart = getNextWeekStart();

  const live = clients.find((c) => c.live);
  const attentionIds = useQuery((db) => {
    const ids = new Set<string>();
    for (const c of getClients(db)) {
      if (c.clerkUserId && !hasPlanForWeek(db, c.clerkUserId, nextWeekStart)) ids.add(c.id);
    }
    return [...ids];
  }, [nextWeekStart]);

  const rest = clients
    .filter((c) => !c.live)
    .filter((c) => {
      if (filter === 'HOY') return true;
      if (filter === 'ATENCIÓN') return attentionIds.includes(c.id);
      return true;
    });

  return (
    <Screen scroll gap={16}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="eyebrow">MODO ENTRENADOR</Txt>
          <Txt variant="h2">{`${clientCount} alumnos`}</Txt>
        </View>
      </View>

      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />

      {live ? (
        <Card tone="violet" padding={18} gap={12} onPress={() => setSelected(live)}>
          <Txt variant="label" tone={color.onViolet}>
            ENTRENANDO AHORA
          </Txt>
          <View style={styles.liveRow}>
            <Avatar name={live.name} size={46} tone="ink" />
            <View style={styles.liveText}>
              <Txt variant="h5">{live.name}</Txt>
              <Txt variant="meta" tone={color.onVioletStrong}>
                {live.live?.routine}
              </Txt>
            </View>
            <View style={styles.liveDot} />
          </View>
        </Card>
      ) : null}

      <View style={styles.list}>
        {rest.map((client) => (
          <ClientRow key={client.id} client={client} nextWeekStart={nextWeekStart} onPress={() => setSelected(client)} />
        ))}
      </View>

      <ClientWeekSheet client={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function ClientRow({
  client,
  nextWeekStart,
  onPress,
}: {
  client: Client;
  nextWeekStart: string;
  onPress: () => void;
}) {
  const athleteId = client.clerkUserId;
  const lastSession = useQuery((db) => (athleteId ? getClientLastSession(db, athleteId) : null), [athleteId]);
  const needsAttention = useQuery(
    (db) => (athleteId ? !hasPlanForWeek(db, athleteId, nextWeekStart) : false),
    [athleteId, nextWeekStart],
  );

  return (
    <Row
      left={<Avatar name={client.name} size={44} />}
      title={client.name}
      meta={lastSession ? `Última sesión: ${shortDate(lastSession)}` : 'Alumno/a nuevo/a'}
      metaTone={needsAttention ? color.textSoft : color.textMuted}
      active={needsAttention}
      right={needsAttention ? <AttentionPill /> : undefined}
      onPress={onPress}
    />
  );
}

function AttentionPill() {
  return (
    <View style={styles.alertPill}>
      <Icon name="info" size={12} tone={color.ink} weight={2.6} />
      <Txt variant="labelTight" tone={color.ink}>
        ATENCIÓN
      </Txt>
    </View>
  );
}

function ClientWeekSheet({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const athleteId = client?.clerkUserId ?? client?.id ?? '';
  const [tab, setTab] = useState<'this' | 'next'>('this');
  const [addOpen, setAddOpen] = useState(false);
  const currentWeek = getCurrentWeekStart();
  const nextWeek = getNextWeekStart();
  const weekStart = tab === 'this' ? currentWeek : nextWeek;

  const days = useQuery(
    (db) => (client ? getClientWeekRoutines(db, athleteId, weekStart) : []),
    [athleteId, weekStart],
  );

  return (
    <Sheet visible={!!client} onClose={onClose} eyebrow="ALUMNO" title={client?.name ?? ''}>
      {client ? (
        <>
          <ClientWeekHeader client={client} tab={tab} onTab={setTab} />

          {days.length === 0 ? (
            <Card tone="muted" padding={18} gap={12} style={styles.empty}>
              <Txt variant="body" tone={color.textMuted} center>
                {tab === 'this'
                  ? 'No hay nada programado para esta semana.'
                  : 'No hay nada programado para la semana que viene.'}
              </Txt>
              <Pressable
                style={styles.assignButton}
                onPress={() => setAddOpen(true)}
                accessibilityRole="button"
              >
                <Icon name="plus" size={15} tone={color.ink} weight={2.6} />
                <Txt variant="labelTight" tone={color.ink}>
                  AGREGAR
                </Txt>
              </Pressable>
            </Card>
          ) : (
            <View style={styles.days}>
              {days.map((day) => (
                <DayRow key={day.id} day={day} />
              ))}
            </View>
          )}
        </>
      ) : null}

      {client ? (
        <AddRoutineSheet
          client={client}
          weekStart={weekStart}
          visible={addOpen}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </Sheet>
  );
}

function AddRoutineSheet({
  client,
  weekStart,
  visible,
  onClose,
}: {
  client: Client;
  weekStart: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const templates = useQuery(getTemplates);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const assignExisting = async (templateId: string) => {
    if (assigningId) return;
    setAssigningId(templateId);
    try {
      await assignTemplate(getToken, templateId, {
        clientIds: [client.id],
        autoOverload: true,
        week: weekIndexOf(weekStart),
        weekStart,
        replace: true,
      });
      await refreshRemoteData();
      onClose();
    } catch (error: unknown) {
      console.warn('[Coachlander] No se pudo asignar la plantilla', error);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="AGREGAR RUTINA" title="¿Qué querés hacer?">
      <Pressable
        style={styles.addOption}
        onPress={() => router.push(`/crear/nuevo?clientId=${client.id}&weekStart=${weekStart}`)}
        accessibilityRole="button"
      >
        <View style={styles.addOptionMark}>
          <Icon name="plus" size={18} tone={color.ink} weight={2.4} />
        </View>
        <View style={styles.addOptionText}>
          <Txt variant="rowTitle">Nueva rutina</Txt>
          <Txt variant="meta">Armala desde cero y asignala</Txt>
        </View>
        <Icon name="chevron-right" size={16} tone={color.textMuted} />
      </Pressable>

      <Txt variant="label" tone={color.textMuted} style={styles.templateLabel}>
        PLANTILLAS EXISTENTES
      </Txt>
      {templates.length === 0 ? (
        <Txt variant="meta" tone={color.textFaint}>
          Todavía no guardaste plantillas.
        </Txt>
      ) : (
        <View style={styles.templateList}>
          {templates.map((template) => (
            <Row
              key={template.id}
              title={template.name}
              meta={template.meta}
              right={
                <View style={[styles.templatePick, assigningId === template.id && styles.templatePickActive]}>
                  <Txt variant="labelTight" tone={assigningId === template.id ? color.ink : color.text}>
                    {assigningId === template.id ? 'ASIGNANDO' : 'ASIGNAR'}
                  </Txt>
                </View>
              }
              onPress={() => assignExisting(template.id)}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

function ClientWeekHeader({
  client,
  tab,
  onTab,
}: {
  client: Client;
  tab: 'this' | 'next';
  onTab: (tab: 'this' | 'next') => void;
}) {
  const athleteId = client.clerkUserId ?? client.id;
  const lastSession = useQuery((db) => (athleteId ? getClientLastSession(db, athleteId) : null), [athleteId]);

  return (
    <View style={styles.weekHeader}>
      <Avatar name={client.name} size={38} tone="violet" />
      <View style={styles.weekText}>
        <Txt variant="label" tone={color.textMuted}>
          {lastSession ? `Última sesión: ${shortDate(lastSession)}` : 'Alumno/a nuevo/a'}
        </Txt>
        <View style={styles.weekChips}>
          <Chip label="ESTA SEMANA" selected={tab === 'this'} onPress={() => onTab('this')} mono={false} />
          <Chip label="SIGUIENTE SEMANA" selected={tab === 'next'} onPress={() => onTab('next')} mono={false} />
        </View>
      </View>
    </View>
  );
}

function DayRow({ day }: { day: ClientRoutineDay }) {
  const badge = day.completed ? color.lime : color.violet;
  const shortName = day.name.replace(/^.*·\s*/, '');
  return (
    <Row
      left={
        <View style={[styles.dayBadge, { backgroundColor: day.completed ? color.lime : color.surface }]}>
          <Txt variant="labelTight" tone={day.completed ? color.ink : color.text}>
            {WEEKDAY_INITIALS[day.day % 7]}
          </Txt>
        </View>
      }
      title={shortName}
      titleTone={day.completed ? color.textMuted : color.text}
      meta={`${day.exerciseCount} ejercicios · ${day.totalSets} series · ${day.estimatedMinutes} min`}
      trailing={day.completed ? 'HECHO' : `DÍA ${day.day}`}
      trailingTone={badge}
      onPress={() => router.push(`/rutina/${day.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerText: { gap: 3 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  liveText: { flex: 1, gap: 2 },
  liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.lime },
  list: { gap: 9 },
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: color.lime,
  },
  empty: { alignItems: 'center' },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  addOptionMark: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOptionText: { flex: 1, gap: 2 },
  templateLabel: { paddingTop: 6 },
  templateList: { gap: 8 },
  templatePick: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  templatePickActive: { backgroundColor: color.lime, borderColor: color.lime },
  days: { gap: 9 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weekText: { flex: 1, gap: 8 },
  weekChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  dayBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
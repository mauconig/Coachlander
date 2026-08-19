import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import {
  getCatalogExercises,
  getCatalogMuscles,
  type CatalogExerciseSummary,
  type CatalogMuscle,
} from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Txt } from '@/components/Txt';
import { color } from '@/theme/tokens';

const PAGE_SIZE = 24;

type MuscleListProps = {
  onSelect: (muscle: CatalogMuscle) => void;
  compact?: boolean;
};

export function ExerciseCatalogMuscleList({ onSelect, compact = false }: MuscleListProps) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [items, setItems] = useState<CatalogMuscle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCatalogMuscles(getTokenRef.current);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar los músculos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CatalogLoading label="Cargando músculos" />;
  if (error) {
    return (
      <CatalogState>
        <Txt variant="body" tone={color.textMuted} center>{error}</Txt>
        <Button label="Reintentar" variant="outline" size="sm" onPress={() => void load()} />
      </CatalogState>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.key}
      style={[styles.muscleList, compact && styles.muscleListCompact]}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <Row
          title={item.label}
          meta={`${item.count} ejercicios disponibles`}
          right={<Icon name="chevron-right" size={17} tone={color.textMuted} />}
          onPress={() => onSelect(item)}
        />
      )}
      ListEmptyComponent={<CatalogState><Txt variant="body" tone={color.textMuted} center>No hay músculos disponibles.</Txt></CatalogState>}
    />
  );
}

type ExerciseListProps = {
  muscle: CatalogMuscle;
  onBack: () => void;
  onAdd: (exercise: CatalogExerciseSummary) => void;
  onCreate?: (name: string) => void;
  compact?: boolean;
};

export function ExerciseCatalogExerciseList({ muscle, onBack, onAdd, onCreate, compact = false }: ExerciseListProps) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [items, setItems] = useState<CatalogExerciseSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const requestVersion = useRef(0);

  getTokenRef.current = getToken;

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const version = requestVersion.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const result = await getCatalogExercises(getTokenRef.current, {
          muscle: muscle.key,
          search: submittedSearch,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (version !== requestVersion.current) return;
        setItems((current) => {
          if (!append) return result.items;
          const known = new Set(current.map((item) => item.id));
          return [...current, ...result.items.filter((item) => !known.has(item.id))];
        });
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (cause) {
        if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'No pudimos cargar los ejercicios');
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [muscle.key, submittedSearch],
  );

  useEffect(() => {
    requestVersion.current += 1;
    setItems([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    void loadPage(1, false);
  }, [loadPage]);

  const submitSearch = () => {
    setSubmittedSearch(searchInput.trim());
  };

  const addManual = () => {
    const name = manualName.trim();
    if (!name) return;
    onCreate?.(name);
    setManualName('');
  };

  return (
    <View style={[styles.browser, compact && styles.browserCompact]}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Field
            label="BUSCAR EN ESTE MÚSCULO"
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Ej: press, sentadilla, remo"
            autoCapitalize="none"
          />
        </View>
        <Button label="Buscar" variant="outline" size="sm" onPress={submitSearch} style={styles.searchButton} />
      </View>

      <View style={styles.selectedMuscle}>
        <View style={styles.selectedCopy}>
          <Txt variant="label" tone={color.lime}>MÚSCULO</Txt>
          <Txt variant="h4">{muscle.label}</Txt>
          <Txt variant="meta" tone={color.textMuted}>{submittedSearch ? `Resultados para “${submittedSearch}”` : `${total} ejercicios disponibles`}</Txt>
        </View>
        <Button label="Cambiar" variant="ghost" size="sm" onPress={onBack} />
      </View>

      {loading ? (
        <CatalogLoading label="Cargando ejercicios" />
      ) : error ? (
        <CatalogState>
          <Txt variant="body" tone={color.textMuted} center>{error}</Txt>
          <Button label="Reintentar" variant="outline" size="sm" onPress={() => void loadPage(1, false)} />
        </CatalogState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={styles.exerciseList}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <Row
              title={item.name}
              titleNumberOfLines={2}
              meta={`${item.focus}${item.equipment ? ` · ${item.equipment}` : ''}`}
              left={<Icon name="plus" size={15} tone={color.lime} weight={2.6} />}
              right={<Icon name="plus" size={17} tone={color.lime} weight={2.4} />}
              onPress={() => onAdd(item)}
            />
          )}
          ListEmptyComponent={<CatalogState><Txt variant="body" tone={color.textMuted} center>No encontramos ejercicios en este músculo.</Txt></CatalogState>}
          ListFooterComponent={
            <View style={styles.footer}>
              {hasMore ? <Button label={loadingMore ? 'Cargando…' : 'Cargar más'} variant="outline" size="sm" disabled={loadingMore} onPress={() => void loadPage(page + 1, true)} /> : null}
              {onCreate ? (
                <Card tone="muted" padding={14} gap={10}>
                  <Txt variant="label">CREAR EJERCICIO NUEVO</Txt>
                  <Field label="NOMBRE" value={manualName} onChangeText={setManualName} placeholder="Ej: Press inclinado con mancuernas" />
                  <Button label="Agregar ejercicio nuevo" variant="violet" size="sm" disabled={!manualName.trim()} onPress={addManual} />
                </Card>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

export function CatalogLoading({ label }: { label: string }) {
  return <CatalogState><ActivityIndicator color={color.lime} /><Txt variant="meta" tone={color.textMuted}>{label}…</Txt></CatalogState>;
}

function CatalogState({ children }: { children: ReactNode }) {
  return <View style={styles.state}>{children}</View>;
}

const styles = StyleSheet.create({
  browser: { flex: 1, gap: 12 },
  browserCompact: { minHeight: 420, maxHeight: 610 },
  muscleList: { flex: 1 },
  muscleListCompact: { maxHeight: 520 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  searchField: { flex: 1 },
  searchButton: { minWidth: 92, marginBottom: 1 },
  selectedMuscle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  selectedCopy: { flex: 1, gap: 3 },
  exerciseList: { flex: 1 },
  listContent: { gap: 9, paddingBottom: 20 },
  footer: { gap: 12, paddingTop: 4 },
  state: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18 },
});

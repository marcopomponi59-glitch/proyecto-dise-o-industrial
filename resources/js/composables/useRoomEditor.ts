import { findCatalogEntry } from '@/lib/room/catalog';
import { findFreeSpot, findIssues, fitToRoom, moveItem, normalizeRotation } from '@/lib/room/geometry';
import { addStarterItems, createItem, createRoom, exportRoom, loadState, normalizeRoom, saveState, uid, type NewRoomData } from '@/lib/room/storage';
import type { Point, Room, RoomItem } from '@/lib/room/types';
import { computed, ref, watch } from 'vue';

export type ViewMode = '2d' | '3d' | 'split';

const HISTORY_LIMIT = 100;
/** Cambios seguidos sobre el mismo campo dentro de este lapso se deshacen juntos. */
const COALESCE_MS = 1000;
const VIEW_KEY = 'diseno-habitaciones.vista';

const browserStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
const initial = loadState(browserStorage);

const rooms = ref<Room[]>(initial.rooms);
const activeId = ref<string | null>(initial.activeId);
const selectedId = ref<string | null>(null);
const saveFailed = ref(false);
const snapStep = ref(5);
const viewMode = ref<ViewMode>(readViewMode());

const past = ref<string[]>([]);
const future = ref<string[]>([]);
let lastTag: string | null = null;
let lastTime = 0;

const room = computed(() => rooms.value.find((r) => r.id === activeId.value) ?? null);
const selectedItem = computed(() => room.value?.items.find((i) => i.id === selectedId.value) ?? null);
const issues = computed(() => (room.value ? findIssues(room.value) : new Map<string, string[]>()));

function readViewMode(): ViewMode {
    try {
        const saved = browserStorage?.getItem(VIEW_KEY);
        return saved === '2d' || saved === '3d' || saved === 'split' ? saved : 'split';
    } catch {
        return 'split';
    }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
watch(
    [rooms, activeId],
    () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveFailed.value = !saveState(browserStorage, { rooms: rooms.value, activeId: activeId.value });
        }, 300);
    },
    { deep: true },
);

watch(viewMode, (mode) => {
    try {
        browserStorage?.setItem(VIEW_KEY, mode);
    } catch {
        // Si no se puede recordar la vista, no pasa nada.
    }
});

function resetHistory() {
    past.value = [];
    future.value = [];
    lastTag = null;
}

/**
 * Guarda el estado actual para poder deshacer. Se llama antes de cada cambio;
 * con `tag`, los cambios repetidos sobre lo mismo (tipear un número, arrastrar un color) se agrupan.
 */
function checkpoint(tag?: string) {
    if (!room.value) {
        return;
    }
    const now = Date.now();
    if (tag && tag === lastTag && now - lastTime < COALESCE_MS) {
        lastTime = now;
        return;
    }
    lastTag = tag ?? null;
    lastTime = now;
    past.value = [...past.value.slice(-(HISTORY_LIMIT - 1)), JSON.stringify(room.value)];
    future.value = [];
    room.value.updatedAt = new Date().toISOString();
}

function replaceActiveRoom(snapshot: string) {
    const index = rooms.value.findIndex((r) => r.id === activeId.value);
    if (index === -1) {
        return;
    }
    const restored = JSON.parse(snapshot) as Room;
    rooms.value.splice(index, 1, restored);
    if (!restored.items.some((i) => i.id === selectedId.value)) {
        selectedId.value = null;
    }
}

function undo() {
    const previous = past.value.at(-1);
    if (!room.value || previous === undefined) {
        return;
    }
    future.value = [...future.value, JSON.stringify(room.value)];
    past.value = past.value.slice(0, -1);
    lastTag = null;
    replaceActiveRoom(previous);
}

function redo() {
    const next = future.value.at(-1);
    if (!room.value || next === undefined) {
        return;
    }
    past.value = [...past.value, JSON.stringify(room.value)];
    future.value = future.value.slice(0, -1);
    lastTag = null;
    replaceActiveRoom(next);
}

function findItem(id: string): RoomItem | undefined {
    return room.value?.items.find((i) => i.id === id);
}

function replaceItem(updated: RoomItem) {
    if (!room.value) {
        return;
    }
    const index = room.value.items.findIndex((i) => i.id === updated.id);
    if (index !== -1) {
        room.value.items.splice(index, 1, updated);
    }
}

// --- Habitaciones ---

function createNewRoom(data: NewRoomData) {
    const empty = createRoom(data);
    const created = data.starter ? addStarterItems(empty) : empty;
    rooms.value.push(created);
    selectRoom(created.id);
}

function selectRoom(id: string) {
    activeId.value = id;
    selectedId.value = null;
    resetHistory();
}

function updateRoom(patch: Partial<Pick<Room, 'name' | 'width' | 'length' | 'height' | 'wallColor' | 'floorColor'>>) {
    const current = room.value;
    if (!current) {
        return;
    }
    checkpoint(`room:${Object.keys(patch).join(',')}`);
    Object.assign(current, patch);
    if ('width' in patch || 'length' in patch || 'height' in patch) {
        current.items = current.items.map((item) => fitToRoom(item, current));
    }
}

function deleteRoom(id: string) {
    rooms.value = rooms.value.filter((r) => r.id !== id);
    if (activeId.value === id) {
        activeId.value = rooms.value[0]?.id ?? null;
        selectedId.value = null;
        resetHistory();
    }
}

function importRoom(raw: Room) {
    const imported = normalizeRoom(raw);
    if (rooms.value.some((r) => r.id === imported.id)) {
        imported.id = uid();
    }
    rooms.value.push(imported);
    selectRoom(imported.id);
}

function downloadActiveRoom() {
    if (!room.value) {
        return;
    }
    const blob = new Blob([exportRoom(room.value)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${room.value.name.replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase() || 'habitacion'}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

// --- Objetos ---

function addItem(type: string) {
    const entry = findCatalogEntry(type);
    if (!room.value || !entry) {
        return;
    }
    checkpoint();
    const item = findFreeSpot(createItem(entry, room.value), room.value);
    room.value.items.push(item);
    selectedId.value = item.id;
}

function updateItem(id: string, patch: Partial<Omit<RoomItem, 'id'>>) {
    const item = findItem(id);
    if (!room.value || !item) {
        return;
    }
    checkpoint(`item:${id}:${Object.keys(patch).join(',')}`);
    let updated: RoomItem = { ...item, ...patch };
    if (patch.rotation !== undefined) {
        updated.rotation = normalizeRotation(patch.rotation);
    }
    updated = fitToRoom(updated, room.value);
    replaceItem(updated);
}

/** Para arrastrar: llamar a `beginMove` al empezar y `moveItemTo` en cada movimiento. */
function beginMove() {
    checkpoint();
}

function moveItemTo(id: string, point: Point) {
    const item = findItem(id);
    if (!room.value || !item) {
        return;
    }
    const step = snapStep.value;
    const snapped = step > 0 ? { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step } : point;
    replaceItem(moveItem(item, room.value, snapped));
}

/** Rotación mientras se arrastra el tirador; el punto para deshacer lo marca `beginMove`. */
function rotateItemTo(id: string, degrees: number) {
    const item = findItem(id);
    if (!item || item.mount === 'wall') {
        return;
    }
    replaceItem({ ...item, rotation: normalizeRotation(degrees) });
}

/** Altura desde el piso mientras se arrastra con Shift en 3D; el punto para deshacer lo marca `beginMove`. */
function setElevationLive(id: string, elevation: number) {
    const item = findItem(id);
    if (!item || item.mount === 'ceiling') {
        return;
    }
    const step = snapStep.value;
    const value = Math.max(0, step > 0 ? Math.round(elevation / step) * step : elevation);
    replaceItem({ ...item, elevation: value });
}

function nudgeItem(id: string, dx: number, dy: number) {
    const item = findItem(id);
    if (!room.value || !item) {
        return;
    }
    checkpoint(`nudge:${id}`);
    replaceItem(moveItem(item, room.value, { x: item.x + dx, y: item.y + dy }));
}

function rotateItem(id: string, delta: number) {
    const item = findItem(id);
    if (!item || item.mount === 'wall') {
        return;
    }
    updateItem(id, { rotation: item.rotation + delta });
}

function duplicateItem(id: string) {
    const item = findItem(id);
    if (!room.value || !item) {
        return;
    }
    checkpoint();
    const copy = findFreeSpot(moveItem({ ...item, id: uid() }, room.value, { x: item.x + 20, y: item.y + 20 }), room.value);
    room.value.items.push(copy);
    selectedId.value = copy.id;
}

function removeItem(id: string) {
    if (!room.value || !findItem(id)) {
        return;
    }
    checkpoint();
    room.value.items = room.value.items.filter((i) => i.id !== id);
    if (selectedId.value === id) {
        selectedId.value = null;
    }
}

function selectItem(id: string | null) {
    selectedId.value = id;
}

export function useRoomEditor() {
    return {
        rooms,
        room,
        activeId,
        selectedId,
        selectedItem,
        issues,
        saveFailed,
        snapStep,
        viewMode,
        canUndo: computed(() => past.value.length > 0),
        canRedo: computed(() => future.value.length > 0),
        undo,
        redo,
        createNewRoom,
        selectRoom,
        updateRoom,
        deleteRoom,
        importRoom,
        downloadActiveRoom,
        addItem,
        updateItem,
        beginMove,
        moveItemTo,
        rotateItemTo,
        setElevationLive,
        nudgeItem,
        rotateItem,
        duplicateItem,
        removeItem,
        selectItem,
    };
}

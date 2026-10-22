import type { CatalogEntry } from './catalog';
import { CATALOG, findCatalogEntry } from './catalog';
import { clampToRoom, fitToRoom, placeOnWall } from './geometry';
import type { Mount, Room, RoomItem, Shape, Wall } from './types';

export const STORAGE_KEY = 'diseno-habitaciones.v1';
export const FILE_FORMAT = 'diseno-habitacion';
const FILE_VERSION = 1;

const SHAPES: Shape[] = ['box', 'bed', 'sofa', 'table', 'chair', 'shelf', 'wardrobe', 'tv', 'frame', 'plant', 'lamp', 'rug', 'window', 'door'];
const MOUNTS: Mount[] = ['floor', 'wall', 'ceiling', 'rug'];
const WALLS: Wall[] = ['top', 'right', 'bottom', 'left'];

export interface SavedState {
    rooms: Room[];
    activeId: string | null;
}

export function uid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NewRoomData {
    name: string;
    width: number;
    length: number;
    height: number;
    /** Arrancar con ventanas y lámpara de techo (se pueden mover o quitar como cualquier objeto). */
    starter?: boolean;
}

export function createRoom(data: NewRoomData): Room {
    return {
        id: uid(),
        name: data.name.trim() || 'Mi habitación',
        width: data.width,
        length: data.length,
        height: data.height,
        wallColor: '#f5f1ea',
        floorColor: '#c8a27a',
        items: [],
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Lo que trae una habitación nueva: una ventana centrada en la pared superior, otra en la pared
 * derecha si mide 3 m o más, y una lámpara de techo en el centro.
 */
export function addStarterItems(room: Room): Room {
    const entry = (type: string) => CATALOG.find((e) => e.type === type)!;
    const items = [createItem(entry('ventana'), room)];
    if (room.length >= 300) {
        items.push(placeOnWall(createItem(entry('ventana'), room), room, 'right', room.length / 2));
    }
    items.push(createItem(entry('lampara-techo'), room));
    return { ...room, items: [...room.items, ...items] };
}

/**
 * Objeto nuevo a partir del catálogo: lo de pared va al centro de la pared superior, lo de techo
 * cuelga del techo en el centro y lo demás va al centro de la habitación.
 */
export function createItem(entry: CatalogEntry, room: Room): RoomItem {
    const item: RoomItem = {
        id: uid(),
        type: entry.type,
        name: entry.name,
        shape: entry.shape,
        mount: entry.mount,
        x: room.width / 2,
        y: room.length / 2,
        width: entry.width,
        depth: entry.depth,
        height: entry.height,
        rotation: 0,
        elevation: entry.elevation,
        color: entry.color,
    };
    if (entry.light) {
        item.lightOn = true;
    }

    return entry.mount === 'wall' ? placeOnWall(item, room, 'top', room.width / 2) : fitToRoom(clampToRoom(item, room), room);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function number(value: unknown, fallback: number, min = 0): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

function text(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function color(value: unknown, fallback: string): string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: T[], fallback: T): T {
    return options.includes(value as T) ? (value as T) : fallback;
}

function normalizeItem(raw: unknown, room: Room): RoomItem | null {
    if (!isRecord(raw)) {
        return null;
    }

    const entry = findCatalogEntry(String(raw.type));
    const mount = oneOf(raw.mount, MOUNTS, entry?.mount ?? 'floor');
    const item: RoomItem = {
        id: text(raw.id, uid()),
        type: text(raw.type, 'caja'),
        name: text(raw.name, entry?.name ?? 'Objeto'),
        shape: oneOf(raw.shape, SHAPES, entry?.shape ?? 'box'),
        mount,
        x: number(raw.x, room.width / 2, -Infinity),
        y: number(raw.y, room.length / 2, -Infinity),
        width: number(raw.width, entry?.width ?? 50, 1),
        depth: number(raw.depth, entry?.depth ?? 50, 1),
        height: number(raw.height, entry?.height ?? 50, 1),
        rotation: number(raw.rotation, 0, -Infinity),
        elevation: number(raw.elevation, entry?.elevation ?? 0),
        color: color(raw.color, entry?.color ?? '#90a4ae'),
    };

    if (mount === 'wall') {
        item.wall = oneOf(raw.wall, WALLS, 'top');
    }
    if (typeof raw.lightOn === 'boolean') {
        item.lightOn = raw.lightOn;
    } else if (entry?.light) {
        item.lightOn = true;
    }

    return item;
}

/** Valida y completa una habitación que viene de afuera (localStorage o archivo importado). */
export function normalizeRoom(raw: unknown): Room {
    if (!isRecord(raw)) {
        throw new Error('El archivo no tiene una habitación válida.');
    }

    const room: Room = {
        id: text(raw.id, uid()),
        name: text(raw.name, 'Habitación importada'),
        width: number(raw.width, 0, 1),
        length: number(raw.length, 0, 1),
        height: number(raw.height, 0, 1),
        wallColor: color(raw.wallColor, '#f5f1ea'),
        floorColor: color(raw.floorColor, '#c8a27a'),
        items: [],
        updatedAt: text(raw.updatedAt, new Date().toISOString()),
    };

    if (!room.width || !room.length || !room.height) {
        throw new Error('La habitación no tiene ancho, largo y alto válidos.');
    }

    const items = Array.isArray(raw.items) ? raw.items : [];
    room.items = items.map((item) => normalizeItem(item, room)).filter((item): item is RoomItem => item !== null);

    return room;
}

export function exportRoom(room: Room): string {
    return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, room }, null, 2);
}

export function parseRoomFile(content: string): Room {
    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch {
        throw new Error('El archivo no es un JSON válido.');
    }

    if (!isRecord(data) || data.format !== FILE_FORMAT) {
        throw new Error('El archivo no es un diseño de habitación exportado desde esta aplicación.');
    }

    return normalizeRoom(data.room);
}

export function loadState(storage: Storage | undefined): SavedState {
    const empty: SavedState = { rooms: [], activeId: null };

    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) {
            return empty;
        }
        const data: unknown = JSON.parse(raw);
        if (!isRecord(data) || !Array.isArray(data.rooms)) {
            return empty;
        }

        const rooms: Room[] = [];
        for (const candidate of data.rooms) {
            try {
                rooms.push(normalizeRoom(candidate));
            } catch {
                // Una habitación dañada no impide abrir las demás.
            }
        }
        const activeId = typeof data.activeId === 'string' && rooms.some((r) => r.id === data.activeId) ? data.activeId : (rooms[0]?.id ?? null);

        return { rooms, activeId };
    } catch {
        return empty;
    }
}

/** Devuelve false si el navegador no dejó guardar (modo privado, cuota llena). */
export function saveState(storage: Storage | undefined, state: SavedState): boolean {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(state));
        return storage !== undefined;
    } catch {
        return false;
    }
}

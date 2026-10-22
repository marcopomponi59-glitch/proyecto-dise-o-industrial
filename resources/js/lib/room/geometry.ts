import { isOpening } from './catalog';
import type { Point, Room, RoomItem, Wall } from './types';

/** Tolerancia en cm: dos objetos que apenas se tocan no cuentan como choque. */
const EPSILON = 0.5;

/** Espesor de las paredes en cm; ventanas y puertas van centradas dentro de este espesor. */
export const WALL_THICKNESS = 10;

export const WALL_ROTATION: Record<Wall, number> = { top: 0, right: 90, bottom: 180, left: 270 };

export const WALL_LABEL: Record<Wall, string> = {
    top: 'Pared superior',
    right: 'Pared derecha',
    bottom: 'Pared inferior',
    left: 'Pared izquierda',
};

export function normalizeRotation(degrees: number): number {
    const value = degrees % 360;
    return value < 0 ? value + 360 : value;
}

export function snap(value: number, step: number): number {
    return step > 0 ? Math.round(value / step) * step : value;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Esquinas del objeto en el plano, en sentido horario. */
export function corners(item: Pick<RoomItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>): Point[] {
    const rad = (item.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = item.width / 2;
    const hd = item.depth / 2;

    return [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
    ].map(([lx, ly]) => ({
        x: item.x + lx * cos - ly * sin,
        y: item.y + lx * sin + ly * cos,
    }));
}

/** Mitad del ancho y del largo de la caja alineada a los ejes que contiene al objeto rotado. */
export function halfExtents(item: Pick<RoomItem, 'width' | 'depth' | 'rotation'>): { hx: number; hy: number } {
    const rad = (item.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    return {
        hx: (item.width / 2) * cos + (item.depth / 2) * sin,
        hy: (item.width / 2) * sin + (item.depth / 2) * cos,
    };
}

export function nearestWall(room: Pick<Room, 'width' | 'length'>, point: Point): Wall {
    const distances: [Wall, number][] = [
        ['top', point.y],
        ['bottom', room.length - point.y],
        ['left', point.x],
        ['right', room.width - point.x],
    ];

    return distances.reduce((best, current) => (current[1] < best[1] ? current : best))[0];
}

/**
 * Pega un objeto a una pared: la espalda toca la pared, el frente mira hacia adentro
 * y `along` es la posición a lo largo de la pared (x para superior/inferior, y para los costados).
 * Ventanas y puertas quedan centradas dentro del espesor de la pared.
 */
export function placeOnWall<T extends RoomItem>(item: T, room: Pick<Room, 'width' | 'length'>, wall: Wall, along: number): T {
    const horizontal = wall === 'top' || wall === 'bottom';
    const span = horizontal ? room.width : room.length;
    const position = item.width >= span ? span / 2 : clamp(along, item.width / 2, span - item.width / 2);
    const offset = isOpening(item) ? -WALL_THICKNESS / 2 : item.depth / 2;

    const centers: Record<Wall, Point> = {
        top: { x: position, y: offset },
        bottom: { x: position, y: room.length - offset },
        left: { x: offset, y: position },
        right: { x: room.width - offset, y: position },
    };

    return { ...item, wall, rotation: WALL_ROTATION[wall], ...centers[wall] };
}

/** Lleva un objeto de piso a la posición más cercana en la que entra completo en la habitación. */
export function clampToRoom<T extends RoomItem>(item: T, room: Pick<Room, 'width' | 'length'>): T {
    const { hx, hy } = halfExtents(item);
    const x = 2 * hx >= room.width ? room.width / 2 : clamp(item.x, hx, room.width - hx);
    const y = 2 * hy >= room.length ? room.length / 2 : clamp(item.y, hy, room.length - hy);

    return { ...item, x, y };
}

/** Mueve un objeto a un punto del plano: lo de pared se pega a la pared más cercana, lo demás queda dentro de la habitación. */
export function moveItem<T extends RoomItem>(item: T, room: Pick<Room, 'width' | 'length'>, point: Point): T {
    if (item.mount === 'wall') {
        const wall = nearestWall(room, point);
        const along = wall === 'top' || wall === 'bottom' ? point.x : point.y;
        return placeOnWall(item, room, wall, along);
    }

    return clampToRoom({ ...item, x: point.x, y: point.y }, room);
}

/**
 * Ajusta un objeto a la habitación después de cambiar sus medidas o las de la habitación:
 * lo de pared vuelve a su pared y lo de techo queda colgando del techo.
 */
export function fitToRoom<T extends RoomItem>(item: T, room: Pick<Room, 'width' | 'length' | 'height'>): T {
    if (item.mount === 'ceiling') {
        return { ...item, elevation: Math.max(0, room.height - item.height) };
    }
    return reattachToWall(item, room);
}

/** Vuelve a ubicar un objeto de pared después de cambiar sus medidas o las de la habitación. */
export function reattachToWall<T extends RoomItem>(item: T, room: Pick<Room, 'width' | 'length'>): T {
    if (item.mount !== 'wall') {
        return item;
    }

    const wall = item.wall ?? nearestWall(room, item);
    const along = wall === 'top' || wall === 'bottom' ? item.x : item.y;
    return placeOnWall(item, room, wall, along);
}

function project(points: Point[], axis: Point): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
        const value = p.x * axis.x + p.y * axis.y;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    return [min, max];
}

/** Choque en planta entre dos rectángulos rotados (teorema del eje separador). */
export function footprintsOverlap(a: RoomItem, b: RoomItem): boolean {
    const pa = corners(a);
    const pb = corners(b);

    for (const polygon of [pa, pb]) {
        for (let i = 0; i < polygon.length; i++) {
            const p1 = polygon[i];
            const p2 = polygon[(i + 1) % polygon.length];
            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (length === 0) {
                continue;
            }
            const axis = { x: -(p2.y - p1.y) / length, y: (p2.x - p1.x) / length };
            const [minA, maxA] = project(pa, axis);
            const [minB, maxB] = project(pb, axis);
            if (maxA - minB <= EPSILON || maxB - minA <= EPSILON) {
                return false;
            }
        }
    }

    return true;
}

export function heightsOverlap(a: RoomItem, b: RoomItem): boolean {
    return a.elevation < b.elevation + b.height - EPSILON && b.elevation < a.elevation + a.height - EPSILON;
}

/** Tramo que ocupa un objeto de pared a lo largo de su pared. */
function wallSpan(item: RoomItem): [number, number] {
    const center = item.wall === 'top' || item.wall === 'bottom' ? item.x : item.y;
    return [center - item.width / 2, center + item.width / 2];
}

/**
 * Dos objetos chocan si se pisan en planta y en altura. Las alfombras no chocan con nada;
 * ventanas y puertas sólo chocan con lo que está colgado en su misma pared (un cuadro sobre la ventana).
 */
export function itemsCollide(a: RoomItem, b: RoomItem): boolean {
    if (a.mount === 'rug' || b.mount === 'rug') {
        return false;
    }
    if (a.mount === 'wall' && b.mount === 'wall' && a.wall === b.wall && (isOpening(a) || isOpening(b))) {
        const [a1, a2] = wallSpan(a);
        const [b1, b2] = wallSpan(b);
        return heightsOverlap(a, b) && a1 < b2 - EPSILON && b1 < a2 - EPSILON;
    }
    if (isOpening(a) || isOpening(b)) {
        return false;
    }
    return heightsOverlap(a, b) && footprintsOverlap(a, b);
}

/** Lugar que barre la hoja de una puerta al abrirse hacia adentro (un cuadrado del ancho de la puerta). */
export function doorSwing(door: RoomItem): RoomItem {
    const rad = (door.rotation * Math.PI) / 180;
    const distance = WALL_THICKNESS / 2 + door.width / 2;
    return {
        ...door,
        id: `${door.id}:paso`,
        mount: 'floor',
        shape: 'box',
        x: door.x - Math.sin(rad) * distance,
        y: door.y + Math.cos(rad) * distance,
        depth: door.width,
        elevation: 0,
    };
}

export function isOutsideRoom(item: RoomItem, room: Pick<Room, 'width' | 'length'>): boolean {
    if (isOpening(item)) {
        return false;
    }
    return corners(item).some((p) => p.x < -EPSILON || p.y < -EPSILON || p.x > room.width + EPSILON || p.y > room.length + EPSILON);
}

/**
 * Busca el lugar libre más cercano a la posición actual del objeto, recorriendo anillos
 * cada vez más grandes. Si no encuentra ninguno, lo deja donde está.
 */
export function findFreeSpot<T extends RoomItem>(item: T, room: Room, step = 10): T {
    const fits = (candidate: T) =>
        !isOutsideRoom(candidate, room) && !room.items.some((other) => other.id !== candidate.id && itemsCollide(candidate, other));

    if (fits(item)) {
        return item;
    }

    const maxRadius = Math.max(room.width, room.length);
    for (let radius = step; radius <= maxRadius; radius += step) {
        // Dentro de cada anillo, primero los puntos del medio de cada lado (los más cercanos).
        for (let i = 0; i <= 2 * (radius / step); i++) {
            const offset = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * step;
            for (const [dx, dy] of [
                [offset, -radius],
                [offset, radius],
                [-radius, offset],
                [radius, offset],
            ]) {
                const candidate = moveItem(item, room, { x: item.x + dx, y: item.y + dy });
                if (fits(candidate)) {
                    return candidate;
                }
            }
        }
    }

    return item;
}

/** Problemas de cada objeto (choques, fuera de la habitación, más alto que el techo), por id. */
export function findIssues(room: Room): Map<string, string[]> {
    const issues = new Map<string, string[]>();
    const add = (id: string, message: string) => issues.set(id, [...(issues.get(id) ?? []), message]);

    room.items.forEach((item, index) => {
        if (isOutsideRoom(item, room)) {
            add(item.id, 'Se sale de la habitación');
        }
        if (item.elevation + item.height > room.height + EPSILON) {
            add(item.id, 'Supera la altura del techo');
        }
        for (const other of room.items.slice(index + 1)) {
            if (itemsCollide(item, other)) {
                add(item.id, `Choca con ${other.name}`);
                add(other.id, `Choca con ${item.name}`);
            }
        }
        if (item.shape === 'door') {
            const swing = doorSwing(item);
            for (const other of room.items) {
                if (other.mount === 'floor' && heightsOverlap(swing, other) && footprintsOverlap(swing, other)) {
                    add(other.id, `Tapa el paso de ${item.name}`);
                    add(item.id, `${other.name} no deja abrirla`);
                }
            }
        }
    });

    return issues;
}

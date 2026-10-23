import { WALL_THICKNESS } from './geometry';
import type { Room } from './types';

/**
 * Mundo de bloques alrededor de la habitación, como datos (sin Three.js): qué bloque hay en
 * cada celda de 1 m. Lo usan el dibujo del paisaje, la física del recorrido y el romper bloques.
 *
 * Coordenadas en metros: la columna (ix, iz) ocupa x ∈ [ix, ix+1] y z ∈ [iz, iz+1]; el bloque
 * de altura iy ocupa y ∈ [SURFACE + iy − 1, SURFACE + iy]. El bloque iy = 0 es el pasto que queda
 * a ras del piso de la habitación.
 */

export type BlockKind = 'grass' | 'dirt' | 'stone' | 'log' | 'leaves' | 'planks' | 'bricks' | 'crafting';

/** Todos los tipos de bloque: los del terreno y los que sólo se fabrican (tablones, ladrillos, mesa de crafteo). */
export const BLOCK_KINDS: BlockKind[] = ['grass', 'dirt', 'stone', 'log', 'leaves', 'planks', 'bricks', 'crafting'];
export type WorldStyle = 'dia' | 'atardecer';

/** Altura de la superficie (arriba del bloque iy = 0): apenas debajo del piso de la habitación. */
export const SURFACE = -0.03;
/** Cuántos metros de terreno hay alrededor de la casa. */
export const WORLD_REACH = 60;
/** Profundidad del terreno generado: si se rompe más abajo, aparece la roca del fondo. */
export const WORLD_FLOOR = -4;

export interface BlockWorld {
    blocks: Map<string, BlockKind>;
    /** Hay terreno generado; si no (vista "sólo cielo"), afuera es un llano invisible y sólo existen los bloques puestos. */
    terrain: boolean;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export function blockKey(ix: number, iy: number, iz: number): string {
    return `${ix},${iy},${iz}`;
}

export function parseBlockKey(key: string): [number, number, number] {
    const [ix, iy, iz] = key.split(',').map(Number);
    return [ix, iy, iz];
}

/** Pseudoaleatorio estable por columna: el mundo sale siempre igual para la misma habitación. */
export function hash(x: number, z: number): number {
    const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return v - Math.floor(v);
}

/** Altura del terreno (en bloques) de una columna: llano cerca de la casa, colinas suaves más lejos. */
function heightAt(x: number, z: number, distance: number): number {
    // Llano hasta 10 m de la casa, para que por las ventanas se vean el horizonte y el cielo.
    const ramp = Math.min(1, Math.max(0, (distance - 10) / 10));
    const waves = (Math.sin(x * 0.21) + Math.cos(z * 0.19) + Math.sin((x + z) * 0.11)) * 0.9;
    const rise = Math.min(4, Math.max(0, distance - 10) * 0.12);
    return Math.max(0, Math.round(rise + waves * ramp));
}

/** Distancia (en metros) desde el centro de una columna hasta la casa, contando las paredes. */
function distanceToHouse(room: Room, cx: number, cz: number): number {
    const T = WALL_THICKNESS / 100;
    const W = room.width / 100;
    const L = room.length / 100;
    const dx = Math.max(-T - cx, 0, cx - (W + T));
    const dz = Math.max(-T - cz, 0, cz - (L + T));
    return Math.hypot(dx, dz);
}

/**
 * Genera el mundo, le saca los bloques que ya se rompieron (`broken`, claves `ix,iy,iz`) y le agrega
 * los que se pusieron a mano (`placed`). Sin estilo no hay terreno: sólo los bloques puestos.
 */
export function generateWorld(room: Room, style: WorldStyle | null, broken: string[] = [], placed: [string, BlockKind][] = []): BlockWorld {
    const blocks = new Map<string, BlockKind>();
    const W = room.width / 100;
    const L = room.length / 100;
    const minX = Math.floor(-WORLD_REACH);
    const maxX = Math.ceil(W + WORLD_REACH);
    const minZ = Math.floor(-WORLD_REACH);
    const maxZ = Math.ceil(L + WORLD_REACH);

    for (let ix = minX; style && ix < maxX; ix++) {
        for (let iz = minZ; iz < maxZ; iz++) {
            // Sólo faltan las columnas que caen enteras dentro de la habitación: las que tocan las
            // paredes existen, así afuera de la puerta hay piso firme.
            if (ix >= 0 && ix + 1 <= W && iz >= 0 && iz + 1 <= L) {
                continue;
            }
            const distance = distanceToHouse(room, ix + 0.5, iz + 0.5);
            const height = heightAt(ix, iz, distance);
            // En las laderas a veces asoma la roca, como un afloramiento.
            const rocky = height >= 3 && hash(ix + 0.5, iz) > 0.8;
            for (let iy = WORLD_FLOOR; iy <= height; iy++) {
                const kind: BlockKind = iy === height ? (rocky ? 'stone' : 'grass') : height - iy > 2 || rocky ? 'stone' : 'dirt';
                blocks.set(blockKey(ix, iy, iz), kind);
            }
            // Árboles, lejos de las paredes para no tapar las ventanas de cerca.
            if (distance > 6 && hash(ix, iz) > 0.97) {
                // Los cerezos del atardecer son más altos y de copa ancha y chata.
                const trunk = style === 'atardecer' ? 5 : 4;
                const radius = style === 'atardecer' ? 2 : 1;
                for (let t = 1; t <= trunk; t++) {
                    blocks.set(blockKey(ix, height + t, iz), 'log');
                }
                for (let lx = -radius; lx <= radius; lx++) {
                    for (let lz = -radius; lz <= radius; lz++) {
                        for (let ly = trunk; ly <= trunk + 1; ly++) {
                            const corner = Math.abs(lx) === radius && Math.abs(lz) === radius;
                            if (corner && (ly === trunk + 1 || hash(ix + lx + 0.5, iz + lz + 0.5) > 0.5)) continue;
                            const key = blockKey(ix + lx, height + ly, iz + lz);
                            if (!blocks.has(key)) {
                                blocks.set(key, 'leaves');
                            }
                        }
                    }
                }
                blocks.set(blockKey(ix, height + trunk + 2, iz), 'leaves');
            }
        }
    }

    for (const key of broken) {
        blocks.delete(key);
    }
    for (const [key, kind] of placed) {
        blocks.set(key, kind);
    }
    return { blocks, terrain: style !== null, minX, maxX, minZ, maxZ };
}

const NEIGHBOURS: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
];

export function neighbourKeys(ix: number, iy: number, iz: number): string[] {
    return NEIGHBOURS.map(([dx, dy, dz]) => blockKey(ix + dx, iy + dy, iz + dz));
}

/** Un bloque se ve si tiene al menos una cara al aire (debajo del fondo del mundo no cuenta como aire). */
export function isExposed(world: BlockWorld, ix: number, iy: number, iz: number): boolean {
    return NEIGHBOURS.some(([dx, dy, dz]) => iy + dy >= WORLD_FLOOR && !world.blocks.has(blockKey(ix + dx, iy + dy, iz + dz)));
}

/** Caja (en metros) que ocupa un bloque. */
export function blockBox(ix: number, iy: number, iz: number) {
    return { minX: ix, maxX: ix + 1, minZ: iz, maxZ: iz + 1, bottom: SURFACE + iy - 1, top: SURFACE + iy };
}

/**
 * Primer bloque que atraviesa un rayo (en metros), recorriendo celda por celda como en los juegos
 * de bloques: mucho más barato que probar contra cada cubo dibujado.
 */
export function raycastBlocks(
    world: BlockWorld,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
): { key: string; distance: number; before: string | null } | null {
    // En vertical se corre el origen para que la celda entera iy coincida con el bloque iy
    // (que va de SURFACE + iy − 1 a SURFACE + iy).
    const oy = origin.y - SURFACE + 1;
    let ix = Math.floor(origin.x);
    let iy = Math.floor(oy);
    let iz = Math.floor(origin.z);
    const step = { x: Math.sign(direction.x), y: Math.sign(direction.y), z: Math.sign(direction.z) };
    const delta = {
        x: direction.x === 0 ? Infinity : Math.abs(1 / direction.x),
        y: direction.y === 0 ? Infinity : Math.abs(1 / direction.y),
        z: direction.z === 0 ? Infinity : Math.abs(1 / direction.z),
    };
    const next = (pos: number, cell: number, dir: number, d: number) => (dir > 0 ? (cell + 1 - pos) * d : dir < 0 ? (pos - cell) * d : Infinity);
    let tx = next(origin.x, ix, step.x, delta.x);
    let ty = next(oy, iy, step.y, delta.y);
    let tz = next(origin.z, iz, step.z, delta.z);
    let distance = 0;
    // Celda vacía por la que pasó justo antes: ahí va un bloque nuevo, pegado a la cara que se mira.
    let before: string | null = null;

    while (distance <= maxDistance) {
        const key = blockKey(ix, iy, iz);
        if (world.blocks.has(key)) {
            return { key, distance, before };
        }
        before = key;
        if (tx <= ty && tx <= tz) {
            ix += step.x;
            distance = tx;
            tx += delta.x;
        } else if (ty <= tz) {
            iy += step.y;
            distance = ty;
            ty += delta.y;
        } else {
            iz += step.z;
            distance = tz;
            tz += delta.z;
        }
    }
    return null;
}

/** Altura de la superficie de una columna: arriba del bloque más alto (o el fondo, si no hay ninguno). */
export function surfaceHeight(world: BlockWorld, x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let iy = 40; iy >= WORLD_FLOOR; iy--) {
        if (world.blocks.has(blockKey(ix, iy, iz))) {
            return SURFACE + iy;
        }
    }
    return world.terrain ? SURFACE + WORLD_FLOOR - 1 : SURFACE;
}

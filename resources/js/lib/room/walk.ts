import * as THREE from 'three';
import { isOpening } from './catalog';
import { halfExtents, WALL_THICKNESS } from './geometry';
import { M } from './three-builders';
import type { Room } from './types';
import { blockBox, blockKey, SURFACE, WORLD_FLOOR, type BlockWorld } from './world';

export type WalkKey = 'forward' | 'back' | 'left' | 'right';

export const WALK_KEYS: Record<string, WalkKey> = {
    w: 'forward',
    arrowup: 'forward',
    s: 'back',
    arrowdown: 'back',
    a: 'left',
    arrowleft: 'left',
    d: 'right',
    arrowright: 'right',
};

// Medidas del jugador y de la física, en metros y segundos.
export const EYE_HEIGHT = 1.6;
export const BODY_HEIGHT = 1.8;
export const BODY_RADIUS = 0.3;
/** Lo que se sube sin saltar (una alfombra, un escalón bajo). */
export const STEP_UP = 0.3;
const WALK_SPEED = 2.2;
const RUN_SPEED = 4;
const GRAVITY = 20;
/** Salta poco más de 1 m: alcanza para subirse a una cama o una mesa, no a un placard. */
const JUMP_SPEED = 6.5;
/** Hasta dónde llega la mano para agarrar o quitar algo. */
export const REACH = 4.5;

/** Caja sólida de un mueble, en metros. */
export interface Solid {
    id: string;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    bottom: number;
    top: number;
}

/** Muebles que frenan o sostienen al jugador. No cuentan alfombras ni ventanas y puertas; `ignoreId` es lo que tiene en la mano. */
export function solidsFor(room: Room, ignoreId: string | null = null): Solid[] {
    return room.items
        .filter((item) => item.id !== ignoreId && item.mount !== 'rug' && !isOpening(item))
        .map((item) => {
            const { hx, hy } = halfExtents(item);
            return {
                id: item.id,
                minX: (item.x - hx) * M,
                maxX: (item.x + hx) * M,
                minZ: (item.y - hy) * M,
                maxZ: (item.y + hy) * M,
                bottom: item.elevation * M,
                top: (item.elevation + item.height) * M,
            };
        });
}

/**
 * Paredes como cajas sólidas, cortadas donde hay una puerta: por ahí se sale afuera.
 * Arriba de la puerta queda pared, pero por encima de la cabeza.
 */
export function wallSolids(room: Room): Solid[] {
    const W = room.width * M;
    const L = room.length * M;
    const H = room.height * M;
    const T = WALL_THICKNESS * M;
    const doors = room.items.filter((i) => i.shape === 'door' && i.mount === 'wall');
    const walls: {
        wall: 'top' | 'bottom' | 'left' | 'right';
        from: number;
        to: number;
        box: (a: number, b: number) => Omit<Solid, 'id' | 'bottom' | 'top'>;
    }[] = [
        { wall: 'top', from: -T, to: W + T, box: (a, b) => ({ minX: a, maxX: b, minZ: -T, maxZ: 0 }) },
        { wall: 'bottom', from: -T, to: W + T, box: (a, b) => ({ minX: a, maxX: b, minZ: L, maxZ: L + T }) },
        { wall: 'left', from: 0, to: L, box: (a, b) => ({ minX: -T, maxX: 0, minZ: a, maxZ: b }) },
        { wall: 'right', from: 0, to: L, box: (a, b) => ({ minX: W, maxX: W + T, minZ: a, maxZ: b }) },
    ];
    const solids: Solid[] = [];
    for (const { wall, from, to, box } of walls) {
        const gaps = doors
            .filter((d) => d.wall === wall)
            .map((d) => {
                const along = (wall === 'top' || wall === 'bottom' ? d.x : d.y) * M;
                return { a: along - (d.width * M) / 2, b: along + (d.width * M) / 2, top: (d.elevation + d.height) * M };
            })
            .sort((p, q) => p.a - q.a);
        let start = from;
        for (const gap of gaps) {
            if (gap.a > start) {
                solids.push({ id: `pared-${wall}`, ...box(start, gap.a), bottom: 0, top: H });
            }
            solids.push({ id: `dintel-${wall}`, ...box(gap.a, gap.b), bottom: gap.top, top: H });
            start = Math.max(start, gap.b);
        }
        if (start < to) {
            solids.push({ id: `pared-${wall}`, ...box(start, to), bottom: 0, top: H });
        }
    }
    return solids;
}

/** Bloques del mundo alrededor de un punto, como cajas sólidas (sólo los cercanos: el mundo es grande). */
export function blockSolids(world: BlockWorld | null, x: number, z: number, feet: number): Solid[] {
    if (!world) {
        return [];
    }
    const solids: Solid[] = [];
    const fromY = Math.floor(feet - SURFACE) - 1;
    for (let ix = Math.floor(x) - 1; ix <= Math.floor(x) + 1; ix++) {
        for (let iz = Math.floor(z) - 1; iz <= Math.floor(z) + 1; iz++) {
            for (let iy = fromY; iy <= fromY + 4; iy++) {
                const key = blockKey(ix, iy, iz);
                if (world.blocks.has(key)) {
                    solids.push({ id: key, ...blockBox(ix, iy, iz) });
                }
            }
        }
    }
    return solids;
}

/** Está dentro de la planta de la habitación (ahí el piso es la base y hay techo). */
function insideHouse(room: Room, x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x <= room.width * M && z <= room.length * M;
}

/** El círculo del cuerpo (en planta) toca la caja. */
function touches(solid: Solid, x: number, z: number, radius: number): boolean {
    const cx = Math.max(solid.minX, Math.min(x, solid.maxX));
    const cz = Math.max(solid.minZ, Math.min(z, solid.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
}

/** Un mueble frena el paso si el cuerpo lo toca en planta y está entre los pies (más un escalón) y la cabeza. */
function blocks(solid: Solid, x: number, z: number, feet: number): boolean {
    return touches(solid, x, z, BODY_RADIUS) && solid.top > feet + STEP_UP && solid.bottom < feet + BODY_HEIGHT;
}

/** Puede pasar a (x, z): no se mete en un mueble nuevo. Si ya estaba metido en uno (por ejemplo al entrar), lo deja salir. */
export function canMoveTo(solids: Solid[], from: { x: number; z: number }, to: { x: number; z: number }, feet: number): boolean {
    return !solids.some((s) => blocks(s, to.x, to.z, feet) && !blocks(s, from.x, from.z, feet));
}

/** Altura sobre la que se para el jugador: el piso (o `base`) o la parte de arriba de lo que tiene debajo. */
export function supportHeight(solids: Solid[], x: number, z: number, feet: number, base = 0): number {
    let support = base;
    for (const s of solids) {
        if (touches(s, x, z, BODY_RADIUS * 0.7) && s.top <= feet + STEP_UP && s.top > support) {
            support = s.top;
        }
    }
    return support;
}

/**
 * Recorrido en primera persona al estilo de los juegos de bloques: se mira con el mouse,
 * se camina con W A S D, se salta con Espacio y se corre con Shift. Hay gravedad, los muebles
 * y los bloques frenan, y se sube a lo bajo saltando. Se sale afuera por las puertas.
 */
export class WalkControls {
    readonly pressed = new Set<WalkKey>();
    private yaw = 0;
    private pitch = 0;
    private feet = 0;
    private velocityY = 0;
    /** Empujón horizontal (por un golpe), que se va frenando. */
    private push = new THREE.Vector3();
    private onGround = true;
    private saved: { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null = null;

    constructor(private camera: THREE.PerspectiveCamera) {}

    /** Entra parado cerca de la pared inferior, mirando hacia el centro de la habitación. */
    enter(room: Room) {
        this.saved = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov };
        this.yaw = 0;
        this.pitch = -0.08;
        this.feet = 0;
        this.velocityY = 0;
        this.onGround = true;
        this.camera.position.set((room.width * M) / 2, 0, room.length * M - 0.6);
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
        this.camera.position.x = Math.max(BODY_RADIUS, Math.min(room.width * M - BODY_RADIUS, this.camera.position.x));
        this.camera.position.z = Math.max(BODY_RADIUS, Math.min(room.length * M - BODY_RADIUS, this.camera.position.z));
        this.placeEyes();
        this.applyRotation();
    }

    exit() {
        this.pressed.clear();
        if (this.saved) {
            this.camera.position.copy(this.saved.position);
            this.camera.quaternion.copy(this.saved.quaternion);
            this.camera.fov = this.saved.fov;
            this.camera.updateProjectionMatrix();
        }
        this.saved = null;
    }

    /** Girar la vista: `dx`/`dy` en píxeles de movimiento del mouse (o del dedo). */
    look(dx: number, dy: number, sensitivity = 0.0025) {
        this.yaw -= dx * sensitivity;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * sensitivity));
        this.applyRotation();
    }

    /** Empujón al recibir un golpe: hacia (x, z) y un saltito. */
    knock(x: number, z: number) {
        this.push.set(x, 0, z);
        if (this.onGround) {
            this.velocityY = 3.5;
            this.onGround = false;
        }
    }

    jump() {
        if (this.onGround) {
            this.velocityY = JUMP_SPEED;
            this.onGround = false;
        }
    }

    /** Un paso de física; `seconds` es el tiempo desde el cuadro anterior. `ignoreId`: lo que tiene en la mano. */
    update(seconds: number, room: Room, options: { fast?: boolean; ignoreId?: string | null; world?: BlockWorld | null } = {}) {
        // Tope de 0,05 s por paso: si la pestaña estuvo en segundo plano no atraviesa nada.
        const dt = Math.min(seconds, 0.05);
        const position = this.camera.position;
        const world = options.world ?? null;
        const solids = [...solidsFor(room, options.ignoreId ?? null), ...wallSolids(room), ...blockSolids(world, position.x, position.z, this.feet)];

        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const move = new THREE.Vector3();
        if (this.pressed.has('forward')) move.add(forward);
        if (this.pressed.has('back')) move.sub(forward);
        if (this.pressed.has('right')) move.add(right);
        if (this.pressed.has('left')) move.sub(right);

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(options.fast ? RUN_SPEED : WALK_SPEED);
        }
        move.add(this.push).multiplyScalar(dt);
        this.push.multiplyScalar(Math.pow(0.02, dt));
        if (move.lengthSq() > 0) {
            // Cada eje por separado: así se desliza a lo largo de un mueble en vez de quedar trabado.
            const from = { x: position.x, z: position.z };
            if (canMoveTo(solids, from, { x: position.x + move.x, z: position.z }, this.feet)) {
                position.x += move.x;
            }
            if (canMoveTo(solids, { x: position.x, z: from.z }, { x: position.x, z: position.z + move.z }, this.feet)) {
                position.z += move.z;
            }
            this.clampToWorld(room, world);
        }

        // Gravedad, piso y techo.
        this.velocityY -= GRAVITY * dt;
        this.feet += this.velocityY * dt;
        // Adentro el piso es la base; afuera, el fondo del mundo (o un llano si no hay paisaje).
        const inside = insideHouse(room, position.x, position.z);
        const base = inside ? 0 : world?.terrain ? SURFACE + WORLD_FLOOR - 1 : SURFACE;
        const support = supportHeight(solids, position.x, position.z, Math.max(this.feet, this.feet - this.velocityY * dt), base);
        if (this.feet <= support) {
            this.feet = support;
            this.velocityY = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        const ceiling = inside ? room.height * M - BODY_HEIGHT : Infinity;
        if (this.feet > ceiling) {
            this.feet = Math.max(support, ceiling);
            this.velocityY = Math.min(0, this.velocityY);
        }
        this.placeEyes();
    }

    /** Rayo desde los ojos hacia donde apunta la mira. */
    aim(raycaster: THREE.Raycaster) {
        raycaster.set(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
        raycaster.far = REACH;
    }

    private placeEyes() {
        this.camera.position.y = this.feet + EYE_HEIGHT;
    }

    private applyRotation() {
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    }

    /** Borde del mundo: no se puede ir más allá del terreno generado. */
    private clampToWorld(room: Room, world: BlockWorld | null) {
        const p = this.camera.position;
        const minX = world ? world.minX + 1 : -40;
        const maxX = world ? world.maxX - 1 : room.width * M + 40;
        const minZ = world ? world.minZ + 1 : -40;
        const maxZ = world ? world.maxZ - 1 : room.length * M + 40;
        p.x = Math.max(minX, Math.min(maxX, p.x));
        p.z = Math.max(minZ, Math.min(maxZ, p.z));
    }
}

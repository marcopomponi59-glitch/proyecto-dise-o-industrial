import * as THREE from 'three';
import { blockCanvas, CHERRY_LEAVES, craftingTopCanvas, DARK_LOG, DIRT, GRASS, LEAVES, LOG, pixelCanvas, type Palette } from './pixels';
import { M } from './three-builders';
import type { Room } from './types';
import { BLOCK_KINDS, blockKey, hash, isExposed, neighbourKeys, parseBlockKey, SURFACE, type BlockKind, type BlockWorld } from './world';

/**
 * Dibujo del paisaje de bloques alrededor de la habitación (el mundo en sí está en `world.ts`):
 * cubos de 1 m de pasto, tierra, roca, troncos y hojas, más flores, nubes, cielo y sol.
 * Las texturas son píxeles dibujados por código (no se usa material de ningún juego).
 */

/** Textura de bloque nítida (sin suavizado), a partir de un lienzo pixelado. */
export function blockTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export type LandscapeStyle = 'dia' | 'atardecer';

/** Colores de cada estilo: cielo (de arriba al horizonte), bruma, sol, luz y vegetación. */
export const LANDSCAPE_STYLES: Record<
    LandscapeStyle,
    {
        skyTop: string;
        skyHorizon: string;
        fog: string;
        sun: string;
        sunLight: string;
        hemisphere: string;
        cloud: string;
        leaves: Palette;
        log: Palette;
        flowers: string[];
    }
> = {
    dia: {
        skyTop: '#5ea8ff',
        skyHorizon: '#cfe8ff',
        fog: '#cfe8ff',
        sun: '#fff8d0',
        sunLight: '#ffffff',
        hemisphere: '#ffffff',
        cloud: '#ffffff',
        leaves: LEAVES,
        log: LOG,
        flowers: ['#ffd400', '#ff5252'],
    },
    atardecer: {
        skyTop: '#c79ad6',
        skyHorizon: '#ff9a5c',
        fog: '#f6a77e',
        sun: '#fff1b0',
        sunLight: '#ffc48a',
        hemisphere: '#ffd8bf',
        cloud: '#ffd2b8',
        leaves: CHERRY_LEAVES,
        log: DARK_LOG,
        flowers: ['#f48fb1', '#ce93d8', '#ffffff'],
    },
};

const SKY_RADIUS = 260;

/** Cielo: esfera grande vista desde adentro, con degradé del horizonte hacia arriba. No le afecta la bruma. */
function buildSky(center: THREE.Vector3, top: string, horizon: string): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const colors: number[] = [];
    const a = new THREE.Color(horizon);
    const b = new THREE.Color(top);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
        const t = Math.min(1, Math.max(0, position.getY(i) / SKY_RADIUS / 0.6));
        const c = a.clone().lerp(b, t);
        colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.copy(center);
    sky.renderOrder = -1;
    sky.name = 'sky';
    return sky;
}

/** Lugar libre para dibujar más bloques de cada tipo cuando, al romper uno, quedan a la vista los de alrededor. */
const SPARE = 3000;

/**
 * Paisaje dibujado a partir del mundo de bloques. Sólo se dibujan los bloques con alguna cara al aire;
 * al romper uno se esconde y aparecen los que quedaron a la vista.
 */
export class LandscapeView {
    readonly group = new THREE.Group();
    private meshes = new Map<BlockKind, THREE.InstancedMesh>();
    /** Qué bloque dibuja cada instancia, y al revés. */
    private keysByMesh = new Map<BlockKind, string[]>();
    private drawn = new Map<string, { kind: BlockKind; index: number }>();
    private matrix = new THREE.Matrix4();
    private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    readonly materials: Record<BlockKind, THREE.Material | THREE.Material[]>;

    /** Sin estilo (vista "sólo cielo") no hay terreno ni cielo pintado: sólo los bloques que se pongan. */
    constructor(
        room: Room,
        style: LandscapeStyle | null,
        readonly world: BlockWorld,
    ) {
        const palette = LANDSCAPE_STYLES[style ?? 'dia'];
        this.group.name = 'landscape';
        const W = room.width * M;
        const L = room.length * M;

        const palettes = { log: palette.log, leaves: palette.leaves };
        const side = (kind: BlockKind) => new THREE.MeshLambertMaterial({ map: blockTexture(blockCanvas(kind, palettes)) });
        const grassSide = blockTexture(blockCanvas('grass', palettes));
        const materials: Record<BlockKind, THREE.Material | THREE.Material[]> = {
            grass: [
                new THREE.MeshLambertMaterial({ map: grassSide }),
                new THREE.MeshLambertMaterial({ map: grassSide }),
                new THREE.MeshLambertMaterial({ map: blockTexture(pixelCanvas(GRASS, 5)) }),
                new THREE.MeshLambertMaterial({ map: blockTexture(pixelCanvas(DIRT, 7)) }),
                new THREE.MeshLambertMaterial({ map: grassSide }),
                new THREE.MeshLambertMaterial({ map: grassSide }),
            ],
            dirt: side('dirt'),
            stone: side('stone'),
            log: side('log'),
            leaves: side('leaves'),
            planks: side('planks'),
            bricks: side('bricks'),
            // Mesa de crafteo: arriba la grilla de trabajo, a los costados las herramientas colgadas.
            crafting: [
                side('crafting'),
                side('crafting'),
                new THREE.MeshLambertMaterial({ map: blockTexture(craftingTopCanvas()) }),
                side('planks'),
                side('crafting'),
                side('crafting'),
            ],
        };
        this.materials = materials;

        const visible = new Map<BlockKind, string[]>();
        for (const [key, kind] of world.blocks) {
            const [ix, iy, iz] = parseBlockKey(key);
            if (isExposed(world, ix, iy, iz)) {
                visible.set(kind, [...(visible.get(kind) ?? []), key]);
            }
        }

        const cube = new THREE.BoxGeometry(1, 1, 1);
        for (const kind of BLOCK_KINDS) {
            const keys = visible.get(kind) ?? [];
            const mesh = new THREE.InstancedMesh(cube, materials[kind], keys.length + SPARE);
            mesh.count = 0;
            mesh.userData.blockKind = kind;
            mesh.receiveShadow = true;
            mesh.castShadow = kind === 'log' || kind === 'leaves';
            this.meshes.set(kind, mesh);
            this.keysByMesh.set(kind, []);
            this.group.add(mesh);
            keys.forEach((key) => this.draw(key, kind));
            mesh.instanceMatrix.needsUpdate = true;
            // Los bloques nuevos aparecen cerca de los rotos: que no los recorte por estar fuera de la esfera inicial.
            mesh.frustumCulled = false;
        }

        if (!style) {
            return;
        }
        this.addDecor(room, style, palette);

        // Cielo y sol: un cuadrado grande y luminoso cerca del horizonte, del lado izquierdo de la casa.
        const center = new THREE.Vector3(W / 2, 0, L / 2);
        this.group.add(buildSky(center, palette.skyTop, palette.skyHorizon));
        const sun = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ color: palette.sun, fog: false }));
        const sunHeight = style === 'atardecer' ? 22 : 100;
        sun.position.set(center.x - 170, sunHeight, center.z - 50);
        sun.lookAt(center.x, sunHeight, center.z);
        sun.name = 'sun';
        this.group.add(sun);
    }

    private draw(key: string, kind: BlockKind) {
        const mesh = this.meshes.get(kind)!;
        if (mesh.count >= mesh.instanceMatrix.count) {
            return;
        }
        const [ix, iy, iz] = parseBlockKey(key);
        const index = mesh.count++;
        mesh.setMatrixAt(index, this.matrix.makeTranslation(ix + 0.5, SURFACE + iy - 0.5, iz + 0.5));
        this.keysByMesh.get(kind)![index] = key;
        this.drawn.set(key, { kind, index });
    }

    /** Pone un bloque (si la celda está libre). */
    add(key: string, kind: BlockKind): boolean {
        if (this.world.blocks.has(key)) {
            return false;
        }
        this.world.blocks.set(key, kind);
        this.draw(key, kind);
        this.meshes.get(kind)!.instanceMatrix.needsUpdate = true;
        return true;
    }

    /** Saca un bloque del mundo y del dibujo, y dibuja los vecinos que quedaron a la vista. */
    remove(key: string): BlockKind | null {
        const kind = this.world.blocks.get(key);
        if (!kind) {
            return null;
        }
        this.world.blocks.delete(key);
        const drawn = this.drawn.get(key);
        if (drawn) {
            const mesh = this.meshes.get(drawn.kind)!;
            mesh.setMatrixAt(drawn.index, this.hidden);
            mesh.instanceMatrix.needsUpdate = true;
            this.drawn.delete(key);
        }
        const [ix, iy, iz] = parseBlockKey(key);
        for (const neighbour of neighbourKeys(ix, iy, iz)) {
            const neighbourKind = this.world.blocks.get(neighbour);
            if (neighbourKind && !this.drawn.has(neighbour)) {
                this.draw(neighbour, neighbourKind);
                this.meshes.get(neighbourKind)!.instanceMatrix.needsUpdate = true;
            }
        }
        return kind;
    }

    /** Flores y nubes: adorno, no son bloques. */
    private addDecor(room: Room, style: LandscapeStyle, palette: (typeof LANDSCAPE_STYLES)[LandscapeStyle]) {
        const flowers: THREE.Vector3[] = [];
        for (const [key, kind] of this.world.blocks) {
            if (kind !== 'grass') continue;
            const [ix, iy, iz] = parseBlockKey(key);
            if (hash(iz, ix) > (style === 'atardecer' ? 0.92 : 0.97) && !this.world.blocks.has(blockKey(ix, iy + 1, iz))) {
                flowers.push(new THREE.Vector3(ix + 0.7, SURFACE + iy + 0.12, iz + 0.3));
            }
        }
        if (flowers.length) {
            const mesh = new THREE.InstancedMesh(
                new THREE.BoxGeometry(0.18, 0.24, 0.18),
                new THREE.MeshLambertMaterial({ color: '#ffffff' }),
                flowers.length,
            );
            flowers.forEach((p, i) => {
                mesh.setMatrixAt(i, this.matrix.makeTranslation(p.x, p.y, p.z));
                mesh.setColorAt(i, new THREE.Color(palette.flowers[i % palette.flowers.length]));
            });
            mesh.name = 'flowers';
            this.group.add(mesh);
        }

        const clouds: THREE.Vector3[] = [];
        const { minX, maxX, minZ, maxZ } = this.world;
        for (let i = 0; i < 40; i++) {
            const cx = minX + hash(i, 3) * (maxX - minX);
            const cz = minZ + hash(i, 7) * (maxZ - minZ);
            const size = 2 + Math.floor(hash(i, 11) * 3);
            for (let a = 0; a < size; a++) {
                for (let b = 0; b < 2; b++) {
                    clouds.push(new THREE.Vector3(cx + a * 3, style === 'atardecer' ? 18 : 24, cz + b * 3));
                }
            }
        }
        const cloudMesh = new THREE.InstancedMesh(
            new THREE.BoxGeometry(3, 0.8, 3),
            new THREE.MeshBasicMaterial({ color: palette.cloud, transparent: true, opacity: 0.9, fog: false }),
            clouds.length,
        );
        clouds.forEach((p, i) => cloudMesh.setMatrixAt(i, this.matrix.makeTranslation(p.x, p.y, p.z)));
        cloudMesh.name = 'clouds';
        this.group.add(cloudMesh);
        void room;
    }

    dispose() {
        disposeLandscape(this.group);
    }
}

export function disposeLandscape(group: THREE.Group) {
    const textures = new Set<THREE.Texture>();
    group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
                if ((m as THREE.MeshLambertMaterial).map) {
                    textures.add((m as THREE.MeshLambertMaterial).map!);
                }
                m.dispose();
            }
            if (child instanceof THREE.InstancedMesh) {
                child.dispose();
            }
        }
    });
    textures.forEach((t) => t.dispose());
}

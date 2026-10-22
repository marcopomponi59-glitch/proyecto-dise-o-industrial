import * as THREE from 'three';
import { M, WALL_THICKNESS } from './three-builders';
import type { Room } from './types';

/**
 * Paisaje de bloques alrededor de la habitación, para ver por las ventanas: terreno de cubos
 * de 1 m con pasto y tierra, colinas que crecen con la distancia, árboles y nubes.
 * Las texturas son píxeles dibujados por código (no se usa material de ningún juego).
 */

const BLOCK = 1;
/** Cuántos metros de paisaje hay alrededor de la habitación. */
const REACH = 22;

type Palette = [number, number, number][];

/** Textura pixelada de 16×16 con ruido, a partir de una paleta; `top` pinta una franja de pasto arriba. */
function pixelTexture(palette: Palette, seed: number, top?: Palette): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const colors = top && y < 3 + Math.round(rnd() * 2) ? top : palette;
            const [r, g, b] = colors[Math.floor(rnd() * colors.length)];
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const GRASS: Palette = [
    [95, 159, 53],
    [106, 170, 61],
    [84, 145, 47],
    [117, 179, 70],
];
const DIRT: Palette = [
    [134, 96, 67],
    [121, 85, 58],
    [150, 108, 74],
    [110, 78, 52],
];
const STONE: Palette = [
    [125, 125, 125],
    [110, 110, 110],
    [140, 140, 140],
];
const LOG: Palette = [
    [104, 82, 50],
    [88, 68, 40],
    [120, 95, 60],
];
const LEAVES: Palette = [
    [58, 125, 40],
    [48, 105, 32],
    [72, 140, 50],
];

/** Altura del terreno (en bloques) en una columna: llano cerca de la casa, colinas más lejos. */
function heightAt(x: number, z: number, distance: number): number {
    // Llano hasta 10 m de la casa y colinas bajas después, para que por las ventanas se vea
    // el horizonte y el cielo, no un paredón de tierra.
    const ramp = Math.min(1, Math.max(0, (distance - 10) / 8));
    const waves = (Math.sin(x * 0.35) + Math.cos(z * 0.3) + Math.sin((x + z) * 0.17)) * 0.7;
    const rise = Math.min(3, Math.max(0, distance - 10) * 0.18);
    return Math.max(0, Math.round(rise + waves * ramp));
}

/** Pseudoaleatorio estable por columna: el paisaje sale siempre igual para la misma habitación. */
function hash(x: number, z: number): number {
    const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return v - Math.floor(v);
}

const CHERRY_LEAVES: Palette = [
    [236, 160, 200],
    [244, 184, 214],
    [222, 140, 186],
    [250, 205, 225],
    [212, 128, 176],
];
const DARK_LOG: Palette = [
    [70, 45, 55],
    [58, 36, 46],
    [84, 56, 66],
];

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

/** Cielo: esfera grande vista desde adentro, con degradé del horizonte hacia arriba. No le afecta la bruma. */
function buildSky(center: THREE.Vector3, top: string, horizon: string): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(90, 32, 16);
    const colors: number[] = [];
    const a = new THREE.Color(horizon);
    const b = new THREE.Color(top);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
        const t = Math.min(1, Math.max(0, position.getY(i) / 90 / 0.6));
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

export function buildLandscape(room: Room, style: LandscapeStyle): THREE.Group {
    const palette = LANDSCAPE_STYLES[style];
    const group = new THREE.Group();
    group.name = 'landscape';
    const W = room.width * M;
    const L = room.length * M;
    const T = WALL_THICKNESS * M;

    const grassSide = pixelTexture(DIRT, 3, GRASS);
    const materials = {
        grass: [
            new THREE.MeshLambertMaterial({ map: grassSide }),
            new THREE.MeshLambertMaterial({ map: grassSide }),
            new THREE.MeshLambertMaterial({ map: pixelTexture(GRASS, 5) }),
            new THREE.MeshLambertMaterial({ map: pixelTexture(DIRT, 7) }),
            new THREE.MeshLambertMaterial({ map: grassSide }),
            new THREE.MeshLambertMaterial({ map: grassSide }),
        ],
        dirt: new THREE.MeshLambertMaterial({ map: pixelTexture(DIRT, 9) }),
        stone: new THREE.MeshLambertMaterial({ map: pixelTexture(STONE, 11) }),
        log: new THREE.MeshLambertMaterial({ map: pixelTexture(palette.log, 13) }),
        leaves: new THREE.MeshLambertMaterial({ map: pixelTexture(palette.leaves, 17) }),
        cloud: new THREE.MeshBasicMaterial({ color: palette.cloud, transparent: true, opacity: 0.9, fog: false }),
        flower: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: false }),
    };

    const positions: Record<'grass' | 'dirt' | 'stone' | 'log' | 'leaves' | 'cloud' | 'flower', THREE.Vector3[]> = {
        flower: [],
        grass: [],
        dirt: [],
        stone: [],
        log: [],
        leaves: [],
        cloud: [],
    };

    // La superficie queda apenas por debajo del piso de la habitación.
    const ground = -BLOCK / 2 - 0.03;
    const minX = Math.floor(-T - REACH);
    const maxX = Math.ceil(W + T + REACH);
    const minZ = Math.floor(-T - REACH);
    const maxZ = Math.ceil(L + T + REACH);

    for (let x = minX; x <= maxX; x += BLOCK) {
        for (let z = minZ; z <= maxZ; z += BLOCK) {
            const cx = x + BLOCK / 2;
            const cz = z + BLOCK / 2;
            // Distancia a la casa (0 adentro): de ahí sale cuánto se elevan las colinas.
            const dx = Math.max(-T - cx, 0, cx - (W + T));
            const dz = Math.max(-T - cz, 0, cz - (L + T));
            const distance = Math.hypot(dx, dz);
            if (distance === 0) {
                continue;
            }
            const height = heightAt(x, z, distance);
            for (let y = 0; y <= height; y++) {
                // En las laderas a veces asoma la roca, como un afloramiento.
                const rocky = height >= 3 && hash(x + 0.5, z) > 0.8;
                const kind = y === height ? (rocky && y > 1 ? 'stone' : 'grass') : height - y > 2 || rocky ? 'stone' : 'dirt';
                // Bajo la superficie sólo hace falta lo que se ve desde un costado.
                if (kind !== 'grass' && y < height - 3) {
                    continue;
                }
                positions[kind].push(new THREE.Vector3(cx, ground + y * BLOCK, cz));
            }
            // Flores sueltas sobre el pasto.
            if (distance > 1.5 && hash(z, x) > (style === 'atardecer' ? 0.9 : 0.97)) {
                positions.flower.push(new THREE.Vector3(cx + 0.2, ground + height * BLOCK + BLOCK / 2 + 0.12, cz - 0.2));
            }
            // Algunos árboles, lejos de las paredes para no tapar las ventanas de cerca.
            if (distance > 6 && hash(x, z) > 0.965) {
                const base = ground + (height + 1) * BLOCK;
                // Los cerezos del atardecer son más altos y de copa ancha y chata.
                const trunk = style === 'atardecer' ? 5 : 4;
                const radius = style === 'atardecer' ? 2 : 1;
                for (let t = 0; t < trunk; t++) {
                    positions.log.push(new THREE.Vector3(cx, base + t, cz));
                }
                for (let lx = -radius; lx <= radius; lx++) {
                    for (let lz = -radius; lz <= radius; lz++) {
                        for (let ly = trunk - 1; ly <= trunk; ly++) {
                            const corner = Math.abs(lx) === radius && Math.abs(lz) === radius;
                            if (corner && (ly === trunk || hash(cx + lx, cz + lz) > 0.5)) continue;
                            positions.leaves.push(new THREE.Vector3(cx + lx, base + ly, cz + lz));
                        }
                    }
                }
                positions.leaves.push(new THREE.Vector3(cx, base + trunk + 1, cz));
            }
        }
    }

    // Nubes: bloques planos en lo alto.
    for (let i = 0; i < 14; i++) {
        const cx = minX + hash(i, 3) * (maxX - minX);
        const cz = minZ + hash(i, 7) * (maxZ - minZ);
        const size = 2 + Math.floor(hash(i, 11) * 3);
        for (let a = 0; a < size; a++) {
            for (let b = 0; b < 2; b++) {
                positions.cloud.push(new THREE.Vector3(cx + a * 2, style === 'atardecer' ? 13 : 16, cz + b * 2));
            }
        }
    }

    const cube = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    const cloudCube = new THREE.BoxGeometry(2, 0.6, 2);
    const flowerCube = new THREE.BoxGeometry(0.18, 0.24, 0.18);
    const matrix = new THREE.Matrix4();
    for (const [kind, list] of Object.entries(positions) as [keyof typeof positions, THREE.Vector3[]][]) {
        if (list.length === 0) {
            continue;
        }
        const geometry = kind === 'cloud' ? cloudCube : kind === 'flower' ? flowerCube : cube;
        const mesh = new THREE.InstancedMesh(geometry, materials[kind], list.length);
        list.forEach((p, i) => {
            mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z));
            if (kind === 'flower') {
                mesh.setColorAt(i, new THREE.Color(palette.flowers[i % palette.flowers.length]));
            }
        });
        mesh.receiveShadow = kind !== 'cloud';
        mesh.castShadow = kind === 'log' || kind === 'leaves';
        group.add(mesh);
    }

    // Cielo y sol: un cuadrado grande y luminoso cerca del horizonte, del lado izquierdo de la casa.
    const center = new THREE.Vector3(W / 2, 0, L / 2);
    group.add(buildSky(center, palette.skyTop, palette.skyHorizon));
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: palette.sun, fog: false }));
    const sunHeight = style === 'atardecer' ? 9 : 40;
    sun.position.set(center.x - 70, sunHeight, center.z - 20);
    sun.lookAt(center.x, sunHeight, center.z);
    sun.name = 'sun';
    group.add(sun);

    return group;
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

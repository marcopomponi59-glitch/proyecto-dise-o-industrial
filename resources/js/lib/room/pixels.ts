/**
 * Arte pixelado dibujado por código (sin imágenes de ningún juego): texturas de los bloques,
 * íconos del inventario, el pico y las grietas que aparecen al romper.
 */
import type { BlockKind } from './world';

export type Palette = [number, number, number][];

export const GRASS: Palette = [
    [95, 159, 53],
    [106, 170, 61],
    [84, 145, 47],
    [117, 179, 70],
];
export const DIRT: Palette = [
    [134, 96, 67],
    [121, 85, 58],
    [150, 108, 74],
    [110, 78, 52],
];
export const STONE: Palette = [
    [125, 125, 125],
    [110, 110, 110],
    [140, 140, 140],
];
export const LOG: Palette = [
    [104, 82, 50],
    [88, 68, 40],
    [120, 95, 60],
];
export const LEAVES: Palette = [
    [58, 125, 40],
    [48, 105, 32],
    [72, 140, 50],
];
export const CHERRY_LEAVES: Palette = [
    [236, 160, 200],
    [244, 184, 214],
    [222, 140, 186],
    [250, 205, 225],
    [212, 128, 176],
];
export const DARK_LOG: Palette = [
    [70, 45, 55],
    [58, 36, 46],
    [84, 56, 66],
];

/** Generador con semilla: el mismo dibujo sale siempre igual. */
function seeded(seed: number): () => number {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Lienzo de 16×16 con ruido a partir de una paleta; `top` pinta una franja de pasto arriba. */
export function pixelCanvas(palette: Palette, seed: number, top?: Palette): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const rnd = seeded(seed);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const colors = top && y < 3 + Math.round(rnd() * 2) ? top : palette;
            const [r, g, b] = colors[Math.floor(rnd() * colors.length)];
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    return canvas;
}

export interface BlockPalettes {
    log: Palette;
    leaves: Palette;
}

/** Lienzo de la cara lateral de cada bloque (la que se usa de ícono y para los pedacitos al romper). */
export function blockCanvas(kind: BlockKind, palettes: BlockPalettes): HTMLCanvasElement {
    switch (kind) {
        case 'grass':
            return pixelCanvas(DIRT, 3, GRASS);
        case 'dirt':
            return pixelCanvas(DIRT, 9);
        case 'stone':
            return pixelCanvas(STONE, 11);
        case 'log':
            return pixelCanvas(palettes.log, 13);
        case 'leaves':
            return pixelCanvas(palettes.leaves, 17);
        case 'planks':
            return planksCanvas();
        case 'bricks':
            return bricksCanvas();
        case 'crafting':
            return craftingSideCanvas();
    }
}

const PLANKS: Palette = [
    [176, 135, 82],
    [163, 124, 74],
    [186, 145, 90],
];

/** Tablones: cuatro tablas horizontales con vetas y una junta oscura entre cada una. */
function planksCanvas(): HTMLCanvasElement {
    const canvas = pixelCanvas(PLANKS, 41);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(110, 82, 48)';
    for (const y of [3, 7, 11, 15]) {
        ctx.fillRect(0, y, 16, 1);
    }
    // Juntas verticales corridas en cada tabla.
    [
        [5, 0],
        [12, 4],
        [2, 8],
        [9, 12],
    ].forEach(([x, y]) => ctx.fillRect(x, y, 1, 3));
    return canvas;
}

/** Ladrillos: hileras corridas de ladrillos rojizos con junta clara. */
function bricksCanvas(): HTMLCanvasElement {
    const canvas = pixelCanvas(
        [
            [160, 72, 56],
            [148, 64, 50],
            [172, 82, 62],
        ],
        43,
    );
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200, 190, 180)';
    for (let row = 0; row < 4; row++) {
        ctx.fillRect(0, row * 4 + 3, 16, 1);
        const offset = row % 2 ? 4 : 0;
        for (let x = offset; x < 16; x += 8) {
            ctx.fillRect(x, row * 4, 1, 3);
        }
    }
    return canvas;
}

/** Costado de la mesa de crafteo: tablones con una sierra y un martillo colgados (dibujo propio). */
function craftingSideCanvas(): HTMLCanvasElement {
    const canvas = planksCanvas();
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(120, 120, 120)';
    ctx.fillRect(2, 5, 5, 2); // hoja de la sierra
    ctx.fillStyle = 'rgb(90, 60, 30)';
    ctx.fillRect(7, 5, 2, 2); // mango de la sierra
    ctx.fillRect(11, 6, 1, 6); // mango del martillo
    ctx.fillStyle = 'rgb(100, 100, 100)';
    ctx.fillRect(9, 5, 5, 2); // cabeza del martillo
    return canvas;
}

/** Arriba de la mesa de crafteo: tablero con una grilla de 3×3 para trabajar. */
export function craftingTopCanvas(): HTMLCanvasElement {
    const canvas = planksCanvas();
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(205, 170, 120)';
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = 'rgb(110, 82, 48)';
    for (const p of [2, 6, 10, 13]) {
        ctx.fillRect(2, p, 12, 1);
        ctx.fillRect(p, 2, 1, 12);
    }
    return canvas;
}

export const BLOCK_NAMES: Record<BlockKind, string> = {
    grass: 'Pasto',
    dirt: 'Tierra',
    stone: 'Piedra',
    log: 'Madera',
    leaves: 'Hojas',
    planks: 'Tablones',
    bricks: 'Ladrillos',
    crafting: 'Mesa de crafteo',
};

/** Pico pixelado propio: mango de madera en diagonal y cabeza de piedra curva. */
export function pickaxeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const dot = (x: number, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
    };
    // Mango: de abajo a la izquierda hacia arriba a la derecha.
    for (let i = 0; i < 10; i++) {
        dot(2 + i, 13 - i, i % 2 ? '#6b4a2b' : '#8a6238');
        dot(3 + i, 13 - i, '#4a3220');
    }
    // Cabeza: un arco de piedra con borde oscuro.
    const head: [number, number][] = [
        [6, 2],
        [7, 1],
        [8, 1],
        [9, 1],
        [10, 2],
        [11, 2],
        [12, 3],
        [13, 4],
        [13, 5],
        [14, 6],
        [14, 7],
        [14, 8],
        [13, 9],
    ];
    head.forEach(([x, y], i) => {
        dot(x, y, i % 3 === 0 ? '#9e9e9e' : '#bdbdbd');
        dot(x, y + 1, '#616161');
    });
    return canvas;
}

/** Espada pixelada propia, en diagonal: hoja de madera o de piedra, guarda y mango. */
export function swordCanvas(material: 'madera' | 'piedra'): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const dot = (x: number, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
    };
    const [light, dark] = material === 'madera' ? ['#c99a5b', '#8a6238'] : ['#b8b8b8', '#7a7a7a'];
    // Hoja: de la guarda hacia arriba a la derecha, con filo claro y lomo oscuro.
    for (let i = 0; i < 9; i++) {
        dot(5 + i, 10 - i, light);
        dot(6 + i, 10 - i, dark);
    }
    dot(14, 1, light);
    // Guarda.
    for (const [x, y] of [
        [3, 10],
        [4, 11],
        [6, 12],
        [7, 13],
    ]) {
        dot(x, y, '#5a3d22');
    }
    // Mango y pomo.
    dot(4, 12, '#6b4a2b');
    dot(3, 13, '#6b4a2b');
    dot(2, 14, '#3d2a17');
    return canvas;
}

/**
 * Diez etapas de grietas sobre fondo transparente: cada etapa agrega líneas a la anterior,
 * como un bloque que se va partiendo.
 */
export function crackCanvases(): HTMLCanvasElement[] {
    const rnd = seeded(31);
    const lines: [number, number][][] = [];
    for (let i = 0; i < 10; i++) {
        // Cada grieta arranca cerca del centro y camina hacia afuera.
        let x = 6 + Math.floor(rnd() * 4);
        let y = 6 + Math.floor(rnd() * 4);
        const path: [number, number][] = [[x, y]];
        const dx = rnd() > 0.5 ? 1 : -1;
        const dy = rnd() > 0.5 ? 1 : -1;
        for (let step = 0; step < 4 + i; step++) {
            if (rnd() > 0.5) x += dx;
            else y += dy;
            path.push([x, y]);
        }
        lines.push(path);
    }
    return lines.map((_, stage) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'rgba(20, 16, 12, 0.85)';
        for (const path of lines.slice(0, stage + 1)) {
            for (const [x, y] of path) {
                if (x >= 0 && x < 16 && y >= 0 && y < 16) ctx.fillRect(x, y, 1, 1);
            }
        }
        return canvas;
    });
}

/**
 * Estilos para cuadros, camas y alfombras: temas dibujados por código (sin imágenes de terceros)
 * o una foto que sube la persona. En el objeto se guardan como `tema:<clave>` o como data URL.
 */

export type ThemeKey = 'bloques' | 'dinosaurios' | 'espacio' | 'arcoiris';

export const THEMES: { key: ThemeKey; name: string }[] = [
    { key: 'bloques', name: 'Bloques pixelados' },
    { key: 'dinosaurios', name: 'Dinosaurios' },
    { key: 'espacio', name: 'Espacio' },
    { key: 'arcoiris', name: 'Arcoíris' },
];

/** `poster`: una sola imagen (cuadros). `fabric`: estampado que se repite (camas, alfombras). */
export type TextureUse = 'poster' | 'fabric';

export function themeValue(key: ThemeKey): string {
    return `tema:${key}`;
}

export function themeOf(value: string | undefined): ThemeKey | null {
    const key = value?.startsWith('tema:') ? value.slice(5) : null;
    return THEMES.some((t) => t.key === key) ? (key as ThemeKey) : null;
}

export function isPhoto(value: string | undefined): boolean {
    return !!value && value.startsWith('data:image/');
}

/** Generador pseudoaleatorio con semilla: el mismo tema se dibuja siempre igual. */
function random(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function drawBlocks(ctx: CanvasRenderingContext2D, w: number, h: number, use: TextureUse) {
    const rnd = random(7);
    const px = use === 'poster' ? Math.max(4, Math.round(w / 40)) : Math.round(w / 32);
    const cols = Math.ceil(w / px);
    const rows = Math.ceil(h / px);
    const shade = (base: [number, number, number]) => {
        const k = 0.85 + rnd() * 0.3;
        return `rgb(${base.map((c) => Math.min(255, Math.round(c * k))).join(',')})`;
    };
    const grassLine = use === 'poster' ? Math.round(rows * 0.55) : -1;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let base: [number, number, number];
            if (use === 'fabric') {
                // Estampado de bloques: pasto arriba de cada bloque de tierra, en cuadrados de 8×8 píxeles.
                base = y % 8 < 2 ? [96, 168, 64] : (x + y) % 11 === 0 ? [120, 120, 120] : [134, 96, 67];
            } else if (y < grassLine) {
                base = [125, 180, 240];
            } else if (y < grassLine + 2) {
                base = [96, 168, 64];
            } else if (y > rows - 4) {
                base = [110, 110, 110];
            } else {
                base = [134, 96, 67];
            }
            ctx.fillStyle = shade(base);
            ctx.fillRect(x * px, y * px, px, px);
        }
    }

    if (use === 'poster') {
        // Sol, nube y árbol pixelados.
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(px * Math.round(cols * 0.75), px * 3, px * 4, px * 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px * 4, px * 5, px * 7, px * 2);
        ctx.fillRect(px * 6, px * 4, px * 4, px);
        const tx = Math.round(cols * 0.3);
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(tx * px, (grassLine - 5) * px, px * 2, px * 5);
        ctx.fillStyle = '#2f8f3a';
        ctx.fillRect((tx - 3) * px, (grassLine - 10) * px, px * 8, px * 5);
        ctx.fillStyle = '#3aa648';
        ctx.fillRect((tx - 2) * px, (grassLine - 11) * px, px * 6, px * 2);
    }
}

function dinosaur(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -size : size, size);
    ctx.fillStyle = color;
    // Saurópodo: cuerpo, cuello largo, cabeza, cola y patas.
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.55, -0.3);
    ctx.quadraticCurveTo(1.1, -0.9, 1.15, -1.55);
    ctx.lineTo(1.45, -1.55);
    ctx.quadraticCurveTo(1.35, -0.7, 0.9, 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1.42, -1.62, 0.3, 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.85, -0.2);
    ctx.quadraticCurveTo(-1.6, -0.1, -2.1, 0.35);
    ctx.quadraticCurveTo(-1.5, 0.2, -0.8, 0.3);
    ctx.fill();
    for (const lx of [-0.6, -0.25, 0.3, 0.6]) {
        ctx.fillRect(lx - 0.1, 0.3, 0.22, 0.6);
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(1.5, -1.66, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawDinosaurs(ctx: CanvasRenderingContext2D, w: number, h: number, use: TextureUse) {
    const rnd = random(11);
    const colors = ['#4caf50', '#ff9800', '#9c27b0', '#03a9f4', '#e91e63', '#8bc34a'];
    if (use === 'poster') {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#ffcc80');
        sky.addColorStop(1, '#fff3e0');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        // Volcán.
        ctx.fillStyle = '#795548';
        ctx.beginPath();
        ctx.moveTo(w * 0.55, h * 0.75);
        ctx.lineTo(w * 0.75, h * 0.3);
        ctx.lineTo(w * 0.85, h * 0.3);
        ctx.lineTo(w * 1.05, h * 0.75);
        ctx.fill();
        ctx.fillStyle = '#ff5722';
        ctx.fillRect(w * 0.75, h * 0.28, w * 0.1, h * 0.04);
        ctx.fillStyle = '#8bc34a';
        ctx.fillRect(0, h * 0.75, w, h * 0.25);
        dinosaur(ctx, w * 0.38, h * 0.66, Math.min(w, h) * 0.13, '#2e7d32');
        dinosaur(ctx, w * 0.78, h * 0.8, Math.min(w, h) * 0.06, '#ef6c00', true);
        return;
    }
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(0, 0, w, h);
    const step = w / 4;
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            const cx = x * step + step / 2 + (y % 2) * (step / 2);
            const cy = y * step + step / 2;
            dinosaur(ctx, cx % w, cy, step * 0.16, colors[Math.floor(rnd() * colors.length)], rnd() > 0.5);
        }
    }
}

function drawSpace(ctx: CanvasRenderingContext2D, w: number, h: number, use: TextureUse) {
    const rnd = random(23);
    ctx.fillStyle = '#0d1b3d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (use === 'poster' ? 120 : 80); i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
        const r = rnd() * 2 + 0.5;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
        ctx.fill();
    }
    const planet = (x: number, y: number, r: number, color: string, ring: boolean) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (ring) {
            ctx.strokeStyle = '#ffe082';
            ctx.lineWidth = r * 0.12;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, Math.PI * 2);
            ctx.stroke();
        }
    };
    if (use === 'poster') {
        planet(w * 0.62, h * 0.45, Math.min(w, h) * 0.2, '#ff8a65', true);
        planet(w * 0.22, h * 0.25, Math.min(w, h) * 0.07, '#4fc3f7', false);
    } else {
        planet(w * 0.25, h * 0.3, w * 0.08, '#ff8a65', true);
        planet(w * 0.75, h * 0.7, w * 0.06, '#4fc3f7', false);
        planet(w * 0.7, h * 0.2, w * 0.04, '#aed581', false);
    }
}

function drawRainbow(ctx: CanvasRenderingContext2D, w: number, h: number, use: TextureUse) {
    const colors = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#5e35b1'];
    if (use === 'fabric') {
        const band = h / 12;
        for (let i = 0; i < 12; i++) {
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillRect(0, i * band, w, band);
        }
        return;
    }
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(0, 0, w, h);
    const r = Math.min(w * 0.45, h * 0.75);
    const thick = r / 9;
    colors.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.85, r - i * thick, Math.PI, 0);
        ctx.stroke();
    });
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [
        [w * 0.18, h * 0.85],
        [w * 0.82, h * 0.85],
    ]) {
        ctx.beginPath();
        ctx.arc(x, y, h * 0.09, 0, Math.PI * 2);
        ctx.arc(x + h * 0.1, y - h * 0.04, h * 0.1, 0, Math.PI * 2);
        ctx.arc(x - h * 0.1, y - h * 0.02, h * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }
}

const painters: Record<ThemeKey, typeof drawBlocks> = {
    bloques: drawBlocks,
    dinosaurios: drawDinosaurs,
    espacio: drawSpace,
    arcoiris: drawRainbow,
};

/** Lienzo con el tema dibujado. Para cuadros respeta la proporción del cuadro (`aspect` = ancho / alto). */
export function paintTheme(key: ThemeKey, use: TextureUse, aspect = 1): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const base = 512;
    canvas.width = use === 'poster' && aspect > 1 ? base : Math.round(base * (use === 'poster' ? aspect : 1));
    canvas.height = use === 'poster' && aspect > 1 ? Math.round(base / aspect) : base;
    painters[key](canvas.getContext('2d')!, canvas.width, canvas.height, use);
    return canvas;
}

/** Achica una foto para que entre en el navegador (máx. 768 px de lado, JPEG). */
export async function photoToDataUrl(file: File, maxSide = 768): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
}

import * as THREE from 'three';
import { findCatalogEntry, isOpening } from './catalog';
import { isPhoto, paintTheme, themeOf, type TextureUse } from './textures';
import type { Room, RoomItem, Wall } from './types';

/** La escena trabaja en metros; el modelo, en centímetros. */
export const M = 0.01;
export const WALL_THICKNESS = 0.1;

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Materiales compartidos por color; se liberan con `disposeSharedMaterials`. */
function material(color: string, options: { emissive?: string; roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${options.emissive ?? ''}|${options.roughness ?? 0.8}|${options.metalness ?? 0}`;
    let found = materials.get(key);
    if (!found) {
        found = new THREE.MeshStandardMaterial({
            color,
            roughness: options.roughness ?? 0.8,
            metalness: options.metalness ?? 0,
            emissive: options.emissive ?? '#000000',
        });
        materials.set(key, found);
    }
    return found;
}

export function disposeSharedMaterials() {
    materials.forEach((m) => m.dispose());
    materials.clear();
}

/** Pantalla de lámpara: material propio para poder hacerla brillar cuando está prendida. */
function lampShadeMaterial(color: string): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    m.userData.lampShade = true;
    return m;
}

function shade(color: string, amount: number): string {
    return `#${new THREE.Color(color).offsetHSL(0, 0, amount).getHexString()}`;
}

/** Caja de w × h × d con la base apoyada en `y`. */
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), mat);
    mesh.position.set(x, y + h / 2, z);
    return mesh;
}

function cylinder(rTop: number, rBottom: number, h: number, mat: THREE.Material, y = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 24), mat);
    mesh.position.y = y + h / 2;
    return mesh;
}

type Builder = (w: number, d: number, h: number, color: string) => THREE.Object3D[];

const builders: Record<RoomItem['shape'], Builder> = {
    box: (w, d, h, color) => [box(w, h, d, material(color))],

    window: (w, d, h, color) => {
        const frame = material(color, { roughness: 0.5 });
        const bar = 0.05;
        const glass = new THREE.MeshStandardMaterial({
            color: '#cfe8f7',
            roughness: 0.05,
            metalness: 0.1,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
        });
        const parts: THREE.Object3D[] = [
            box(w, bar, d, frame, 0, 0),
            box(w, bar, d, frame, 0, h - bar),
            box(bar, h, d, frame, -w / 2 + bar / 2),
            box(bar, h, d, frame, w / 2 - bar / 2),
            box(w - 2 * bar, h - 2 * bar, 0.01, glass, 0, bar),
            // Alféizar hacia adentro.
            box(w + 0.06, 0.03, d / 2 + 0.06, material('#eceff1'), 0, -0.03, d / 4 + 0.03),
        ];
        if (w > 0.9) {
            parts.push(box(bar * 0.8, h - 2 * bar, d * 0.8, frame, 0, bar));
        }
        return parts;
    },

    door: (w, d, h, color) => {
        const jamb = 0.06;
        const frame = material('#eeeeee', { roughness: 0.6 });
        const leafMat = material(color, { roughness: 0.55 });
        const handle = material('#9e9e9e', { metalness: 0.7, roughness: 0.3 });
        const leaves = w >= 1.2 ? 2 : 1;
        const leafWidth = (w - 2 * jamb) / leaves;
        const parts: THREE.Object3D[] = [
            box(jamb, h, d + 0.02, frame, -w / 2 + jamb / 2),
            box(jamb, h, d + 0.02, frame, w / 2 - jamb / 2),
            box(w, jamb, d + 0.02, frame, 0, h - jamb),
        ];
        for (let i = 0; i < leaves; i++) {
            const x = -w / 2 + jamb + leafWidth * (i + 0.5);
            parts.push(box(leafWidth - 0.006, h - jamb - 0.01, 0.04, leafMat, x, 0.005, d / 2 - 0.02));
            const side = leaves === 1 ? 1 : i === 0 ? 1 : -1;
            parts.push(box(0.12, 0.02, 0.05, handle, x + side * (leafWidth / 2 - 0.1), h * 0.48, d / 2 + 0.02));
        }
        return parts;
    },

    rug: (w, d, h, color) => [box(w, Math.max(h, 0.005), d, material(color, { roughness: 1 }))],

    bed: (w, d, h, color) => {
        const frame = material(color);
        const base = h * 0.55;
        return [
            box(w, base, d, frame),
            box(w * 0.96, h - base, d * 0.9, material('#f4f1ec'), 0, base, d * 0.04),
            box(w, Math.max(h * 1.9, 0.9), 0.06, material(shade(color, -0.1)), 0, 0, -d / 2 + 0.03),
            box(Math.min(w * 0.4, 0.6), 0.12, 0.35, material('#ffffff'), w > 1.2 ? -w * 0.23 : 0, h, -d / 2 + 0.3),
            ...(w > 1.2 ? [box(Math.min(w * 0.4, 0.6), 0.12, 0.35, material('#ffffff'), w * 0.23, h, -d / 2 + 0.3)] : []),
        ];
    },

    sofa: (w, d, h, color) => {
        const mat = material(color);
        const arm = Math.min(0.2, w * 0.14);
        const back = Math.min(0.25, d * 0.28);
        return [
            box(w, h * 0.5, d, mat),
            box(w - 2 * arm, h * 0.12, d - back, material(shade(color, 0.06)), 0, h * 0.5, back / 2),
            box(w, h, back, material(shade(color, -0.05)), 0, 0, -d / 2 + back / 2),
            box(arm, h * 0.72, d, mat, -w / 2 + arm / 2),
            box(arm, h * 0.72, d, mat, w / 2 - arm / 2),
        ];
    },

    table: (w, d, h, color) => {
        const mat = material(color);
        const leg = Math.min(0.06, w * 0.08, d * 0.08);
        const top = 0.04;
        const lx = w / 2 - leg;
        const lz = d / 2 - leg;
        return [
            box(w, top, d, mat, 0, h - top),
            ...[
                [-lx, -lz],
                [lx, -lz],
                [lx, lz],
                [-lx, lz],
            ].map(([x, z]) => box(leg, h - top, leg, material(shade(color, -0.12)), x, 0, z)),
        ];
    },

    chair: (w, d, h, color) => {
        const mat = material(color);
        const seat = h * 0.5;
        const leg = 0.035;
        const lx = w / 2 - leg;
        const lz = d / 2 - leg;
        return [
            box(w, 0.05, d, mat, 0, seat - 0.05),
            box(w, h - seat, 0.04, mat, 0, seat, -d / 2 + 0.02),
            ...[
                [-lx, -lz],
                [lx, -lz],
                [lx, lz],
                [-lx, lz],
            ].map(([x, z]) => box(leg, seat - 0.05, leg, mat, x, 0, z)),
        ];
    },

    shelf: (w, d, h, color) => {
        const mat = material(color);
        const t = 0.02;
        const levels = Math.max(1, Math.round(h / 0.35) - 1);
        const parts: THREE.Object3D[] = [
            box(t, h, d, mat, -w / 2 + t / 2),
            box(t, h, d, mat, w / 2 - t / 2),
            box(w, t, d, mat, 0, 0),
            box(w, t, d, mat, 0, h - t),
            box(w, h, 0.01, material(shade(color, -0.08)), 0, 0, -d / 2 + 0.005),
        ];
        for (let i = 1; i <= levels; i++) {
            parts.push(box(w - 2 * t, t, d, mat, 0, (h * i) / (levels + 1)));
        }
        return parts;
    },

    wardrobe: (w, d, h, color) => {
        const doors = Math.max(2, Math.round(w / 0.6));
        const line = material(shade(color, -0.25));
        const parts: THREE.Object3D[] = [box(w, h, d, material(color))];
        for (let i = 1; i < doors; i++) {
            parts.push(box(0.006, h * 0.96, 0.006, line, -w / 2 + (w * i) / doors, h * 0.02, d / 2));
        }
        for (let i = 0; i < doors; i++) {
            const x = -w / 2 + (w * (i + 0.5)) / doors + (i % 2 === 0 ? 1 : -1) * (w / doors) * 0.38;
            parts.push(box(0.015, 0.18, 0.025, material('#9e9e9e', { metalness: 0.6, roughness: 0.4 }), x, h * 0.48, d / 2 + 0.012));
        }
        return parts;
    },

    tv: (w, d, h, color) => [
        box(w, h, d, material(color, { roughness: 0.4 })),
        box(w * 0.965, h * 0.93, 0.004, material('#0f172a', { emissive: '#0b1220', roughness: 0.15 }), 0, h * 0.035, d / 2 + 0.002),
    ],

    frame: (w, d, h, color) => {
        const border = Math.min(0.04, w * 0.08, h * 0.08);
        const canvas = box(w - 2 * border, h - 2 * border, 0.004, material(color, { roughness: 0.6 }), 0, border, d / 2 + 0.002);
        canvas.name = 'canvas';
        return [box(w, h, d, material('#3e2723')), canvas];
    },

    plant: (w, d, h, color) => {
        const pot = h * 0.28;
        const radius = Math.min(w, d) / 2;
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material(color));
        leaves.scale.set(w / 2, (h - pot) / 2, d / 2);
        leaves.position.y = pot + (h - pot) / 2;
        return [cylinder(radius * 0.7, radius * 0.55, pot, material('#8d6e63')), leaves];
    },

    lamp: (w, d, h, color) => {
        const radius = Math.min(w, d) / 2;
        const shadeHeight = Math.min(h * 0.3, radius * 1.4);
        return [
            cylinder(radius * 0.6, radius * 0.7, 0.03, material('#424242', { metalness: 0.5, roughness: 0.4 })),
            cylinder(0.012, 0.012, h - shadeHeight, material('#616161', { metalness: 0.5, roughness: 0.4 })),
            cylinder(radius * 0.6, radius, shadeHeight, lampShadeMaterial(color), h - shadeHeight),
        ];
    },
};

/** Lo que cambia la forma del objeto; si no cambió, alcanza con moverlo. */
export function itemSignature(item: RoomItem): string {
    // De una foto alcanza con el largo y la punta: compararla entera en cada cambio es caro.
    const texture = item.texture ? `${item.texture.length}:${item.texture.slice(-48)}` : '';
    return [item.type, item.shape, item.width, item.depth, item.height, item.color, item.lightOn ? 'on' : 'off', texture].join('|');
}

const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

/** Textura de un tema o una foto; se cachea por valor (y por proporción, en los cuadros). */
function loadTexture(value: string, use: TextureUse, aspect: number): THREE.Texture | null {
    const theme = themeOf(value);
    if (!theme && !isPhoto(value)) {
        return null;
    }
    const key = `${use}|${theme ? aspect.toFixed(2) : ''}|${value}`;
    let texture = textureCache.get(key);
    if (!texture) {
        texture = theme ? new THREE.CanvasTexture(paintTheme(theme, use, aspect)) : textureLoader.load(value);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (theme === 'bloques') {
            texture.magFilter = THREE.NearestFilter;
        }
        textureCache.set(key, texture);
    }
    return texture;
}

/**
 * Pone el tema o la foto del objeto: en el lienzo de un cuadro (recortada para llenarlo sin deformarse)
 * o como estampado en la tela de camas y alfombras.
 */
export function applyTexture(group: THREE.Object3D, item: RoomItem) {
    const use = findCatalogEntry(item.type)?.textured;
    if (!use || !item.texture) {
        return;
    }
    const aspect = item.width / item.height;
    const base = loadTexture(item.texture, use, aspect);
    if (!base) {
        return;
    }
    const texture = base.clone();
    texture.needsUpdate = true;

    if (use === 'poster') {
        const canvas = group.getObjectByName('canvas') as THREE.Mesh | undefined;
        if (!canvas) {
            return;
        }
        const fit = () => {
            const image = texture.image as { width?: number; height?: number } | undefined;
            if (!image?.width || !image.height) {
                return;
            }
            const imageAspect = image.width / image.height;
            texture.repeat.set(Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect));
            texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
        };
        fit();
        if (isPhoto(item.texture) && !(texture.image as { width?: number } | undefined)?.width) {
            // La foto todavía está cargando: se recorta cuando llega.
            (base.image as HTMLImageElement | undefined)?.addEventListener?.('load', () => {
                texture.image = base.image;
                fit();
                texture.needsUpdate = true;
            });
        }
        canvas.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
        return;
    }

    // Los modelos traen UV pensadas para una paleta de colores, no para una imagen: en vez de pintar
    // su tela, se le pone encima una funda fina con UV propias que cubre la parte de arriba de la tela.
    group.updateMatrixWorld(true);
    const toGroup = group.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    group.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || child.name === 'fabric-cover') {
            return;
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        if (mats.some((m) => m.userData.fabric)) {
            child.geometry.computeBoundingBox();
            box.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld).applyMatrix4(toGroup));
        }
    });
    if (box.isEmpty()) {
        return;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // Un estampado cada ~60 cm, según lo que mida la tela.
    texture.repeat.set(Math.max(1, size.x / 0.6), Math.max(1, size.z / 0.6));
    const cover = new THREE.Mesh(
        new THREE.BoxGeometry(size.x + 0.01, 0.006, size.z + 0.01),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
    );
    cover.name = 'fabric-cover';
    cover.position.set(center.x, box.max.y + 0.003, center.z);
    cover.receiveShadow = true;
    group.add(cover);
}

/**
 * Grupo 3D de un objeto. El origen queda en el centro de la base;
 * el ancho va sobre X, el fondo sobre Z (frente hacia +Z) y la altura sobre Y.
 */
export function buildItem(item: RoomItem): THREE.Group {
    const group = new THREE.Group();
    const w = item.width * M;
    const d = item.depth * M;
    const h = item.height * M;

    for (const part of builders[item.shape](w, d, h, item.color)) {
        part.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = item.mount !== 'rug';
                child.receiveShadow = true;
            }
        });
        group.add(part);
    }

    addLight(group, item);

    const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.02, h + 0.02, d + 0.02)),
        new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false, transparent: true }),
    );
    outline.position.y = h / 2;
    outline.name = 'outline';
    outline.visible = false;
    outline.renderOrder = 10;
    group.add(outline);

    group.userData.itemId = item.id;
    return group;
}

/** Dónde sale la luz de cada tipo de lámpara, como fracción de su alto. */
const LIGHT_HEIGHT: Record<RoomItem['mount'], number> = { ceiling: 0.15, wall: 0.5, floor: 0.85, rug: 0 };

/** Luz real para las lámparas prendidas; también hace brillar la pantalla. */
function addLight(group: THREE.Group, item: RoomItem) {
    if (!findCatalogEntry(item.type)?.light || !item.lightOn) {
        return;
    }
    const strong = item.mount === 'ceiling';
    const light = new THREE.PointLight('#ffd8a8', strong ? 6 : 2.5, strong ? 9 : 5, 2);
    light.position.set(0, item.height * M * LIGHT_HEIGHT[item.mount], item.mount === 'wall' ? item.depth * M : 0);
    light.name = 'lamp-light';
    group.add(light);
    setLampGlow(group, true);
}

/** Enciende o apaga el brillo de las pantallas de lámpara (procedurales o del modelo). */
export function setLampGlow(group: THREE.Object3D, on: boolean) {
    group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
            return;
        }
        for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
            if (m instanceof THREE.MeshStandardMaterial && m.userData.lampShade) {
                m.emissive.set(on ? '#ffcc80' : '#000000');
                m.emissiveIntensity = on ? 1.4 : 0;
            }
        }
    });
}

/**
 * Cambia la forma simple de un objeto por su modelo 3D cuando termina de cargar.
 * Conserva el contorno de selección y la luz.
 */
export function swapInModel(group: THREE.Group, model: THREE.Object3D, item: RoomItem) {
    for (const child of [...group.children]) {
        if (child.name !== 'outline' && child.name !== 'lamp-light') {
            group.remove(child);
            disposeObject(child);
        }
    }
    group.add(model);
    if (item.lightOn && findCatalogEntry(item.type)?.light) {
        setLampGlow(group, true);
    }
}

/** Ubica el grupo según la posición en planta: x → X, y → Z, elevación → Y; la rotación horaria en planta es negativa en Y. */
export function placeItem(group: THREE.Object3D, item: RoomItem) {
    group.position.set(item.x * M, item.elevation * M, item.y * M);
    group.rotation.set(0, (-item.rotation * Math.PI) / 180, 0);
}

export function setOutline(group: THREE.Object3D, state: 'none' | 'selected' | 'issue' | 'selected-issue' | 'target') {
    const outline = group.getObjectByName('outline') as THREE.LineSegments | undefined;
    if (!outline) {
        return;
    }
    outline.visible = state !== 'none';
    // Lo que está en la mira del recorrido se marca en blanco, como el contorno de un bloque.
    (outline.material as THREE.LineBasicMaterial).color.set(state === 'target' ? '#ffffff' : state === 'selected' ? '#2563eb' : '#dc2626');
}

export interface RoomShell {
    group: THREE.Group;
    walls: { wall: Wall; mesh: THREE.Mesh }[];
}

/** Lo que obliga a rearmar piso y paredes: medidas, colores y la ubicación de ventanas y puertas. */
export function roomSignature(room: Room): string {
    const openings = room.items.filter((i) => isOpening(i)).map((i) => [i.wall, i.x, i.y, i.width, i.height, i.elevation].join(','));
    return [room.width, room.length, room.height, room.wallColor, room.floorColor, ...openings].join('|');
}

/**
 * Pared como un rectángulo extruido con los huecos de sus aberturas. `from`/`to` es el tramo
 * a lo largo de la pared; cada hueco es [desde, hasta] a lo largo y [abajo, arriba] en altura (metros).
 */
function wallGeometry(
    from: number,
    to: number,
    height: number,
    thickness: number,
    holes: { u1: number; u2: number; v1: number; v2: number }[],
): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(from, 0);
    shape.lineTo(to, 0);
    shape.lineTo(to, height);
    shape.lineTo(from, height);
    shape.lineTo(from, 0);

    // Un hueco que toca el piso (puerta) no puede ser un agujero cerrado: se levanta 1 mm y el piso tapa la diferencia.
    for (const h of holes) {
        const u1 = Math.max(h.u1, from + 0.01);
        const u2 = Math.min(h.u2, to - 0.01);
        const v1 = Math.max(h.v1, 0.001);
        const v2 = Math.min(h.v2, height - 0.01);
        if (u2 - u1 < 0.02 || v2 - v1 < 0.02) {
            continue;
        }
        const path = new THREE.Path();
        path.moveTo(u1, v1);
        path.lineTo(u1, v2);
        path.lineTo(u2, v2);
        path.lineTo(u2, v1);
        path.lineTo(u1, v1);
        shape.holes.push(path);
    }

    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
}

/** Piso y paredes. Cada pared tiene su propio material para poder transparentarla cuando tapa la vista. */
export function buildShell(room: Room): RoomShell {
    const group = new THREE.Group();
    const W = room.width * M;
    const L = room.length * M;
    const H = room.height * M;
    const T = WALL_THICKNESS;

    const floor = box(W, 0.02, L, material(room.floorColor, { roughness: 0.9 }), W / 2, -0.02, L / 2);
    floor.receiveShadow = true;
    group.add(floor);

    // Techo mirando hacia abajo: se ve desde adentro (recorrido) y desde arriba queda invisible,
    // porque la cara de atrás no se dibuja. No hace sombra para no tapar la luz del día.
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(W / 2, H, L / 2);
    ceiling.receiveShadow = true;
    group.add(ceiling);

    // Las paredes superior e inferior corren a lo largo de X (y tapan las esquinas); las laterales, a lo largo de Z.
    const specs: { wall: Wall; from: number; to: number; place: (mesh: THREE.Mesh) => void }[] = [
        { wall: 'top', from: -T, to: W + T, place: (m) => m.position.set(0, 0, -T) },
        { wall: 'bottom', from: -T, to: W + T, place: (m) => m.position.set(0, 0, L) },
        { wall: 'left', from: 0, to: L, place: (m) => (m.rotation.y = -Math.PI / 2) },
        {
            wall: 'right',
            from: 0,
            to: L,
            place: (m) => {
                m.rotation.y = -Math.PI / 2;
                m.position.x = W + T;
            },
        },
    ];

    const openings = room.items.filter((i) => isOpening(i));
    const walls = specs.map(({ wall, from, to, place }) => {
        const holes = openings
            .filter((o) => o.wall === wall)
            .map((o) => {
                const along = (wall === 'top' || wall === 'bottom' ? o.x : o.y) * M;
                return { u1: along - (o.width * M) / 2, u2: along + (o.width * M) / 2, v1: o.elevation * M, v2: (o.elevation + o.height) * M };
            });
        const mat = new THREE.MeshStandardMaterial({ color: room.wallColor, roughness: 0.95, transparent: true });
        const mesh = new THREE.Mesh(wallGeometry(from, to, H, T, holes), mat);
        place(mesh);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        group.add(mesh);
        return { wall, mesh };
    });

    return { group, walls };
}

/** True si la cámara está del lado de afuera de la pared (la pared queda entre la cámara y la habitación). */
export function wallFacesAway(wall: Wall, camera: THREE.Vector3, room: Room): boolean {
    switch (wall) {
        case 'top':
            return camera.z < 0;
        case 'bottom':
            return camera.z > room.length * M;
        case 'left':
            return camera.x < 0;
        case 'right':
            return camera.x > room.width * M;
    }
}

export function disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            // La geometría de los modelos 3D es compartida con el archivo cargado: no se libera.
            if (!child.userData.sharedGeometry) {
                child.geometry.dispose();
            }
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            // Los materiales compartidos se liberan aparte; acá sólo los propios.
            mats.filter((m) => ![...materials.values()].includes(m as THREE.MeshStandardMaterial)).forEach((m) => m.dispose());
        }
    });
}

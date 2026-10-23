<script setup lang="ts">
import { useRoomEditor } from '@/composables/useRoomEditor';
import { Herd } from '@/lib/room/animals';
import { findCatalogEntry } from '@/lib/room/catalog';
import { formatCm } from '@/lib/room/format';
import { BREAK_SECONDS, SLOTS, TOOL_DAMAGE, TOOL_NAMES, type Slot, type Tool } from '@/lib/room/inventory';
import { LANDSCAPE_STYLES, LandscapeView, type LandscapeStyle } from '@/lib/room/landscape';
import { buildModel } from '@/lib/room/models';
import { BLOCK_NAMES, blockCanvas, pickaxeCanvas, swordCanvas } from '@/lib/room/pixels';
import { PlayEffects } from '@/lib/room/play';
import { countBlock, missing, RECIPES, type Recipe } from '@/lib/room/recipes';
import {
    applyTexture,
    buildItem,
    buildShell,
    disposeObject,
    disposeSharedMaterials,
    itemSignature,
    M,
    placeItem,
    roomSignature,
    setOutline,
    swapInModel,
    wallFacesAway,
    type RoomShell,
} from '@/lib/room/three-builders';
import type { Room } from '@/lib/room/types';
import { blockSolids, BODY_HEIGHT, BODY_RADIUS, EYE_HEIGHT, REACH, supportHeight, WALK_KEYS, WalkControls, type WalkKey } from '@/lib/room/walk';
import { BLOCK_KINDS, blockKey, generateWorld, parseBlockKey, raycastBlocks, SURFACE, WORLD_FLOOR, type BlockKind } from '@/lib/room/world';
import { Horde, ZOMBIE_HEALTH } from '@/lib/room/zombies';
import { useEventListener } from '@vueuse/core';
import {
    ArrowDown,
    ArrowUp,
    Box,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    Eye,
    Footprints,
    Lightbulb,
    LightbulbOff,
    LogOut,
    Moon,
    RotateCcw,
    RotateCw,
    Sun,
    Trash2,
} from 'lucide-vue-next';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ room: Room }>();

const {
    selectedId,
    selectedItem,
    issues,
    selectItem,
    beginMove,
    moveItemTo,
    rotateItemTo,
    setElevationLive,
    rotateItem,
    updateItem,
    duplicateItem,
    removeItem,
    breakBlock,
    inventory,
    placeBlock,
    pocketItem,
    placeItemFromInventory,
    takeFromInventory,
    giveToInventory,
    craftRecipe,
} = useRoomEditor();

/** Posición en pantalla (px dentro del panel) de la barra del objeto seleccionado. */
const toolbar = ref<{ x: number; y: number } | null>(null);
const toolbarEl = ref<HTMLDivElement | null>(null);
const selected = computed(() => selectedItem.value);
const padButton =
    'flex h-10 w-10 touch-none select-none items-center justify-center rounded-md bg-white/85 text-neutral-700 shadow active:bg-white dark:bg-neutral-800/85 dark:text-neutral-200';
const toolButton = 'rounded p-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-700';

const container = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let shell: RoomShell | null = null;
let shellSignature = '';
let frame = 0;
let resizeObserver: ResizeObserver | null = null;
let sized = false;
const itemObjects = new Map<string, { group: THREE.Group; signature: string }>();
const itemsRoot = new THREE.Group();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let pressed: { x: number; y: number; id: string | null } | null = null;
type Drag =
    | { mode: 'move'; id: string; offset: THREE.Vector3 }
    | { mode: 'lift'; id: string; startY: number; startElevation: number; cmPerPixel: number };
let dragging: Drag | null = null;

function syncShell() {
    const signature = roomSignature(props.room);
    if (shell && signature === shellSignature) {
        return;
    }
    if (shell) {
        scene.remove(shell.group);
        disposeObject(shell.group);
    }
    shell = buildShell(props.room);
    shellSignature = signature;
    scene.add(shell.group);
}

function syncItems() {
    const seen = new Set<string>();
    for (const item of props.room.items) {
        seen.add(item.id);
        const signature = itemSignature(item);
        let entry = itemObjects.get(item.id);
        if (!entry || entry.signature !== signature) {
            if (entry) {
                itemsRoot.remove(entry.group);
                disposeObject(entry.group);
            }
            entry = { group: buildItem(item), signature };
            itemObjects.set(item.id, entry);
            itemsRoot.add(entry.group);
            applyTexture(entry.group, item);
            loadModelFor(item, entry.group);
        }
        placeItem(entry.group, item);
        setOutline(entry.group, outlineFor(item));
    }
    for (const [id, entry] of itemObjects) {
        if (!seen.has(id)) {
            itemsRoot.remove(entry.group);
            disposeObject(entry.group);
            itemObjects.delete(id);
        }
    }
}

/** Mientras carga se ve la forma simple; cuando llega el modelo se reemplaza, si el objeto no cambió entretanto. */
function loadModelFor(item: Room['items'][number], group: THREE.Group) {
    const entry = findCatalogEntry(item.type);
    if (!entry?.model) {
        return;
    }
    const size = new THREE.Vector3(item.width * M, item.height * M, item.depth * M);
    buildModel(entry, size, item.color)
        .then((model) => {
            if (renderer && itemObjects.get(item.id)?.group === group) {
                swapInModel(group, model, item);
                applyTexture(group, item);
            }
        })
        .catch(() => {
            // Sin modelo queda la forma simple.
        });
}

const night = ref(false);

// --- Recorrido en primera persona (estilo juego de bloques) ---
const walking = ref(false);
/** El mouse está capturado por la vista (se mira moviéndolo, sin arrastrar). */
const locked = ref(false);
/** Con mouse se usa la captura del puntero; en pantallas táctiles se mira arrastrando. */
const canLock = typeof document !== 'undefined' && 'exitPointerLock' in document && !window.matchMedia('(pointer: coarse)').matches;
/** Pantalla de fabricar abierta: con E (recetas básicas) o con clic derecho en una mesa de crafteo (todas). */
const crafting = ref<null | 'mano' | 'mesa'>(null);
const paused = computed(() => walking.value && canLock && !locked.value && crafting.value === null && !dead.value);
/** Lo que se está mirando con la mira y lo que se tiene en la mano. */
const targetId = ref<string | null>(null);
const heldId = ref<string | null>(null);
const targetName = computed(() => props.room.items.find((i) => i.id === targetId.value)?.name ?? null);
const heldName = computed(() => props.room.items.find((i) => i.id === heldId.value)?.name ?? null);
let walker: WalkControls;
let looking: { x: number; y: number } | null = null;
let fast = false;
let lastFrame = performance.now();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function requestLock() {
    if (!canLock || !renderer) {
        return;
    }
    try {
        // En algunos navegadores devuelve una promesa que se rechaza si el usuario no hizo clic recién.
        const result = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        result?.catch?.(() => undefined);
    } catch {
        // Sin captura queda en pausa; un clic en la vista la vuelve a pedir.
    }
}

function enterWalk() {
    selectItem(null);
    walking.value = true;
    controls.enabled = false;
    walker.enter(props.room);
    requestLock();
}

function exitWalk() {
    crafting.value = null;
    dead.value = false;
    health.value = MAX_HEALTH;
    dropHeld();
    stopMining();
    setTarget(null);
    setBlockTarget(null);
    // Lo que quedó tirado vuelve al inventario: un mueble del diseño no se pierde por haberlo tirado.
    for (const slot of effects.clear()) {
        giveToInventory(slot);
    }
    walker.exit();
    walking.value = false;
    controls.enabled = true;
    controls.update();
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function pressKey(key: WalkKey, down: boolean) {
    if (down) {
        walker.pressed.add(key);
    } else {
        walker.pressed.delete(key);
    }
}

/** Bloque del paisaje que está en la mira, marcado con un contorno blanco. */
const blockTarget = ref<string | null>(null);
const blockOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
    new THREE.LineBasicMaterial({ color: '#ffffff' }),
);
blockOutline.visible = false;

function setBlockTarget(key: string | null) {
    blockTarget.value = key;
    blockOutline.visible = key !== null;
    if (key) {
        const [ix, iy, iz] = parseBlockKey(key);
        blockOutline.position.set(ix + 0.5, SURFACE + iy - 0.5, iz + 0.5);
    }
}

// --- Inventario, romper y poner ---

/** Lugar elegido de la barra de inventario (0 = el pico). */
const selectedSlot = ref(0);
const selectedStack = computed(() => inventory.value[selectedSlot.value] ?? null);
/** Aviso corto abajo de la mira (inventario lleno, no entra ahí…). */
const toast = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Se está manteniendo apretado el clic izquierdo para romper. */
const mining = ref(false);
let miningKey: string | null = null;
let miningProgress = 0;
/** Golpe de la mano, para animar el ícono de abajo a la derecha. */
const swing = ref(0);
const effects = new PlayEffects();
/** Celda donde iría un bloque nuevo (la cara del bloque que se mira, o el piso). */
let placeCell: string | null = null;

// --- Animales y fabricar ---

let herd: Herd | null = null;
let horde: Horde | null = null;
/** Zombi en la mira (índice) y su vida, para el cartel. */
const zombieTarget = ref<number | null>(null);
const zombieHealth = ref(0);
const kills = ref(0);

/** Vida del jugador: 20 (10 corazones). Se recupera de a poco si no lo golpean. */
const MAX_HEALTH = 20;
const health = ref(MAX_HEALTH);
const dead = ref(false);
/** Destello rojo de la pantalla al recibir un golpe. */
const hurtFlash = ref(0);
let sinceHurt = 0;
let regenTimer = 0;

function hurtPlayer(damage: number) {
    if (damage <= 0 || dead.value) {
        return;
    }
    health.value = Math.max(0, health.value - damage);
    hurtFlash.value++;
    sinceHurt = 0;
    // Empujón hacia atrás de donde se mira.
    const back = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(-6);
    walker.knock(back.x, back.z);
    if (health.value === 0) {
        dead.value = true;
        stopMining();
        walker.pressed.clear();
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }
}

function updateHealth(seconds: number) {
    sinceHurt += seconds;
    regenTimer += seconds;
    if (sinceHurt > 5 && regenTimer > 3 && health.value < MAX_HEALTH) {
        health.value++;
        regenTimer = 0;
    }
}

/** Vuelve a aparecer adentro de la casa con la vida llena; el inventario no se pierde. */
function respawn() {
    dead.value = false;
    health.value = MAX_HEALTH;
    walker.enter(props.room);
    requestLock();
}

/** Corazones: lleno, medio o vacío según la vida. */
const hearts = computed(() =>
    Array.from({ length: MAX_HEALTH / 2 }, (_, i) => (health.value >= (i + 1) * 2 ? 'full' : health.value === i * 2 + 1 ? 'half' : 'empty')),
);
/** Animal en la mira (índice), para empujarlo con clic izquierdo. */
const animalTarget = ref<number | null>(null);
const animalName = computed(() => (animalTarget.value !== null && herd ? herd.nameOf(animalTarget.value) : null));

const recipes = computed(() => RECIPES.filter((r) => crafting.value === 'mesa' || r.station === 'mano'));

function openCrafting(station: 'mano' | 'mesa') {
    stopMining();
    walker.pressed.clear();
    crafting.value = station;
    // Se suelta el mouse para poder hacer clic en las recetas.
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function closeCrafting() {
    crafting.value = null;
    requestLock();
}

function craftOne(recipe: Recipe) {
    if (craftRecipe(recipe.id)) {
        say(`Fabricaste: ${recipe.name}`);
    } else {
        say(missing(inventory.value, recipe).length ? 'Te faltan materiales' : 'No entra en el inventario');
    }
}

function recipeIcon(recipe: Recipe): { src?: string; color?: string; letter?: string } {
    if ('block' in recipe.gives) {
        return { src: blockIcons.value[recipe.gives.block] };
    }
    if ('tool' in recipe.gives) {
        return { src: toolIcons[recipe.gives.tool] };
    }
    const type = recipe.gives.item;
    const entry = findCatalogEntry(type);
    return { color: entry?.color ?? '#9e9e9e', letter: (entry?.name ?? '?').charAt(0) };
}

function say(message: string) {
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), 1800);
}

function selectSlot(index: number) {
    selectedSlot.value = (index + SLOTS) % SLOTS;
}

/** Clic izquierdo: un mueble se guarda en el inventario al toque; un bloque hay que mantenerlo hasta que se rompa. */
function startMining() {
    if (heldId.value) {
        return;
    }
    swing.value++;
    if (zombieTarget.value !== null && horde) {
        const stack = selectedStack.value;
        const damage = stack?.kind === 'tool' ? TOOL_DAMAGE[stack.tool] : 1;
        const died = horde.hit(zombieTarget.value, camera.position, damage);
        if (died) {
            effects.burstAt(died, ['#7aa35f', '#7d6b5a', '#3e4a3d']);
            kills.value++;
            zombieTarget.value = null;
            say('¡Zombi derrotado!');
        }
        return;
    }
    if (animalTarget.value !== null && herd) {
        herd.hit(animalTarget.value, camera.position);
        return;
    }
    if (targetId.value) {
        const name = targetName.value;
        if (pocketItem(targetId.value)) {
            say(`${name} al inventario`);
            setTarget(null);
        } else {
            say('Inventario lleno');
        }
        return;
    }
    mining.value = true;
}

function stopMining() {
    mining.value = false;
    miningKey = null;
    miningProgress = 0;
    effects.setCrack(null);
}

/** Avanza la rotura del bloque en la mira; con el pico es mucho más rápida que con la mano. */
function updateMining(seconds: number) {
    const key = blockTarget.value;
    const kind = key ? landscapeView?.world.blocks.get(key) : undefined;
    if (!mining.value || !key || !kind) {
        miningKey = null;
        miningProgress = 0;
        effects.setCrack(null);
        return;
    }
    if (key !== miningKey) {
        miningKey = key;
        miningProgress = 0;
    }
    const tool = selectedStack.value?.kind === 'tool' && selectedStack.value.tool === 'pico' ? 'pico' : 'hand';
    miningProgress += seconds / BREAK_SECONDS[kind][tool];
    if (Math.floor(miningProgress * 4) !== Math.floor((miningProgress - seconds / BREAK_SECONDS[kind][tool]) * 4)) {
        swing.value++;
    }
    effects.setCrack(key, miningProgress);
    if (miningProgress >= 1) {
        completeBreak(key);
        miningKey = null;
        miningProgress = 0;
        effects.setCrack(null);
    }
}

function completeBreak(key: string) {
    if (!landscapeView) {
        return;
    }
    const kind = landscapeView.remove(key);
    if (!kind) {
        return;
    }
    effects.burst(key, landscapeView.materials[kind]);
    // El dibujo ya está al día: que la sincronización no lo vuelva a aplicar.
    appliedBroken.add(key);
    appliedPlaced.delete(key);
    if (!breakBlock(key, kind)) {
        // Inventario lleno: el bloque queda tirado en el piso, como en los juegos.
        const [ix, iy, iz] = parseBlockKey(key);
        effects.putBack(
            { kind: 'block', block: kind, count: 1 },
            new THREE.Vector3(ix + 0.5, SURFACE + iy - 0.5, iz + 0.5),
            landscapeView.materials[kind],
        );
        say('Inventario lleno');
    }
    setBlockTarget(null);
}

/** Clic derecho: abre la mesa de crafteo si se la mira; si no, pone un bloque, pone un mueble, o agarra/suelta un mueble. */
function useSelected() {
    const stack = selectedStack.value;
    swing.value++;
    if (!heldId.value && blockTarget.value && landscapeView?.world.blocks.get(blockTarget.value) === 'crafting') {
        openCrafting('mesa');
        return;
    }
    if (heldId.value || !stack || stack.kind === 'tool') {
        grabOrDrop();
        return;
    }
    if (stack.kind === 'block') {
        if (!placeCell || !landscapeView) {
            say('Apuntá a un bloque o al piso');
            return;
        }
        if (cellTouchesPlayer(placeCell)) {
            say('Ahí estás parado vos');
            return;
        }
        const kind = placeBlock(placeCell, selectedSlot.value);
        if (kind && landscapeView.add(placeCell, kind)) {
            appliedPlaced.set(placeCell, kind);
        }
        return;
    }
    // Un mueble del inventario va al punto del piso donde apunta la mira.
    const point = aimFloorPoint();
    const id = placeItemFromInventory(selectedSlot.value, { x: point.x / M, y: point.z / M });
    if (id) {
        say(`${stack.item.name} puesto`);
    }
}

/** Q: tira uno de lo elegido (o suelta el mueble que se lleva agarrado). */
function throwSelected() {
    if (heldId.value) {
        dropHeld();
        return;
    }
    const taken = takeFromInventory(selectedSlot.value);
    if (!taken) {
        return;
    }
    const direction = camera.getWorldDirection(new THREE.Vector3());
    effects.drop(
        taken,
        camera.position
            .clone()
            .addScaledVector(direction, 0.5)
            .add(new THREE.Vector3(0, -0.4, 0)),
        direction,
        dropMaterial(taken),
    );
}

function dropMaterial(slot: Exclude<Slot, null>): THREE.Material | THREE.Material[] | string {
    if (slot.kind === 'block' && landscapeView) {
        return landscapeView.materials[slot.block];
    }
    return slot.kind === 'item' ? slot.item.color : '#9e9e9e';
}

/** La celda de un bloque nuevo no puede pisar al jugador. */
function cellTouchesPlayer(key: string): boolean {
    const [ix, iy, iz] = parseBlockKey(key);
    const feet = camera.position.y - EYE_HEIGHT;
    const bottom = SURFACE + iy - 1;
    const near =
        camera.position.x > ix - BODY_RADIUS &&
        camera.position.x < ix + 1 + BODY_RADIUS &&
        camera.position.z > iz - BODY_RADIUS &&
        camera.position.z < iz + 1 + BODY_RADIUS;
    return near && bottom < feet + BODY_HEIGHT && bottom + 1 > feet;
}

/** Punto del piso donde apunta la mira (o lo más lejos que llega la mano). */
function aimFloorPoint(): THREE.Vector3 {
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, point) || point.distanceTo(camera.position) > REACH) {
        raycaster.ray.at(REACH, point);
    }
    return point;
}

/** Ícono de cada lugar de la barra: el pico, la cara del bloque, o el color del mueble con su inicial. */
const blockIcons = computed(() => {
    const style = LANDSCAPE_STYLES[props.room.outside === 'bloques' ? 'dia' : 'atardecer'];
    const palettes = { log: style.log, leaves: style.leaves };
    return Object.fromEntries(BLOCK_KINDS.map((k) => [k, blockCanvas(k, palettes).toDataURL()])) as Record<BlockKind, string>;
});
/** Íconos de las herramientas: el pico y las espadas (dibujos pixelados propios). */
const toolIcons: Record<Tool, string> = {
    pico: pickaxeCanvas().toDataURL(),
    'espada-madera': swordCanvas('madera').toDataURL(),
    'espada-piedra': swordCanvas('piedra').toDataURL(),
};

function slotLabel(slot: Slot): string {
    if (!slot) return 'Vacío';
    if (slot.kind === 'tool') return TOOL_NAMES[slot.tool];
    if (slot.kind === 'block') return BLOCK_NAMES[slot.block];
    return slot.item.name;
}

/** Clic derecho: agarra lo que se está mirando, o suelta lo que se tiene en la mano. */
function grabOrDrop() {
    if (heldId.value) {
        dropHeld();
    } else if (targetId.value) {
        beginMove();
        heldId.value = targetId.value;
        setTarget(null);
    }
}

function dropHeld() {
    heldId.value = null;
}

function rotateHeld() {
    const item = props.room.items.find((i) => i.id === heldId.value);
    if (item) {
        rotateItemTo(item.id, item.rotation + 90);
    }
}

function outlineFor(item: Room['items'][number]): Parameters<typeof setOutline>[1] {
    if (item.id === targetId.value || item.id === heldId.value) {
        return 'target';
    }
    const selected = item.id === selectedId.value;
    const issue = issues.value.has(item.id);
    return selected && issue ? 'selected-issue' : selected ? 'selected' : issue ? 'issue' : 'none';
}

function setTarget(id: string | null) {
    if (id === targetId.value) {
        return;
    }
    const previous = targetId.value;
    targetId.value = id;
    for (const changed of [previous, id]) {
        const item = props.room.items.find((i) => i.id === changed);
        const group = changed ? itemObjects.get(changed)?.group : undefined;
        if (item && group) {
            setOutline(group, outlineFor(item));
        }
    }
}

/** Cada cuadro: qué hay en la mira y, si se lleva algo, dónde va a quedar. */
function updateHands() {
    walker.aim(raycaster);
    if (heldId.value) {
        const held = props.room.items.find((i) => i.id === heldId.value);
        if (!held) {
            heldId.value = null;
            return;
        }
        // Va al punto del piso donde apunta la mira (o lo más lejos que llega la mano).
        const point = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(floorPlane, point) || point.distanceTo(camera.position) > REACH) {
            raycaster.ray.at(REACH, point);
        }
        const x = point.x / M;
        const y = point.z / M;
        if (Math.abs(x - held.x) > 1 || Math.abs(y - held.y) > 1) {
            moveItemTo(held.id, { x, y });
        }
        return;
    }
    // Muebles y la casa con el rayo de Three.js (paredes y piso tapan lo que hay detrás); los bloques,
    // celda por celda. Gana lo más cercano.
    const targets: THREE.Object3D[] = [itemsRoot, ...(shell ? [shell.group] : []), ...(herd ? [herd.group] : []), ...(horde ? [horde.group] : [])];
    const hit = raycaster.intersectObjects(targets, true).find((h) => h.object.name !== 'outline');
    const animal = hit && herd ? herd.animalAt(hit.object) : null;
    const zombie = hit && horde ? horde.zombieAt(hit.object) : null;
    const block = landscapeView ? raycastBlocks(landscapeView.world, raycaster.ray.origin, raycaster.ray.direction, REACH) : null;
    animalTarget.value = null;
    zombieTarget.value = null;
    if (block && (!hit || block.distance < hit.distance)) {
        setTarget(null);
        setBlockTarget(block.key);
        placeCell = block.before;
    } else if (zombie !== null) {
        setTarget(null);
        setBlockTarget(null);
        placeCell = null;
        zombieTarget.value = zombie;
        zombieHealth.value = horde!.healthOf(zombie);
    } else if (animal !== null) {
        setTarget(null);
        setBlockTarget(null);
        placeCell = null;
        animalTarget.value = animal;
    } else {
        const itemId = hit ? itemIdOf(hit.object) : null;
        setTarget(itemId);
        setBlockTarget(null);
        // Sobre el piso (de la casa o del llano) un bloque nuevo va en la celda de ese punto, apoyado.
        placeCell = null;
        if (!itemId && hit && hit.point.y < 0.05 && hit.face && hit.face.normal.y > 0.5) {
            placeCell = blockKey(Math.floor(hit.point.x), 1, Math.floor(hit.point.z));
        } else if (!hit && !landscapeView?.world.terrain) {
            const point = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(floorPlane, point) && point.distanceTo(camera.position) <= REACH) {
                placeCell = blockKey(Math.floor(point.x), 1, Math.floor(point.z));
            }
        }
    }
}

// En captura, para ganarle a los atajos del editor (flechas, R, Supr) mientras se recorre.
useEventListener(
    window,
    'keydown',
    (event: KeyboardEvent) => {
        if (!walking.value) {
            return;
        }
        fast = event.shiftKey;
        const name = event.key.toLowerCase();
        const key = WALK_KEYS[name];
        const digit = /^[1-9]$/.test(name) ? Number(name) - 1 : null;
        const handled = !!key || digit !== null || [' ', 'escape', 'r', 'q', 'e', 'shift'].includes(name);
        if (handled) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        if (crafting.value !== null) {
            // Con la pantalla de fabricar abierta, E o Esc la cierran; el resto de las teclas no hace nada.
            if (name === 'e' || name === 'escape') {
                closeCrafting();
            }
            return;
        }
        if (name === 'escape') {
            exitWalk();
        } else if (name === 'e') {
            openCrafting('mano');
        } else if (key) {
            pressKey(key, true);
        } else if (name === ' ') {
            walker.jump();
        } else if (name === 'r') {
            rotateHeld();
        } else if (name === 'q') {
            throwSelected();
        } else if (digit !== null) {
            selectSlot(digit);
        }
    },
    { capture: true },
);
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
    fast = event.shiftKey;
    const key = WALK_KEYS[event.key.toLowerCase()];
    if (walking.value && key) {
        pressKey(key, false);
    }
});
useEventListener(window, 'blur', () => walker?.pressed.clear());
useEventListener(document, 'pointerlockchange', () => {
    locked.value = !!renderer && document.pointerLockElement === renderer.domElement;
    if (!locked.value) {
        walker?.pressed.clear();
    }
});
// La rueda del mouse recorre la barra de inventario.
useEventListener(document, 'wheel', (event: WheelEvent) => {
    if (walking.value && locked.value && event.deltaY !== 0) {
        selectSlot(selectedSlot.value + Math.sign(event.deltaY));
    }
});
useEventListener(window, 'mouseup', (event: MouseEvent) => {
    if (event.button === 0) {
        stopMining();
    }
});
useEventListener(document, 'mousemove', (event: MouseEvent) => {
    if (walking.value && locked.value) {
        walker.look(event.movementX, event.movementY);
    }
});
let hemisphere: THREE.HemisphereLight;
let sun: THREE.DirectionalLight;

function applyDaylight() {
    const style = landscapeStyle ? LANDSCAPE_STYLES[landscapeStyle] : null;
    hemisphere.intensity = night.value ? 0.12 : 1.6;
    hemisphere.color.set(style?.hemisphere ?? '#ffffff');
    sun.intensity = night.value ? 0 : 1.8;
    sun.color.set(style?.sunLight ?? '#ffffff');
    // De noche se esconde el cielo pintado y se apaga la bruma; sin paisaje queda el degradé del panel.
    const sky = landscapeView?.group.getObjectByName('sky');
    const sunDisc = landscapeView?.group.getObjectByName('sun');
    if (sky) sky.visible = !night.value;
    if (sunDisc) sunDisc.visible = !night.value;
    scene.fog = style && !night.value ? new THREE.Fog(style.fog, 30, 140) : null;
    renderer?.setClearColor('#0b1020', night.value ? 1 : 0);
}

let landscapeView: LandscapeView | null = null;
let landscapeStyle: LandscapeStyle | null = null;
let landscapeSignature = '';
/** Bloques rotos y puestos que ya están en el dibujo, para aplicar sólo lo nuevo (o rearmar si se deshizo algo). */
let appliedBroken = new Set<string>();
let appliedPlaced = new Map<string, BlockKind>();

/**
 * Mundo de bloques alrededor de la casa. Siempre existe (para poder poner bloques); con la vista
 * "sólo cielo" no tiene terreno. Se rearma si cambia el tamaño o el estilo, o si se deshace algo.
 */
function syncLandscape() {
    const outside = props.room.outside ?? 'atardecer';
    const style: LandscapeStyle | null = outside === 'atardecer' ? 'atardecer' : outside === 'bloques' ? 'dia' : null;
    const signature = `${style ?? 'cielo'}:${props.room.width}x${props.room.length}`;
    const broken = props.room.world?.broken ?? [];
    const placed = props.room.world?.placed ?? [];

    if (signature === landscapeSignature && landscapeView) {
        const placedNow = new Map(placed);
        const undone =
            [...appliedBroken].some((key) => !broken.includes(key)) || [...appliedPlaced].some(([key, kind]) => placedNow.get(key) !== kind);
        if (!undone) {
            for (const key of broken) {
                if (!appliedBroken.has(key) && !placedNow.has(key)) {
                    landscapeView.remove(key);
                }
                appliedBroken.add(key);
            }
            for (const [key, kind] of placed) {
                if (!appliedPlaced.has(key)) {
                    landscapeView.add(key, kind);
                    appliedPlaced.set(key, kind);
                }
            }
            return;
        }
    }

    if (landscapeView) {
        scene.remove(landscapeView.group);
        landscapeView.dispose();
        landscapeView = null;
    }
    landscapeView = new LandscapeView(props.room, style, generateWorld(props.room, style, broken, placed));
    scene.add(landscapeView.group);
    if (herd) {
        scene.remove(herd.group);
        herd.dispose();
    }
    herd = new Herd(props.room, landscapeView.world);
    scene.add(herd.group);
    if (horde) {
        scene.remove(horde.group);
        horde.dispose();
    }
    horde = new Horde(props.room, landscapeView.world, groundAt);
    scene.add(horde.group);
    appliedBroken = new Set(broken);
    appliedPlaced = new Map(placed);
    landscapeStyle = style;
    landscapeSignature = signature;
    applyDaylight();
}

watch(night, () => {
    if (renderer) {
        applyDaylight();
    }
});

const selectedHasLight = computed(() => !!(selected.value && findCatalogEntry(selected.value.type)?.light));

function center(): THREE.Vector3 {
    return new THREE.Vector3((props.room.width * M) / 2, 0.6, (props.room.length * M) / 2);
}

function resetCamera(view: 'perspective' | 'top' = 'perspective') {
    const target = center();
    const span = Math.hypot(props.room.width, props.room.length) * M;
    // Distancia para que entre toda la habitación, también cuando el panel es más alto que ancho.
    const fit = (span * 0.42) / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
    controls.target.copy(target);
    if (view === 'top') {
        camera.position.set(target.x, fit + props.room.height * M, target.z + 0.01);
    } else {
        const direction = new THREE.Vector3(0.45, 0.75, 0.9).normalize();
        camera.position.copy(target).addScaledVector(direction, fit);
    }
    controls.update();
}

function updateWalls() {
    if (!shell) {
        return;
    }
    for (const { wall, mesh } of shell.walls) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        // En el recorrido las paredes son paredes: no se transparentan aunque se esté afuera.
        const blocking = !walking.value && wallFacesAway(wall, camera.position, props.room);
        material.opacity = blocking ? 0.08 : 1;
        material.depthWrite = !blocking;
        mesh.castShadow = !blocking;
    }
}

/** Ubica la barra flotante arriba del objeto seleccionado. */
function updateToolbar() {
    const item = walking.value ? null : selected.value;
    const el = container.value;
    if (!item || !el) {
        toolbar.value = null;
        return;
    }
    const top = new THREE.Vector3(item.x * M, (item.elevation + item.height) * M, item.y * M).project(camera);
    if (top.z > 1) {
        toolbar.value = null;
        return;
    }
    // Que la barra no se salga del panel aunque el objeto esté contra el borde.
    const half = (toolbarEl.value?.offsetWidth ?? 0) / 2 + 4;
    const tall = (toolbarEl.value?.offsetHeight ?? 0) + 14;
    const x = Math.round(Math.min(Math.max(((top.x + 1) / 2) * el.clientWidth, half), el.clientWidth - half));
    const y = Math.round(Math.min(Math.max(((1 - top.y) / 2) * el.clientHeight, tall), el.clientHeight));
    if (toolbar.value?.x !== x || toolbar.value?.y !== y) {
        toolbar.value = { x, y };
    }
}

/** Altura del piso debajo de un punto, para lo que se tira (cae sobre la casa, los bloques o el llano). */
function groundAt(x: number, z: number, y: number): number {
    const inside = x >= 0 && z >= 0 && x <= props.room.width * M && z <= props.room.length * M;
    const world = landscapeView?.world ?? null;
    const base = inside ? 0 : world?.terrain ? SURFACE + WORLD_FLOOR - 1 : SURFACE;
    return supportHeight(blockSolids(world, x, z, y - 0.5), x, z, y, base);
}

function render() {
    frame = requestAnimationFrame(render);
    const now = performance.now();
    herd?.update((now - lastFrame) / 1000, groundAt);
    // Los zombis sólo persiguen mientras se recorre (y no en pausa, fabricando o muerto).
    const playing = walking.value && !paused.value && crafting.value === null && !dead.value;
    const feetNow = playing ? camera.position.clone().setY(camera.position.y - EYE_HEIGHT) : null;
    const hits = horde?.update((now - lastFrame) / 1000, feetNow, night.value) ?? 0;
    if (playing) {
        hurtPlayer(hits);
    }
    if (walking.value) {
        if (!paused.value && crafting.value === null && !dead.value) {
            const seconds = (now - lastFrame) / 1000;
            updateHealth(seconds);
            walker.update(seconds, props.room, { fast, ignoreId: heldId.value, world: landscapeView?.world ?? null });
            updateHands();
            updateMining(seconds);
            const feet = camera.position.clone().setY(camera.position.y - EYE_HEIGHT);
            for (const slot of effects.update(seconds, groundAt, feet)) {
                if (giveToInventory(slot)) {
                    say(`+1 ${slotLabel(slot)}`);
                } else {
                    effects.putBack(slot, feet.clone().setY(feet.y + 0.5), dropMaterial(slot));
                    say('Inventario lleno');
                }
            }
        }
    } else {
        controls.update();
    }
    lastFrame = now;
    updateWalls();
    updateToolbar();
    renderer?.render(scene, camera);
}

function setPointer(event: PointerEvent) {
    const rect = renderer!.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
}

function itemIdOf(object: THREE.Object3D | null): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
        if (typeof current.userData.itemId === 'string') {
            return current.userData.itemId;
        }
        current = current.parent;
    }
    return null;
}

/** La captura puede fallar (puntero ya liberado); el arrastre sigue funcionando sin ella. */
function capturePointer(element: Element, pointerId: number) {
    try {
        element.setPointerCapture(pointerId);
    } catch {
        // Sin captura, el arrastre se corta si el puntero sale del panel.
    }
}

function onPointerDown(event: PointerEvent) {
    if (walking.value) {
        if (canLock) {
            // Con el mouse capturado: izquierdo quita, derecho agarra o suelta. En pausa, un clic retoma.
            if (!locked.value) {
                requestLock();
            } else if (event.button === 0) {
                startMining();
            } else if (event.button === 2) {
                useSelected();
            }
        } else if (event.button === 0) {
            looking = { x: event.clientX, y: event.clientY };
            capturePointer(renderer!.domElement, event.pointerId);
        }
        return;
    }
    if (event.button !== 0) {
        return;
    }
    setPointer(event);
    const hit = raycaster.intersectObject(itemsRoot, true).find((h) => h.object.name !== 'outline');
    const id = hit ? itemIdOf(hit.object) : null;
    pressed = { x: event.clientX, y: event.clientY, id };

    if (hit && id) {
        const item = props.room.items.find((i) => i.id === id);
        if (item) {
            selectItem(id);
            if (event.shiftKey) {
                // Con Shift se sube o se baja: cuántos cm representa un píxel a la distancia del objeto.
                const visible = 2 * hit.distance * Math.tan((camera.fov * Math.PI) / 360);
                const cmPerPixel = visible / M / renderer!.domElement.clientHeight;
                dragging = { mode: 'lift', id, startY: event.clientY, startElevation: item.elevation, cmPerPixel };
            } else {
                // Arrastre sobre un plano horizontal a la altura donde se agarró el objeto.
                dragPlane.constant = -hit.point.y;
                dragging = { mode: 'move', id, offset: new THREE.Vector3(hit.point.x - item.x * M, 0, hit.point.z - item.y * M) };
            }
            controls.enabled = false;
            beginMove();
            capturePointer(renderer!.domElement, event.pointerId);
        }
    }
}

function onPointerMove(event: PointerEvent) {
    if (looking) {
        walker.look(event.clientX - looking.x, event.clientY - looking.y, 0.005);
        looking = { x: event.clientX, y: event.clientY };
        return;
    }
    if (!dragging) {
        return;
    }
    if (dragging.mode === 'lift') {
        setElevationLive(dragging.id, dragging.startElevation + (dragging.startY - event.clientY) * dragging.cmPerPixel);
        return;
    }
    setPointer(event);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, point)) {
        moveItemTo(dragging.id, { x: (point.x - dragging.offset.x) / M, y: (point.z - dragging.offset.z) / M });
    }
}

function onPointerUp(event: PointerEvent) {
    if (looking) {
        looking = null;
        if (renderer?.domElement.hasPointerCapture(event.pointerId)) {
            renderer.domElement.releasePointerCapture(event.pointerId);
        }
        return;
    }
    if (pressed && !pressed.id && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 4) {
        selectItem(null);
    }
    if (dragging && renderer?.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
    }
    pressed = null;
    dragging = null;
    if (controls) {
        controls.enabled = true;
    }
}

onMounted(() => {
    const el = container.value!;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.classList.add('block', 'h-full', 'w-full', 'touch-none');
    el.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 700);
    // Antes que OrbitControls, para poder desactivarlo cuando se agarra un objeto.
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    // El clic derecho agarra cosas en el recorrido: sin menú contextual sobre la vista.
    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    controls = new OrbitControls(camera, renderer.domElement);
    walker = new WalkControls(camera);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 0.5;
    controls.maxDistance = 60;

    hemisphere = new THREE.HemisphereLight('#ffffff', '#b9a48c', 1.6);
    scene.add(hemisphere);
    sun = new THREE.DirectionalLight('#ffffff', 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target);
    scene.add(itemsRoot);
    scene.add(blockOutline);
    scene.add(effects.group);

    const placeSun = () => {
        const target = center();
        const span = Math.max(props.room.width, props.room.length) * M;
        sun.position.set(target.x + span * 0.4, props.room.height * M + span, target.z + span * 0.6);
        sun.target.position.copy(target);
        const cam = sun.shadow.camera;
        cam.left = cam.bottom = -span;
        cam.right = cam.top = span;
        cam.far = span * 4 + 10;
        cam.updateProjectionMatrix();
    };

    syncShell();
    syncItems();
    syncLandscape();
    placeSun();
    applyDaylight();
    resetCamera();

    resizeObserver = new ResizeObserver(() => {
        const { clientWidth, clientHeight } = el;
        if (!renderer || clientWidth === 0 || clientHeight === 0) {
            return;
        }
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        if (!sized) {
            // La primera vez recién ahora se conoce la proporción del panel.
            sized = true;
            resetCamera();
        }
    });
    resizeObserver.observe(el);

    watch(
        () => [props.room.width, props.room.length, props.room.height],
        () => {
            placeSun();
        },
    );
    watch(
        () => props.room.id,
        () => {
            if (walking.value) {
                exitWalk();
            }
            resetCamera();
        },
    );

    render();
});

watch(
    () => props.room,
    () => {
        if (renderer) {
            syncShell();
            syncItems();
            syncLandscape();
        }
    },
    { deep: true },
);

watch([selectedId, issues], () => {
    if (renderer) {
        syncItems();
    }
});

onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    controls?.dispose();
    for (const { group } of itemObjects.values()) {
        disposeObject(group);
    }
    itemObjects.clear();
    itemsRoot.clear();
    if (shell) {
        disposeObject(shell.group);
    }
    landscapeView?.dispose();
    effects.dispose();
    herd?.dispose();
    horde?.dispose();
    disposeSharedMaterials();
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = null;
});
</script>

<template>
    <div class="relative h-full w-full">
        <div ref="container" class="h-full w-full" />
        <!-- Barra del objeto seleccionado -->
        <div
            v-if="selected && toolbar"
            ref="toolbarEl"
            class="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border bg-white/95 p-1 text-neutral-700 shadow-md dark:bg-neutral-800/95 dark:text-neutral-200"
            :style="{ left: `${toolbar.x}px`, top: `${toolbar.y - 10}px` }"
            @pointerdown.stop
        >
            <span class="whitespace-nowrap px-1.5 text-xs font-medium">{{ selected.name }}</span>
            <span class="whitespace-nowrap pr-1 text-[11px] text-neutral-500">{{ formatCm(selected.elevation) }} del piso</span>
            <button
                v-if="selectedHasLight"
                type="button"
                :class="toolButton"
                :title="selected.lightOn ? 'Apagar' : 'Prender'"
                @click="updateItem(selected.id, { lightOn: !selected.lightOn })"
            >
                <Lightbulb v-if="selected.lightOn" class="h-4 w-4 text-amber-500" />
                <LightbulbOff v-else class="h-4 w-4" />
            </button>
            <template v-if="selected.mount !== 'wall'">
                <button type="button" :class="toolButton" title="Girar 90° a la izquierda" @click="rotateItem(selected.id, -90)">
                    <RotateCcw class="h-4 w-4" />
                </button>
                <button type="button" :class="toolButton" title="Girar 90° a la derecha" @click="rotateItem(selected.id, 90)">
                    <RotateCw class="h-4 w-4" />
                </button>
            </template>
            <template v-if="selected.mount !== 'ceiling'">
                <button
                    type="button"
                    :class="toolButton"
                    title="Subir 5 cm (Shift + arrastrar para subir o bajar)"
                    @click="updateItem(selected.id, { elevation: selected.elevation + 5 })"
                >
                    <ArrowUp class="h-4 w-4" />
                </button>
                <button
                    type="button"
                    :class="toolButton"
                    title="Bajar 5 cm"
                    :disabled="selected.elevation <= 0"
                    @click="updateItem(selected.id, { elevation: Math.max(0, selected.elevation - 5) })"
                >
                    <ArrowDown class="h-4 w-4" />
                </button>
            </template>
            <button type="button" :class="toolButton" title="Duplicar" @click="duplicateItem(selected.id)"><Copy class="h-4 w-4" /></button>
            <button type="button" :class="[toolButton, 'text-red-600']" title="Quitar" @click="removeItem(selected.id)">
                <Trash2 class="h-4 w-4" />
            </button>
        </div>
        <div class="absolute right-2 top-2 flex gap-1">
            <button
                v-if="!walking"
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Caminar por la habitación a la altura de los ojos"
                @click="enterWalk"
            >
                <Footprints class="h-3.5 w-3.5" /> Recorrer
            </button>
            <button
                v-else
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Salir del recorrido (Esc)"
                @click="exitWalk"
            >
                <LogOut class="h-3.5 w-3.5" /> Salir
            </button>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                :title="night ? 'Ver con luz de día' : 'Ver de noche, sólo con las lámparas'"
                :aria-pressed="night"
                @click="night = !night"
            >
                <Sun v-if="night" class="h-3.5 w-3.5" />
                <Moon v-else class="h-3.5 w-3.5" />
                {{ night ? 'Día' : 'Noche' }}
            </button>
            <button
                v-if="!walking"
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Volver a la vista inicial"
                @click="resetCamera()"
            >
                <RotateCcw class="h-3.5 w-3.5" /> Centrar
            </button>
            <button
                v-if="!walking"
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Ver desde arriba"
                @click="resetCamera('top')"
            >
                <Eye class="h-3.5 w-3.5" /> Desde arriba
            </button>
        </div>
        <!-- Mira, como en los juegos de bloques -->
        <div v-if="walking && !paused" class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div class="relative h-5 w-5 mix-blend-difference">
                <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white" />
                <span class="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white" />
            </div>
        </div>
        <!-- Qué hay en la mira o qué se lleva en la mano -->
        <div
            v-if="walking && !paused && !crafting && !dead && (heldName || targetName || blockTarget || animalName || zombieTarget !== null)"
            class="pointer-events-none absolute left-1/2 top-1/2 mt-6 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-2 py-0.5 text-xs text-white"
        >
            <template v-if="heldName">Llevás: {{ heldName }} · clic derecho para soltar · R para girar</template>
            <template v-else-if="zombieTarget !== null">Zombi · vida {{ zombieHealth }}/{{ ZOMBIE_HEALTH }} · clic izquierdo para pegarle</template>
            <template v-else-if="animalName">{{ animalName }} · clic izquierdo para empujarla</template>
            <template v-else-if="blockTarget && landscapeView?.world.blocks.get(blockTarget) === 'crafting'"
                >Mesa de crafteo · clic derecho para fabricar</template
            >
            <template v-else-if="targetName">{{ targetName }} · clic izquierdo lo guarda · clic derecho lo agarra</template>
            <template v-else>Bloque · mantené el clic izquierdo para romperlo</template>
        </div>
        <!-- Aviso corto (inventario lleno, +1 madera…) -->
        <div
            v-if="walking && toast"
            class="pointer-events-none absolute left-1/2 top-1/2 mt-14 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white"
        >
            {{ toast }}
        </div>
        <!-- Lo que se tiene en la mano: se sacude con cada golpe -->
        <div v-if="walking && !paused && selectedStack" class="pointer-events-none absolute bottom-16 right-6 sm:bottom-6">
            <div :key="swing" class="hand-swing">
                <img
                    v-if="selectedStack.kind === 'tool'"
                    :src="toolIcons[selectedStack.tool]"
                    :alt="slotLabel(selectedStack)"
                    class="h-24 w-24 -rotate-12 drop-shadow-lg"
                    style="image-rendering: pixelated"
                />
                <img
                    v-else-if="selectedStack.kind === 'block'"
                    :src="blockIcons[selectedStack.block]"
                    :alt="slotLabel(selectedStack)"
                    class="h-20 w-20 rotate-12 rounded-sm shadow-lg"
                    style="image-rendering: pixelated"
                />
                <div
                    v-else
                    class="flex h-20 w-20 rotate-12 items-center justify-center rounded-md text-2xl font-bold text-white shadow-lg"
                    :style="{ backgroundColor: selectedStack.item.color }"
                >
                    {{ selectedStack.item.name.charAt(0) }}
                </div>
            </div>
        </div>
        <!-- Vida: 10 corazones arriba de la barra -->
        <div v-if="walking" class="pointer-events-none absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-0.5 sm:bottom-16">
            <span
                v-for="(heart, index) in hearts"
                :key="index"
                :class="[
                    'text-base leading-none drop-shadow',
                    heart === 'empty' ? 'text-black/40' : 'text-red-500',
                    heart === 'half' ? 'opacity-60' : '',
                ]"
                >♥</span
            >
        </div>
        <!-- Destello rojo al recibir un golpe -->
        <div v-if="walking && hurtFlash > 0" :key="hurtFlash" class="hurt-flash pointer-events-none absolute inset-0" />
        <!-- Zombis derrotados -->
        <div
            v-if="walking && kills > 0"
            class="pointer-events-none absolute right-2 top-12 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white"
        >
            Zombis: {{ kills }}
        </div>
        <!-- Sin vida: reaparecer en la casa -->
        <div
            v-if="walking && dead"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-red-950/70 text-white"
            @pointerdown.stop
        >
            <p class="text-xl font-bold">¡Te atraparon los zombis!</p>
            <p class="text-sm text-white/80">Volvés a aparecer adentro de la casa, con todo tu inventario.</p>
            <div class="flex gap-2">
                <button
                    type="button"
                    class="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
                    @click="respawn"
                >
                    Reaparecer
                </button>
                <button type="button" class="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30" @click="exitWalk">
                    Salir
                </button>
            </div>
        </div>
        <!-- Barra de inventario: 9 lugares, el pico primero. 1-9 o la rueda para elegir. -->
        <div v-if="walking" class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-md bg-black/45 p-1" @pointerdown.stop>
            <button
                v-for="(slot, index) in inventory"
                :key="index"
                type="button"
                :title="`${index + 1}: ${slotLabel(slot)}`"
                :aria-label="`Lugar ${index + 1}: ${slotLabel(slot)}`"
                :aria-pressed="selectedSlot === index"
                :class="[
                    'relative flex h-9 w-9 items-center justify-center rounded-sm border-2 bg-white/10 sm:h-11 sm:w-11',
                    selectedSlot === index ? 'border-white' : 'border-white/20',
                ]"
                @click="selectSlot(index)"
            >
                <img
                    v-if="slot?.kind === 'tool'"
                    :src="toolIcons[slot.tool]"
                    alt=""
                    class="h-7 w-7 sm:h-8 sm:w-8"
                    style="image-rendering: pixelated"
                />
                <img
                    v-else-if="slot?.kind === 'block'"
                    :src="blockIcons[slot.block]"
                    alt=""
                    class="h-6 w-6 sm:h-7 sm:w-7"
                    style="image-rendering: pixelated"
                />
                <span
                    v-else-if="slot?.kind === 'item'"
                    class="flex h-6 w-6 items-center justify-center rounded-sm text-[11px] font-bold text-white sm:h-7 sm:w-7"
                    :style="{ backgroundColor: slot.item.color }"
                    >{{ slot.item.name.charAt(0) }}</span
                >
                <span
                    v-if="slot?.kind === 'block' && slot.count > 1"
                    class="absolute bottom-0 right-0.5 text-[10px] font-bold text-white drop-shadow"
                    >{{ slot.count }}</span
                >
            </button>
        </div>
        <!-- Fabricar: recetas con lo que hay en el inventario -->
        <div v-if="walking && crafting" class="absolute inset-0 flex items-center justify-center bg-black/55 p-3" @pointerdown.stop>
            <div
                class="flex max-h-full w-full max-w-md flex-col rounded-lg border bg-white text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100"
            >
                <div class="flex items-center justify-between border-b px-4 py-2">
                    <h3 class="font-semibold">{{ crafting === 'mesa' ? 'Mesa de crafteo' : 'Fabricar a mano' }}</h3>
                    <button type="button" class="rounded px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" @click="closeCrafting">
                        Cerrar (E)
                    </button>
                </div>
                <ul class="flex-1 divide-y overflow-y-auto">
                    <li v-for="recipe in recipes" :key="recipe.id" class="flex items-center gap-3 px-4 py-2">
                        <img
                            v-if="recipeIcon(recipe).src"
                            :src="recipeIcon(recipe).src"
                            alt=""
                            class="h-8 w-8 shrink-0 rounded-sm"
                            style="image-rendering: pixelated"
                        />
                        <span
                            v-else
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-sm font-bold text-white"
                            :style="{ backgroundColor: recipeIcon(recipe).color }"
                            >{{ recipeIcon(recipe).letter }}</span
                        >
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium">
                                {{ recipe.name }}<span v-if="'block' in recipe.gives && recipe.gives.count > 1"> ×{{ recipe.gives.count }}</span>
                            </p>
                            <p class="text-xs text-neutral-500">
                                <span
                                    v-for="(amount, block) in recipe.needs"
                                    :key="block"
                                    :class="[
                                        'mr-2',
                                        countBlock(inventory, block) >= (amount ?? 0) ? 'text-green-700 dark:text-green-400' : 'text-red-600',
                                    ]"
                                >
                                    {{ BLOCK_NAMES[block] }} {{ countBlock(inventory, block) }}/{{ amount }}
                                </span>
                            </p>
                        </div>
                        <button
                            type="button"
                            class="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 dark:bg-white dark:text-neutral-900"
                            :disabled="missing(inventory, recipe).length > 0"
                            @click="craftOne(recipe)"
                        >
                            Fabricar
                        </button>
                    </li>
                </ul>
                <p v-if="crafting === 'mano'" class="border-t px-4 py-2 text-xs text-neutral-500">
                    Los muebles se fabrican en una mesa de crafteo: hacé una, ponela con clic derecho y abrila con clic derecho.
                </p>
            </div>
        </div>
        <!-- Pausa: el mouse se liberó (Esc o cambio de ventana) -->
        <div v-if="paused" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-white">
            <p class="text-lg font-semibold">Recorrido en pausa</p>
            <div class="flex gap-2">
                <button
                    type="button"
                    class="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
                    @click="requestLock"
                >
                    Seguir recorriendo
                </button>
                <button type="button" class="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30" @click="exitWalk">
                    Salir
                </button>
            </div>
            <p class="max-w-xs text-center text-xs text-white/80">
                W A S D para caminar · Espacio salta · Shift corre · mové el mouse para mirar · mantené el clic izquierdo para romper bloques (con el
                pico es más rápido) o guardar un mueble · clic derecho pone lo elegido o agarra un mueble · 1 a 9 o la rueda eligen del inventario ·
                con la espada se les pega a los zombis (la casa es zona segura) · E fabrica · Q tira · R gira lo que llevás · se sale por la puerta ·
                Esc pausa
            </p>
        </div>
        <!-- Botones para pantallas táctiles: saltar, agarrar/soltar y quitar -->
        <div v-if="walking && !canLock" class="absolute bottom-3 left-3 flex flex-col gap-1" @pointerdown.stop>
            <button type="button" :class="[padButton, 'w-auto px-3 text-xs']" @click="walker.jump()">Saltar</button>
            <button type="button" :class="[padButton, 'w-auto px-3 text-xs']" @click="useSelected">
                {{ heldId ? 'Soltar' : selectedStack?.kind === 'block' || selectedStack?.kind === 'item' ? 'Poner' : 'Agarrar' }}
            </button>
            <button
                type="button"
                :class="[padButton, 'w-auto px-3 text-xs']"
                :disabled="!!heldId || (!targetId && !blockTarget)"
                @pointerdown="startMining"
                @pointerup="stopMining"
                @pointerleave="stopMining"
            >
                {{ blockTarget ? 'Romper (mantener)' : 'Guardar' }}
            </button>
            <button type="button" :class="[padButton, 'w-auto px-3 text-xs']" @click="throwSelected">Tirar</button>
            <button type="button" :class="[padButton, 'w-auto px-3 text-xs']" @click="openCrafting('mano')">Fabricar</button>
        </div>
        <!-- Flechas en pantalla para caminar sin teclado (celular, tablet) -->
        <div v-if="walking && !canLock" class="absolute bottom-3 right-3 grid grid-cols-3 gap-1" @pointerdown.stop>
            <span />
            <button
                type="button"
                :class="padButton"
                aria-label="Avanzar"
                @pointerdown="pressKey('forward', true)"
                @pointerup="pressKey('forward', false)"
                @pointerleave="pressKey('forward', false)"
            >
                <ChevronUp class="h-5 w-5" />
            </button>
            <span />
            <button
                type="button"
                :class="padButton"
                aria-label="Izquierda"
                @pointerdown="pressKey('left', true)"
                @pointerup="pressKey('left', false)"
                @pointerleave="pressKey('left', false)"
            >
                <ChevronLeft class="h-5 w-5" />
            </button>
            <button
                type="button"
                :class="padButton"
                aria-label="Retroceder"
                @pointerdown="pressKey('back', true)"
                @pointerup="pressKey('back', false)"
                @pointerleave="pressKey('back', false)"
            >
                <ChevronDown class="h-5 w-5" />
            </button>
            <button
                type="button"
                :class="padButton"
                aria-label="Derecha"
                @pointerdown="pressKey('right', true)"
                @pointerup="pressKey('right', false)"
                @pointerleave="pressKey('right', false)"
            >
                <ChevronRight class="h-5 w-5" />
            </button>
        </div>
        <p
            v-if="walking && !paused && canLock"
            class="pointer-events-none absolute left-2 top-2 hidden items-center gap-1 rounded bg-white/80 px-2 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300 sm:flex"
        >
            <Footprints class="h-3 w-3" /> W A S D camina · Espacio salta · clic izq. rompe/guarda · clic der. pone/agarra · 1-9 inventario · E
            fabrica · Q tira · Esc pausa
        </p>
        <p
            v-else
            class="pointer-events-none absolute bottom-2 left-2 hidden items-center gap-1 rounded bg-white/80 px-2 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300 sm:flex"
        >
            <Box class="h-3 w-3" /> Arrastrá el fondo para girar, la rueda para acercar, un objeto para moverlo y Shift + arrastrar para subirlo o
            bajarlo.
        </p>
    </div>
</template>

<style scoped>
/* Golpe de la mano al romper o poner: se cambia la clave del elemento para repetir la animación. */
.hand-swing {
    animation: swing 0.25s ease-out;
}
/* Destello rojo que se apaga solo; se repite cambiando la clave del elemento. */
.hurt-flash {
    background: radial-gradient(circle, transparent 40%, rgba(220, 0, 0, 0.55));
    animation: hurt 0.45s ease-out forwards;
}
@keyframes hurt {
    from {
        opacity: 1;
    }
    to {
        opacity: 0;
    }
}
@keyframes swing {
    0% {
        transform: translate(0, 0) rotate(0);
    }
    40% {
        transform: translate(-14px, -10px) rotate(-18deg);
    }
    100% {
        transform: translate(0, 0) rotate(0);
    }
}
</style>

<script setup lang="ts">
import { useRoomEditor } from '@/composables/useRoomEditor';
import { findCatalogEntry } from '@/lib/room/catalog';
import { formatCm } from '@/lib/room/format';
import { buildModel } from '@/lib/room/models';
import {
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
import { ArrowDown, ArrowUp, Box, Copy, Eye, Lightbulb, LightbulbOff, Moon, RotateCcw, RotateCw, Sun, Trash2 } from 'lucide-vue-next';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ room: Room }>();

const { selectedId, selectedItem, issues, selectItem, beginMove, moveItemTo, setElevationLive, rotateItem, updateItem, duplicateItem, removeItem } =
    useRoomEditor();

/** Posición en pantalla (px dentro del panel) de la barra del objeto seleccionado. */
const toolbar = ref<{ x: number; y: number } | null>(null);
const toolbarEl = ref<HTMLDivElement | null>(null);
const selected = computed(() => selectedItem.value);
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
            loadModelFor(item, entry.group);
        }
        placeItem(entry.group, item);
        const selected = item.id === selectedId.value;
        const issue = issues.value.has(item.id);
        setOutline(entry.group, selected && issue ? 'selected-issue' : selected ? 'selected' : issue ? 'issue' : 'none');
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
            }
        })
        .catch(() => {
            // Sin modelo queda la forma simple.
        });
}

const night = ref(false);
let hemisphere: THREE.HemisphereLight;
let sun: THREE.DirectionalLight;

function applyDaylight() {
    hemisphere.intensity = night.value ? 0.12 : 1.6;
    sun.intensity = night.value ? 0 : 1.8;
    renderer?.setClearColor(night.value ? '#0b1020' : '#000000', night.value ? 1 : 0);
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
        const blocking = wallFacesAway(wall, camera.position, props.room);
        material.opacity = blocking ? 0.08 : 1;
        material.depthWrite = !blocking;
        mesh.castShadow = !blocking;
    }
}

/** Ubica la barra flotante arriba del objeto seleccionado. */
function updateToolbar() {
    const item = selected.value;
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

function render() {
    frame = requestAnimationFrame(render);
    controls.update();
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
    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
    // Antes que OrbitControls, para poder desactivarlo cuando se agarra un objeto.
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    controls = new OrbitControls(camera, renderer.domElement);
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
        () => resetCamera(),
    );

    render();
});

watch(
    () => props.room,
    () => {
        if (renderer) {
            syncShell();
            syncItems();
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
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Volver a la vista inicial"
                @click="resetCamera()"
            >
                <RotateCcw class="h-3.5 w-3.5" /> Centrar
            </button>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-800/90 dark:text-neutral-200"
                title="Ver desde arriba"
                @click="resetCamera('top')"
            >
                <Eye class="h-3.5 w-3.5" /> Desde arriba
            </button>
        </div>
        <p
            class="pointer-events-none absolute bottom-2 left-2 hidden items-center gap-1 rounded bg-white/80 px-2 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300 sm:flex"
        >
            <Box class="h-3 w-3" /> Arrastrá el fondo para girar, la rueda para acercar, un objeto para moverlo y Shift + arrastrar para subirlo o
            bajarlo.
        </p>
    </div>
</template>

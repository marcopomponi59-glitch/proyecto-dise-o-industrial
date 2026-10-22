<script setup lang="ts">
import { useRoomEditor } from '@/composables/useRoomEditor';
import { isOpening } from '@/lib/room/catalog';
import { contrastText, formatCm, formatMeters } from '@/lib/room/format';
import { halfExtents, WALL_THICKNESS } from '@/lib/room/geometry';
import type { Point, Room, RoomItem } from '@/lib/room/types';
import { useResizeObserver } from '@vueuse/core';
import { computed, ref } from 'vue';

const props = defineProps<{ room: Room }>();

const { selectedId, issues, selectItem, beginMove, moveItemTo, rotateItemTo } = useRoomEditor();

/** Margen alrededor de la habitación para las cotas, en cm. */
const PADDING = 70;
const WALL = WALL_THICKNESS;

const svg = ref<SVGSVGElement | null>(null);
const size = ref({ width: 1, height: 1 });

useResizeObserver(svg, (entries) => {
    const { width, height } = entries[0].contentRect;
    size.value = { width: Math.max(width, 1), height: Math.max(height, 1) };
});

const viewBox = computed(() => `${-PADDING} ${-PADDING} ${props.room.width + 2 * PADDING} ${props.room.length + 2 * PADDING}`);

/** Cuántos cm del plano entran en un píxel de pantalla; sirve para que textos y tiradores no cambien de tamaño. */
const unit = computed(() => {
    const scale = Math.min(size.value.width / (props.room.width + 2 * PADDING), size.value.height / (props.room.length + 2 * PADDING));
    return 1 / scale;
});

const ordered = computed(() => {
    // El seleccionado va arriba de los de su misma capa, pero una alfombra nunca tapa a los muebles.
    const layer = (item: RoomItem) => ({ rug: 0, floor: 2, wall: 4, ceiling: 6 })[item.mount] + (item.id === selectedId.value ? 1 : 0);
    return [...props.room.items].sort((a, b) => layer(a) - layer(b));
});

const selected = computed(() => props.room.items.find((i) => i.id === selectedId.value) ?? null);

/** Distancia del objeto seleccionado a cada pared, para dibujar las cotas. */
const clearances = computed(() => {
    const item = selected.value;
    if (!item) {
        return [];
    }
    const { hx, hy } = halfExtents(item);
    const left = item.x - hx;
    const right = item.x + hx;
    const top = item.y - hy;
    const bottom = item.y + hy;
    const { width, length } = props.room;

    return [
        { from: { x: 0, y: item.y }, to: { x: left, y: item.y }, value: left },
        { from: { x: right, y: item.y }, to: { x: width, y: item.y }, value: width - right },
        { from: { x: item.x, y: 0 }, to: { x: item.x, y: top }, value: top },
        { from: { x: item.x, y: bottom }, to: { x: item.x, y: length }, value: length - bottom },
    ].filter((c) => c.value > 1);
});

type Drag = { mode: 'move'; id: string; offset: Point } | { mode: 'rotate'; id: string };
let drag: Drag | null = null;

function toPlan(event: PointerEvent): Point {
    const matrix = svg.value?.getScreenCTM();
    if (!matrix) {
        return { x: 0, y: 0 };
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
}

function startMove(event: PointerEvent, item: RoomItem) {
    if (event.button !== 0) {
        return;
    }
    const point = toPlan(event);
    selectItem(item.id);
    beginMove();
    drag = { mode: 'move', id: item.id, offset: { x: point.x - item.x, y: point.y - item.y } };
    svg.value?.setPointerCapture(event.pointerId);
}

function startRotate(event: PointerEvent, item: RoomItem) {
    beginMove();
    drag = { mode: 'rotate', id: item.id };
    svg.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
    if (!drag) {
        return;
    }
    const point = toPlan(event);
    if (drag.mode === 'move') {
        moveItemTo(drag.id, { x: point.x - drag.offset.x, y: point.y - drag.offset.y });
        return;
    }
    const item = props.room.items.find((i) => i.id === drag?.id);
    if (item) {
        // El frente del objeto con rotación θ apunta a (-sen θ, cos θ).
        const degrees = (Math.atan2(-(point.x - item.x), point.y - item.y) * 180) / Math.PI;
        rotateItemTo(item.id, event.shiftKey ? Math.round(degrees) : Math.round(degrees / 15) * 15);
    }
}

function endDrag(event: PointerEvent) {
    if (drag && svg.value?.hasPointerCapture(event.pointerId)) {
        svg.value.releasePointerCapture(event.pointerId);
    }
    drag = null;
}

/** Arco que barre la hoja de la puerta (o de cada hoja, si es doble), en coordenadas del objeto. */
function doorPaths(item: RoomItem): { leaf: string; arc: string }[] {
    const front = item.depth / 2;
    const leaves = item.width >= 120 ? 2 : 1;
    const leaf = item.width / leaves;
    const hinges =
        leaves === 1
            ? [{ x: -item.width / 2, dir: 1 }]
            : [
                  { x: -item.width / 2, dir: 1 },
                  { x: item.width / 2, dir: -1 },
              ];
    return hinges.map(({ x, dir }) => ({
        leaf: `M ${x} ${front} L ${x} ${front + leaf}`,
        arc: `M ${x + dir * leaf} ${front} A ${leaf} ${leaf} 0 0 ${dir === 1 ? 1 : 0} ${x} ${front + leaf}`,
    }));
}

function strokeFor(item: RoomItem): string {
    return issues.value.has(item.id) ? '#dc2626' : item.id === selectedId.value ? '#2563eb' : '#374151';
}

function labelSize(item: RoomItem): number {
    return Math.min(12 * unit.value, Math.max(item.width, item.depth) / 4);
}
</script>

<template>
    <svg
        ref="svg"
        class="h-full w-full touch-none select-none"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="`Plano de ${room.name}`"
        @pointerdown.self="selectItem(null)"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
    >
        <defs>
            <pattern id="grid-minor" width="10" height="10" patternUnits="userSpaceOnUse">
                <path
                    d="M 10 0 L 0 0 0 10"
                    fill="none"
                    stroke="currentColor"
                    stroke-opacity="0.07"
                    stroke-width="0.5"
                    vector-effect="non-scaling-stroke"
                />
            </pattern>
            <pattern id="grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
                <rect width="50" height="50" fill="url(#grid-minor)" />
                <path
                    d="M 50 0 L 0 0 0 50"
                    fill="none"
                    stroke="currentColor"
                    stroke-opacity="0.18"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
            </pattern>
        </defs>

        <!-- Paredes y piso -->
        <rect
            :x="-WALL"
            :y="-WALL"
            :width="room.width + 2 * WALL"
            :height="room.length + 2 * WALL"
            class="fill-neutral-700 dark:fill-neutral-400"
            @pointerdown="selectItem(null)"
        />
        <rect :width="room.width" :height="room.length" :fill="room.floorColor" @pointerdown="selectItem(null)" />
        <rect :width="room.width" :height="room.length" fill="url(#grid-major)" class="pointer-events-none text-neutral-900" />

        <!-- Cotas de la habitación -->
        <g class="pointer-events-none fill-neutral-600 dark:fill-neutral-300" :font-size="13 * unit">
            <text :x="room.width / 2" :y="-WALL - 10 * unit" text-anchor="middle">{{ formatMeters(room.width) }}</text>
            <text :transform="`translate(${-WALL - 10 * unit} ${room.length / 2}) rotate(-90)`" text-anchor="middle">
                {{ formatMeters(room.length) }}
            </text>
        </g>

        <!-- Objetos -->
        <g
            v-for="item in ordered"
            :key="item.id"
            :transform="`translate(${item.x} ${item.y}) rotate(${item.rotation})`"
            class="cursor-move"
            @pointerdown.stop="startMove($event, item)"
        >
            <!-- Ventana: vidrio dentro del espesor de la pared -->
            <template v-if="item.shape === 'window'">
                <rect
                    :x="-item.width / 2"
                    :y="-item.depth / 2"
                    :width="item.width"
                    :height="item.depth"
                    fill="#dbeafe"
                    :stroke="strokeFor(item)"
                    :stroke-width="issues.has(item.id) || item.id === selectedId ? 2.5 : 1"
                    vector-effect="non-scaling-stroke"
                />
                <line
                    :x1="-item.width / 2"
                    :x2="item.width / 2"
                    y1="0"
                    y2="0"
                    stroke="#3b82f6"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                />
            </template>
            <!-- Puerta: hueco en la pared, hoja abierta y arco de apertura -->
            <template v-else-if="item.shape === 'door'">
                <rect :x="-item.width / 2" :y="-item.depth / 2" :width="item.width" :height="item.depth" :fill="room.floorColor" />
                <rect
                    :x="-item.width / 2"
                    :y="-item.depth / 2"
                    :width="item.width"
                    :height="item.depth"
                    fill="none"
                    :stroke="strokeFor(item)"
                    :stroke-width="issues.has(item.id) || item.id === selectedId ? 2.5 : 1"
                    vector-effect="non-scaling-stroke"
                />
                <g v-for="(path, index) in doorPaths(item)" :key="index" fill="none" :stroke="strokeFor(item)" vector-effect="non-scaling-stroke">
                    <path :d="path.leaf" stroke-width="2.5" vector-effect="non-scaling-stroke" />
                    <path :d="path.arc" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
                </g>
            </template>
            <template v-else>
                <rect
                    :x="-item.width / 2"
                    :y="-item.depth / 2"
                    :width="item.width"
                    :height="item.depth"
                    :fill="item.color"
                    :fill-opacity="{ rug: 0.55, floor: 0.88, wall: 0.95, ceiling: 0.3 }[item.mount]"
                    :stroke="strokeFor(item)"
                    :stroke-width="issues.has(item.id) || item.id === selectedId ? 2.5 : 1"
                    :stroke-dasharray="item.mount === 'wall' || item.mount === 'ceiling' ? '4 3' : undefined"
                    vector-effect="non-scaling-stroke"
                    :rx="item.mount === 'ceiling' ? Math.min(item.width, item.depth) / 2 : 1"
                />
                <!-- Frente -->
                <line
                    v-if="item.mount !== 'ceiling'"
                    :x1="-item.width / 2"
                    :x2="item.width / 2"
                    :y1="item.depth / 2"
                    :y2="item.depth / 2"
                    stroke="#111827"
                    stroke-opacity="0.6"
                    stroke-width="3"
                    vector-effect="non-scaling-stroke"
                />
            </template>
            <text
                v-if="(item.mount !== 'wall' || item.depth > 15) && !isOpening(item)"
                :transform="`rotate(${-item.rotation})`"
                :font-size="labelSize(item)"
                :fill="item.mount === 'ceiling' ? '#1f2937' : contrastText(item.color)"
                text-anchor="middle"
                dominant-baseline="central"
                class="pointer-events-none"
            >
                {{ item.name }}
            </text>
        </g>

        <!-- Etiquetas de lo que va en la pared (no entran dentro del objeto) -->
        <g class="pointer-events-none fill-neutral-700 dark:fill-neutral-200" :font-size="10 * unit">
            <template v-for="item in room.items" :key="`label-${item.id}`">
                <text
                    v-if="item.mount === 'wall' && item.depth <= 15"
                    :x="item.x + (item.wall === 'left' ? 18 * unit : item.wall === 'right' ? -18 * unit : 0)"
                    :y="item.y + (item.wall === 'top' ? 16 * unit : item.wall === 'bottom' ? -12 * unit : 0)"
                    :text-anchor="item.wall === 'left' ? 'start' : item.wall === 'right' ? 'end' : 'middle'"
                    dominant-baseline="central"
                >
                    {{ item.name }}
                </text>
            </template>
        </g>

        <!-- Cotas y tirador del seleccionado -->
        <g v-if="selected" class="pointer-events-none">
            <g v-for="(c, index) in clearances" :key="index">
                <line
                    :x1="c.from.x"
                    :y1="c.from.y"
                    :x2="c.to.x"
                    :y2="c.to.y"
                    stroke="#2563eb"
                    stroke-dasharray="4 3"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
                <text
                    :x="(c.from.x + c.to.x) / 2"
                    :y="(c.from.y + c.to.y) / 2 - 5 * unit"
                    :font-size="11 * unit"
                    text-anchor="middle"
                    fill="#1d4ed8"
                    stroke="#ffffff"
                    stroke-width="3"
                    paint-order="stroke"
                    vector-effect="non-scaling-stroke"
                >
                    {{ formatCm(c.value) }}
                </text>
            </g>
        </g>
        <g v-if="selected && selected.mount !== 'wall'" :transform="`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`">
            <line
                :y1="selected.depth / 2"
                :y2="selected.depth / 2 + 22 * unit"
                stroke="#2563eb"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
            />
            <circle
                :cy="selected.depth / 2 + 22 * unit"
                :r="7 * unit"
                fill="#ffffff"
                stroke="#2563eb"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                class="cursor-grab"
                @pointerdown.stop="startRotate($event, selected)"
            >
                <title>Arrastrá para rotar (Shift: sin saltos de 15°)</title>
            </circle>
        </g>
    </svg>
</template>

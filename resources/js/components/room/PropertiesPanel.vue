<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { useRoomEditor } from '@/composables/useRoomEditor';
import { findCatalogEntry, isOpening } from '@/lib/room/catalog';
import { formatMeters } from '@/lib/room/format';
import { WALL_LABEL } from '@/lib/room/geometry';
import type { Outside, Wall } from '@/lib/room/types';
import { AlertTriangle, Copy, Lightbulb, RotateCcw, RotateCw, Trash2, X } from 'lucide-vue-next';
import { computed } from 'vue';
import NumberField from './NumberField.vue';
import TexturePicker from './TexturePicker.vue';

const { room, selectedItem: item, issues, updateRoom, updateItem, rotateItem, duplicateItem, removeItem, selectItem } = useRoomEditor();

const walls: Wall[] = ['top', 'right', 'bottom', 'left'];

const entry = computed(() => (item.value ? findCatalogEntry(item.value.type) : undefined));
/** Con modelo 3D, el color sólo se puede cambiar si el modelo tiene una parte pintable (tela, madera…). */
const canColor = computed(() => !entry.value?.model || (entry.value.tint?.length ?? 0) > 0);
const elevationLabel = computed(() => (item.value?.shape === 'window' ? 'Altura del antepecho' : 'Altura desde el piso'));

const inputClass =
    'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

<template>
    <div v-if="room" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <!-- Objeto seleccionado -->
        <section v-if="item" class="space-y-3 p-3">
            <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">Objeto</h2>
                <button
                    type="button"
                    class="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="Deseleccionar (Esc)"
                    @click="selectItem(null)"
                >
                    <X class="h-4 w-4" />
                </button>
            </div>

            <div
                v-if="issues.get(item.id)"
                class="space-y-0.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
                <p v-for="message in issues.get(item.id)" :key="message" class="flex items-center gap-1">
                    <AlertTriangle class="h-3.5 w-3.5 shrink-0" /> {{ message }}
                </p>
            </div>

            <div class="space-y-1">
                <label for="nombre-objeto" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Nombre</label>
                <input
                    id="nombre-objeto"
                    :value="item.name"
                    type="text"
                    :class="inputClass"
                    @change="updateItem(item.id, { name: ($event.target as HTMLInputElement).value.trim() || item.name })"
                />
            </div>

            <div :class="['grid gap-2', isOpening(item) ? 'grid-cols-2' : 'grid-cols-3']">
                <NumberField
                    :model-value="item.width"
                    label="Ancho"
                    :min="1"
                    :max="2000"
                    @update:model-value="updateItem(item.id, { width: $event })"
                />
                <NumberField
                    v-if="!isOpening(item)"
                    :model-value="item.depth"
                    label="Fondo"
                    :min="1"
                    :max="2000"
                    @update:model-value="updateItem(item.id, { depth: $event })"
                />
                <NumberField
                    :model-value="item.height"
                    label="Alto"
                    :min="1"
                    :max="1000"
                    @update:model-value="updateItem(item.id, { height: $event })"
                />
            </div>

            <div class="grid grid-cols-2 gap-2">
                <template v-if="item.mount === 'wall'">
                    <div class="col-span-2 space-y-1">
                        <label for="pared-objeto" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Pared</label>
                        <select
                            id="pared-objeto"
                            :value="item.wall"
                            :class="inputClass"
                            @change="updateItem(item.id, { wall: ($event.target as HTMLSelectElement).value as Wall })"
                        >
                            <option v-for="wall in walls" :key="wall" :value="wall">{{ WALL_LABEL[wall] }}</option>
                        </select>
                    </div>
                    <NumberField
                        :model-value="item.wall === 'top' || item.wall === 'bottom' ? item.x : item.y"
                        label="Centro sobre la pared"
                        @update:model-value="updateItem(item.id, item.wall === 'top' || item.wall === 'bottom' ? { x: $event } : { y: $event })"
                    />
                </template>
                <template v-else>
                    <NumberField :model-value="item.x" label="Posición X" @update:model-value="updateItem(item.id, { x: $event })" />
                    <NumberField :model-value="item.y" label="Posición Y" @update:model-value="updateItem(item.id, { y: $event })" />
                </template>
                <NumberField
                    v-if="item.mount !== 'ceiling' && item.shape !== 'door'"
                    :model-value="item.elevation"
                    :label="elevationLabel"
                    :min="0"
                    :max="1000"
                    @update:model-value="updateItem(item.id, { elevation: $event })"
                />
            </div>

            <div v-if="item.mount !== 'wall'" class="space-y-1">
                <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Rotación</span>
                <div class="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        class="h-8 w-8"
                        title="Girar 90° a la izquierda (Shift+R)"
                        @click="rotateItem(item.id, -90)"
                    >
                        <RotateCcw />
                    </Button>
                    <div class="flex-1">
                        <NumberField
                            :model-value="item.rotation"
                            label="Grados"
                            suffix="°"
                            @update:model-value="updateItem(item.id, { rotation: $event })"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        class="h-8 w-8"
                        title="Girar 90° a la derecha (R)"
                        @click="rotateItem(item.id, 90)"
                    >
                        <RotateCw />
                    </Button>
                </div>
            </div>

            <label v-if="entry?.light" class="flex cursor-pointer items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    :checked="item.lightOn"
                    class="h-4 w-4 rounded border-input"
                    @change="updateItem(item.id, { lightOn: ($event.target as HTMLInputElement).checked })"
                />
                <Lightbulb class="h-4 w-4 text-amber-500" /> Luz encendida
            </label>

            <TexturePicker v-if="entry?.textured" :value="item.texture" :use="entry.textured" @change="updateItem(item.id, { texture: $event })" />

            <div v-if="canColor" class="space-y-1">
                <label for="color-objeto" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Color</label>
                <input
                    id="color-objeto"
                    :value="item.color"
                    type="color"
                    class="h-8 w-full cursor-pointer rounded-md border border-input bg-background"
                    @input="updateItem(item.id, { color: ($event.target as HTMLInputElement).value })"
                />
            </div>

            <div class="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" class="flex-1" @click="duplicateItem(item.id)"><Copy /> Duplicar</Button>
                <Button type="button" variant="destructive" size="sm" class="flex-1" @click="removeItem(item.id)"><Trash2 /> Quitar</Button>
            </div>
        </section>

        <!-- Habitación -->
        <section v-else class="space-y-3 p-3">
            <h2 class="text-sm font-semibold">Habitación</h2>
            <div class="space-y-1">
                <label for="nombre-hab" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Nombre</label>
                <input
                    id="nombre-hab"
                    :value="room.name"
                    type="text"
                    :class="inputClass"
                    @change="updateRoom({ name: ($event.target as HTMLInputElement).value.trim() || room.name })"
                />
            </div>
            <div class="grid grid-cols-3 gap-2">
                <NumberField
                    :model-value="room.width"
                    label="Ancho"
                    suffix="m"
                    :scale="100"
                    :decimals="2"
                    :step="0.1"
                    :min="100"
                    :max="3000"
                    @update:model-value="updateRoom({ width: $event })"
                />
                <NumberField
                    :model-value="room.length"
                    label="Largo"
                    suffix="m"
                    :scale="100"
                    :decimals="2"
                    :step="0.1"
                    :min="100"
                    :max="3000"
                    @update:model-value="updateRoom({ length: $event })"
                />
                <NumberField
                    :model-value="room.height"
                    label="Alto"
                    suffix="m"
                    :scale="100"
                    :decimals="2"
                    :step="0.1"
                    :min="180"
                    :max="600"
                    @update:model-value="updateRoom({ height: $event })"
                />
            </div>
            <div class="space-y-1">
                <label for="vista-ventanas" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Por las ventanas se ve</label>
                <select
                    id="vista-ventanas"
                    :value="room.outside ?? 'atardecer'"
                    :class="inputClass"
                    @change="updateRoom({ outside: ($event.target as HTMLSelectElement).value as Outside })"
                >
                    <option value="atardecer">Atardecer de bloques</option>
                    <option value="bloques">Día de bloques</option>
                    <option value="cielo">Sólo cielo</option>
                </select>
            </div>
            <p class="text-xs text-neutral-500">
                Superficie: {{ ((room.width * room.length) / 10000).toLocaleString('es-AR', { maximumFractionDigits: 2 }) }} m²
            </p>
            <div class="grid grid-cols-2 gap-2">
                <div class="space-y-1">
                    <label for="color-paredes" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Paredes</label>
                    <input
                        id="color-paredes"
                        :value="room.wallColor"
                        type="color"
                        class="h-8 w-full cursor-pointer rounded-md border border-input"
                        @input="updateRoom({ wallColor: ($event.target as HTMLInputElement).value })"
                    />
                </div>
                <div class="space-y-1">
                    <label for="color-piso" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Piso</label>
                    <input
                        id="color-piso"
                        :value="room.floorColor"
                        type="color"
                        class="h-8 w-full cursor-pointer rounded-md border border-input"
                        @input="updateRoom({ floorColor: ($event.target as HTMLInputElement).value })"
                    />
                </div>
            </div>
        </section>

        <!-- Lista de objetos -->
        <section class="mt-auto border-t p-3">
            <h2 class="mb-2 text-sm font-semibold">En la habitación ({{ room.items.length }})</h2>
            <p v-if="room.items.length === 0" class="text-xs text-neutral-500">
                Todavía no agregaste nada. Elegí objetos de la lista de la izquierda.
            </p>
            <ul class="space-y-0.5">
                <li v-for="entry in room.items" :key="entry.id">
                    <button
                        type="button"
                        :class="[
                            'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                            entry.id === item?.id
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                        ]"
                        @click="selectItem(entry.id)"
                    >
                        <span class="h-3 w-3 shrink-0 rounded-sm border border-black/10" :style="{ backgroundColor: entry.color }" />
                        <span class="flex-1 truncate">{{ entry.name }}</span>
                        <span class="text-[11px] text-neutral-500">{{ formatMeters(entry.width) }}</span>
                        <AlertTriangle v-if="issues.has(entry.id)" class="h-3.5 w-3.5 text-red-600" :title="issues.get(entry.id)?.join(' · ')" />
                    </button>
                </li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button';
import type { NewRoomData } from '@/lib/room/storage';
import { reactive } from 'vue';
import NumberField from './NumberField.vue';

const emit = defineEmits<{ create: [data: NewRoomData] }>();

const form = reactive<NewRoomData>({ name: '', width: 400, length: 350, height: 260, starter: true });
</script>

<template>
    <form class="space-y-4" @submit.prevent="emit('create', { ...form })">
        <div class="space-y-1">
            <label for="nombre-habitacion" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">Nombre</label>
            <input
                id="nombre-habitacion"
                v-model="form.name"
                type="text"
                placeholder="Mi habitación"
                class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        </div>
        <div class="grid grid-cols-3 gap-3">
            <NumberField v-model="form.width" label="Ancho" suffix="m" :scale="100" :decimals="2" :step="0.1" :min="100" :max="3000" />
            <NumberField v-model="form.length" label="Largo" suffix="m" :scale="100" :decimals="2" :step="0.1" :min="100" :max="3000" />
            <NumberField v-model="form.height" label="Alto" suffix="m" :scale="100" :decimals="2" :step="0.1" :min="180" :max="600" />
        </div>
        <p class="text-xs text-neutral-500">Medidas interiores, de pared a pared. Después se pueden cambiar.</p>
        <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.starter" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-input" />
            <span>
                Incluir ventanas y lámpara de techo
                <span class="block text-xs text-neutral-500">Se pueden mover, cambiar de pared o quitar como cualquier objeto.</span>
            </span>
        </label>
        <Button type="submit" class="w-full">Crear habitación</Button>
    </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Campo numérico que confirma el valor al salir del campo o con Enter, así el plano no salta
 * mientras se escribe. `scale` convierte la unidad interna (cm) a la que se muestra (por ej. 100 para metros).
 */
const props = withDefaults(
    defineProps<{
        modelValue: number;
        label: string;
        suffix?: string;
        min?: number;
        max?: number;
        step?: number;
        scale?: number;
        decimals?: number;
    }>(),
    { suffix: 'cm', min: -Infinity, max: Infinity, step: 1, scale: 1, decimals: 0 },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const id = `campo-${Math.random().toString(36).slice(2, 9)}`;
const display = (value: number) => Number((value / props.scale).toFixed(props.decimals)).toString();
const text = ref(display(props.modelValue));
const invalid = ref(false);

watch(
    () => props.modelValue,
    (value) => {
        text.value = display(value);
        invalid.value = false;
    },
);

function commit() {
    const parsed = Number(text.value.replace(',', '.'));
    if (text.value.trim() === '' || !Number.isFinite(parsed)) {
        invalid.value = true;
        return;
    }
    const value = Math.min(Math.max(parsed * props.scale, props.min), props.max);
    invalid.value = false;
    text.value = display(value);
    if (value !== props.modelValue) {
        emit('update:modelValue', value);
    }
}
</script>

<template>
    <div class="space-y-1">
        <label :for="id" class="text-xs font-medium text-neutral-600 dark:text-neutral-400">{{ label }}</label>
        <div class="relative">
            <input
                :id="id"
                v-model="text"
                type="text"
                inputmode="decimal"
                :class="[
                    'h-8 w-full rounded-md border bg-background pl-2 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    invalid ? 'border-red-500' : 'border-input',
                ]"
                :aria-invalid="invalid"
                @change="commit"
                @keydown.enter="commit"
                @keydown.up.prevent="
                    text = display(Math.min(modelValue + step * scale, max));
                    commit();
                "
                @keydown.down.prevent="
                    text = display(Math.max(modelValue - step * scale, min));
                    commit();
                "
            />
            <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-neutral-500">{{ suffix }}</span>
        </div>
    </div>
</template>

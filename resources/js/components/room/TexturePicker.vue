<script setup lang="ts">
import { isPhoto, paintTheme, photoToDataUrl, themeOf, THEMES, themeValue, type TextureUse } from '@/lib/room/textures';
import { ImagePlus } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const props = defineProps<{ value?: string; use: TextureUse }>();
const emit = defineEmits<{ change: [value: string | undefined] }>();

const fileInput = ref<HTMLInputElement | null>(null);
const error = ref<string | null>(null);

/** Miniaturas de los temas, dibujadas una sola vez. */
const previews = computed(() => THEMES.map((t) => ({ ...t, src: paintTheme(t.key, props.use, 1.4).toDataURL('image/png') })));
const current = computed(() => themeOf(props.value));

async function pickPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
        return;
    }
    try {
        emit('change', await photoToDataUrl(file));
        error.value = null;
    } catch {
        error.value = 'No se pudo leer la imagen. Probá con una foto JPG o PNG.';
    }
}
</script>

<template>
    <div class="space-y-1.5">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">{{ use === 'poster' ? 'Imagen del cuadro' : 'Estampado' }}</span>
        <div class="grid grid-cols-3 gap-1.5">
            <button
                type="button"
                :class="[
                    'flex h-12 items-center justify-center rounded-md border text-xs',
                    !value ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-input hover:border-neutral-400',
                ]"
                @click="emit('change', undefined)"
            >
                Liso
            </button>
            <button
                v-for="theme in previews"
                :key="theme.key"
                type="button"
                :title="theme.name"
                :class="[
                    'relative h-12 overflow-hidden rounded-md border',
                    current === theme.key ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-input hover:border-neutral-400',
                ]"
                @click="emit('change', themeValue(theme.key))"
            >
                <img
                    :src="theme.src"
                    :alt="theme.name"
                    class="h-full w-full object-cover"
                    :style="{ imageRendering: theme.key === 'bloques' ? 'pixelated' : 'auto' }"
                />
                <span class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[10px] text-white">{{ theme.name }}</span>
            </button>
            <button
                type="button"
                title="Usar una foto propia"
                :class="[
                    'relative flex h-12 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border text-[10px]',
                    isPhoto(value) ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-dashed border-input hover:border-neutral-400',
                ]"
                @click="fileInput?.click()"
            >
                <img v-if="isPhoto(value)" :src="value" alt="Foto elegida" class="absolute inset-0 h-full w-full object-cover" />
                <template v-else>
                    <ImagePlus class="h-4 w-4" />
                    Subir foto
                </template>
            </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="pickPhoto" />
        <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
        <p v-if="isPhoto(value)" class="text-[11px] text-neutral-500">
            La foto queda guardada en este navegador. No viaja en el link para compartir.
        </p>
    </div>
</template>

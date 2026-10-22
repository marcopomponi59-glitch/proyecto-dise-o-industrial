<script setup lang="ts">
import { useRoomEditor } from '@/composables/useRoomEditor';
import { CATALOG, CATEGORIES } from '@/lib/room/catalog';
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const { addItem } = useRoomEditor();

const search = ref('');

const groups = computed(() => {
    const term = search.value.trim().toLowerCase();
    return CATEGORIES.map((category) => ({
        category,
        entries: CATALOG.filter((e) => e.category === category && (!term || e.name.toLowerCase().includes(term))),
    })).filter((g) => g.entries.length > 0);
});
</script>

<template>
    <div class="flex min-h-0 flex-1 flex-col">
        <div class="border-b p-3">
            <h2 class="mb-2 text-sm font-semibold">Agregar</h2>
            <input
                v-model="search"
                type="search"
                placeholder="Buscar…"
                aria-label="Buscar en el catálogo"
                class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto p-3">
            <section v-for="group in groups" :key="group.category">
                <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{{ group.category }}</h3>
                <ul class="space-y-0.5">
                    <li v-for="entry in group.entries" :key="entry.type">
                        <button
                            type="button"
                            class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            :title="`${entry.width} × ${entry.depth} × ${entry.height} cm`"
                            @click="addItem(entry.type)"
                        >
                            <span class="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10" :style="{ backgroundColor: entry.color }" />
                            <span class="flex-1 truncate">{{ entry.name }}</span>
                            <Plus class="h-3.5 w-3.5 text-neutral-400 opacity-0 group-hover:opacity-100" />
                        </button>
                    </li>
                </ul>
            </section>
            <p v-if="groups.length === 0" class="text-sm text-neutral-500">No hay objetos con ese nombre.</p>
        </div>
    </div>
</template>

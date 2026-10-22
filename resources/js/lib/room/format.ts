/** 350 → "3,50 m" */
export function formatMeters(cm: number): string {
    return `${(cm / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

/** 45.5 → "46 cm" */
export function formatCm(cm: number): string {
    return `${Math.round(cm).toLocaleString('es-AR')} cm`;
}

/** Color de texto legible (oscuro o claro) sobre un fondo `#rrggbb`. */
export function contrastText(hex: string): string {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

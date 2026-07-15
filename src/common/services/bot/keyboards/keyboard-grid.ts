/** Telegram reply keyboard: max practical buttons per row. */
export const KEYBOARD_GRID_COLUMNS = 1;

export function chunkKeyboardRow<T>(
    items: readonly T[],
    columns = KEYBOARD_GRID_COLUMNS,
): T[][] {
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += columns) {
        rows.push(items.slice(index, index + columns));
    }
    return rows;
}

// Drag preview must follow the committed table order, not an older DnD cache.
export const deriveVisibleHeaderOrder = (
    committedColumnOrder: readonly string[],
    visibleColumnIds: readonly string[],
): string[] => {
    const visibleColumns = new Set(visibleColumnIds);
    const seen = new Set<string>();
    const orderedVisibleIds: string[] = [];

    committedColumnOrder.forEach((columnId) => {
        if (!visibleColumns.has(columnId) || seen.has(columnId)) return;
        seen.add(columnId);
        orderedVisibleIds.push(columnId);
    });

    visibleColumnIds.forEach((columnId) => {
        if (seen.has(columnId)) return;
        seen.add(columnId);
        orderedVisibleIds.push(columnId);
    });

    return orderedVisibleIds;
};

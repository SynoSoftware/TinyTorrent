const deriveOrderedIds = (
    committedColumnOrder: readonly string[],
    availableColumnIds: readonly string[],
): string[] => {
    const availableColumns = new Set(availableColumnIds);
    const seen = new Set<string>();
    const orderedIds: string[] = [];

    committedColumnOrder.forEach((columnId) => {
        if (!availableColumns.has(columnId) || seen.has(columnId)) return;
        seen.add(columnId);
        orderedIds.push(columnId);
    });

    availableColumnIds.forEach((columnId) => {
        if (seen.has(columnId)) return;
        seen.add(columnId);
        orderedIds.push(columnId);
    });

    return orderedIds;
};

export const deriveCommittedColumnOrder = (
    committedColumnOrder: readonly string[],
    availableColumnIds: readonly string[],
): string[] => deriveOrderedIds(committedColumnOrder, availableColumnIds);

// Drag preview must follow the committed table order, not an older DnD cache.
export const deriveVisibleHeaderOrder = (
    committedColumnOrder: readonly string[],
    visibleColumnIds: readonly string[],
): string[] => {
    return deriveOrderedIds(committedColumnOrder, visibleColumnIds);
};

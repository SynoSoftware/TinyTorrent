import constants from "@/config/constants.json";
import { status } from "@/shared/status";
import type {
    DragOverlayConfig,
    DetailsVisualizationsConfig,
    InteractionConfig,
    NativeHostWindow,
    ShellStyle,
    ShellTokens,
    StatusVisualKeyFromKeys,
    StatusVisualRecipe,
    TooltipOpacityAnimation,
} from "@/config/logicTypes";
import {
    adaptTransition,
    asRecord,
    mergeKnownKeysDeep,
    normalizeRepeatType,
    readNumberDomainFromSchema,
    readOpacity,
    readOptionalNumber,
} from "@/config/logicUtils";

// TODO: Keep `config/logic.ts` as a central “knob registry” and shared constants authority:
// TODO: - UI/UX timing constants (polling cadence, animation delays, debounce windows) should be sourced from here (or from `constants.json`) and not hardcoded in leaf components.
// TODO: - Do not encode protocol/engine concepts here. Transmission RPC is the daemon contract; `uiMode = "Full" | "Rpc"` is a UI/runtime capability derived elsewhere.
// TODO: - If you find the same numeric literal used in multiple components, do not copy it: add a named token/constant (or flag it) so edits remain safe.

// Design-system authority declaration
const designSystemAuthority = {
    source: "index.css",
    primitives: ["--u", "--fz", "--z"],
    note: "All geometry must be derived from CSS primitives; JSON must contain intent only.",
};

// Design system: geometry is authoritative in CSS; JSON contains intent only.

const defaultLayoutPieceMap = {
    columns: 42,
    base_rows: 6,
    max_rows: 12,
    cell_size: 10,
    cell_gap: 2,
} as const;

const defaultLayoutHeatmap = {
    sample_limit_multiplier: 6,
    zoom_levels: [1, 1.5, 2, 2.5],
    cell_size: 6,
    cell_gap: 3,
} as const;

const defaultLayoutPeerMap = {
    drift_amplitude: 5,
    drift_duration: {
        min: 6,
        max: 10,
    },
} as const;

const defaultTableLayout = {
    // Geometry is CSS-driven; defaults here are CSS var references.
    row_height: "var(--tt-h-row)",
    font_size: "text-scaled",
    font_mono: "font-mono",
    overscan: 20,
} as const;
const defaultLayoutDetails = {
    tab_content_max_height: 360,
} as const;

const runtime = {
    nativeHost:
        import.meta.env.VITE_INTERNAL_MODE === "true" ||
        (typeof window !== "undefined" &&
            !!(window as NativeHostWindow).__TINY_TORRENT_NATIVE__),
} as const;

const {
    layout: layoutConfig,
    performance: performanceConfig,
    defaults: defaultsConfig,
    ui: uiConfig,
    heartbeats: heartbeatConfig,
    timers: timerConfig,
} = {
    layout: constants.layout ?? {},
    performance: asRecord(constants.performance),
    defaults: asRecord(constants.defaults),
    ui: asRecord(constants.ui),
    heartbeats: asRecord(constants.heartbeats),
    timers: asRecord(constants.timers),
} as const;
const wsReconnectConfig = asRecord(timerConfig.ws_reconnect);

const defaultDefaults = {
    rpc_endpoint: "/transmission/rpc",
    magnet_protocol_prefix: "magnet:?",
} as const;

const nonEmpty = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;
const n = (configKey: string, fallback: number) =>
    ({ configKey, fallback }) as const;

const performanceSchema = {
    historyDataPoints: n("history_data_points", 60),
    heartbeatMaxDeltaCycles: n("max_delta_cycles", 30),
    heartbeatMinImmediateTriggerMs: n("min_immediate_tick_ms", 1000),
    readRpcCacheTtlMs: n("read_rpc_cache_ms", 0),
    transportCacheTtlMs: n("transport_cache_ttl_ms", 500),
    bulkResumeConcurrency: n("bulk_resume_concurrency", 6),
} as const;

const defaultUi = {
    toast_display_duration_ms: 3000,
} as const;

const defaultHeartbeats = {
    table_refresh_interval_ms: 1500,
    detail_refresh_interval_ms: 500,
    background_refresh_interval_ms: 5000,
} as const;

const defaultTimers = {
    clipboard_badge_duration_ms: 1500,
    focus_restore_delay_ms: 500,
    magnet_event_dedup_window_ms: 1000,
    action_feedback_start_toast_duration_ms: 900,
    optimistic_checking_grace_ms: 5000,
    ws_reconnect: {
        initial_delay_ms: 1000,
        max_delay_ms: 10000,
    },
    ghost_timeout_ms: 30000,
    table_persist_debounce_ms: 250,
    set_location_validation_debounce_ms: 200,
    set_location_root_probe_cache_ttl_ms: 15000,
    set_location_root_probe_error_cache_ttl_ms: 2000,
    verify_watch_interval_ms: 500,
    set_location_move_timeout_ms: 600000,
} as const;

const defaults = {
    rpcEndpoint: nonEmpty(defaultsConfig.rpc_endpoint, defaultDefaults.rpc_endpoint),
    magnetProtocolPrefix: nonEmpty(
        defaultsConfig.magnet_protocol_prefix,
        defaultDefaults.magnet_protocol_prefix,
    ),
} as const;

const resolvedPerformanceRaw = readNumberDomainFromSchema(
    performanceConfig,
    performanceSchema,
);
const resolvedPerformance = {
    ...resolvedPerformanceRaw,
    bulkResumeConcurrency: Math.max(
        1,
        Math.floor(resolvedPerformanceRaw.bulkResumeConcurrency),
    ),
} as const;

// --- SHELL (Classic / Immersive) ---
const defaultShellClassic = {
    outer_radius: 12,
    panel_gap: 0,
    ring_padding: 0,
    handle_hit_area: 10,
} as const;

const defaultShellImmersive = {
    // Immersive is its own shell. Keep defaults independent from classic
    // to avoid accidental cross-mode coupling.
    chrome_padding: 8,
    main_padding: 8,
    hud_card_radius: 28,
    handle_hit_area: 20,
} as const;

const classicShellSchema = {
    outerRadius: {
        configKey: "outer_radius",
        fallback: defaultShellClassic.outer_radius,
    },
    ringPadding: {
        configKey: "ring_padding",
        fallback: defaultShellClassic.ring_padding,
    },
    panelGap: {
        configKey: "panel_gap",
        fallback: defaultShellClassic.panel_gap,
    },
    handleHitArea: {
        configKey: "handle_hit_area",
        fallback: defaultShellClassic.handle_hit_area,
    },
} as const;
const immersiveShellMetricSchema = {
    ringPadding: {
        configKey: "ring_padding",
        fallback: 0,
    },
    panelGap: {
        configKey: "panel_gap",
        fallback: 0,
    },
    handleHitArea: {
        configKey: "handle_hit_area",
        fallback: defaultShellImmersive.handle_hit_area,
    },
} as const;
const immersiveShellSchema = {
    chromePadding: {
        configKey: "chrome_padding",
        fallback: defaultShellImmersive.chrome_padding,
    },
    mainPadding: {
        configKey: "main_padding",
        fallback: defaultShellImmersive.main_padding,
    },
    mainContentPadding: {
        configKey: "main_content_padding",
        fallback: 0,
    },
    hudCardRadius: {
        configKey: "hud_card_radius",
        fallback: defaultShellImmersive.hud_card_radius,
    },
} as const;
const resolveShellDomain = () => {
    const shellConfig = asRecord(layoutConfig.shell);

    // Back-compat: older config had layout.shell as the classic shell object.
    const legacyShellLooksClassic =
        "outer_radius" in shellConfig ||
        "panel_gap" in shellConfig ||
        "ring_padding" in shellConfig;

    const classicShellConfig = legacyShellLooksClassic
        ? shellConfig
        : asRecord(shellConfig.classic);

    const immersiveShellConfig = asRecord(shellConfig.immersive);

    const classicShellResolved = readNumberDomainFromSchema(
        classicShellConfig,
        classicShellSchema,
    );

    // Classic shell metrics (default for shared layout)
    const classicOuterRadius = classicShellResolved.outerRadius;
    const classicRingPadding = classicShellResolved.ringPadding;
    const classicPanelGap = classicShellResolved.panelGap;
    const classicHandleHitArea = classicShellResolved.handleHitArea;
    const classicInnerRadius = Math.max(
        0,
        classicOuterRadius - classicRingPadding,
    );
    const classicInsetRadius = Math.max(0, classicInnerRadius - classicPanelGap);

    // Immersive shell metrics
    // Prefer `outer_radius` for immersive. Keep `main_inner_radius` as a legacy fallback.
    const immersiveOuterRadius =
        readOptionalNumber(immersiveShellConfig.outer_radius) ??
        readOptionalNumber(immersiveShellConfig.main_inner_radius) ??
        classicOuterRadius;
    const immersiveShellMetrics = readNumberDomainFromSchema(
        immersiveShellConfig,
        immersiveShellMetricSchema,
    );
    const immersiveRingPadding = immersiveShellMetrics.ringPadding;
    const immersivePanelGap = immersiveShellMetrics.panelGap;
    // Increase immersive shell resize / handle hit-box to 20px by default
    const immersiveHandleHitArea = immersiveShellMetrics.handleHitArea;
    const immersiveInnerRadius = Math.max(
        0,
        immersiveOuterRadius - immersiveRingPadding,
    );
    const immersiveInsetRadius = Math.max(
        0,
        immersiveInnerRadius - immersivePanelGap,
    );

    const shellTokensClassic: ShellTokens = {
        gap: classicPanelGap,
        radius: classicOuterRadius,
        ringPadding: classicRingPadding,
        handleHitArea: classicHandleHitArea,
        innerRadius: classicInnerRadius,
        insetRadius: classicInsetRadius,
        outerStyle: {
            // Use the *inner* radius for the frame so inner block containers
            // can be controlled from a single token (`innerRadius`).
            borderRadius: classicInnerRadius,
            padding: classicRingPadding,
            // Standard left/right padding for block containers. Use the semantic
            // panel spacing so Navbar/StatusBar and other blocks render consistently
            // without per-component hacks.
            paddingLeft: "var(--spacing-panel)",
            paddingRight: "var(--spacing-panel)",
        },
        surfaceStyle: {
            borderRadius: classicInnerRadius,
        },
    };

    const shellTokensImmersive: ShellTokens = {
        gap: immersivePanelGap,
        radius: immersiveOuterRadius,
        ringPadding: immersiveRingPadding,
        handleHitArea: immersiveHandleHitArea,
        innerRadius: immersiveInnerRadius,
        insetRadius: immersiveInsetRadius,
        outerStyle: {
            // Mirror classic: frame uses innerRadius so a single radius knob controls
            // all block containers in both shells.
            borderRadius: immersiveInnerRadius,
            padding: immersiveRingPadding,
            paddingLeft: "var(--spacing-panel)",
            paddingRight: "var(--spacing-panel)",
        },
        surfaceStyle: {
            borderRadius: immersiveInnerRadius,
        },
    };

    const getTokens = (style: ShellStyle): ShellTokens =>
        style === "immersive" ? shellTokensImmersive : shellTokensClassic;

    const workbenchSurface = (style: ShellStyle) => getTokens(style).surfaceStyle;
    const modalSurface = (style: ShellStyle) => getTokens(style).surfaceStyle;

    const metrics = {
        outerRadius: classicOuterRadius,
        panelGap: classicPanelGap,
        ringPadding: classicRingPadding,
        handleHitArea: classicHandleHitArea,
        innerRadius: classicInnerRadius,
        insetRadius: classicInsetRadius,
    } as const;

    const immersiveShell = {
        ...readNumberDomainFromSchema(
            immersiveShellConfig,
            immersiveShellSchema,
        ),
        mainInnerRadius: immersiveOuterRadius,
    } as const;
    const immersive = {
        ...immersiveShell,
        chromeRadius: immersiveOuterRadius + immersiveShell.chromePadding,
        mainOuterRadius: immersiveOuterRadius + immersiveShell.mainPadding,
    } as const;

    return {
        shell: {
            getTokens,
            surfaces: {
                workbench: workbenchSurface,
                modal: modalSurface,
            },
            metrics,
            radius: classicOuterRadius,
            handleHitArea: classicHandleHitArea,
            immersive,
        },
        statusChip: {
            gap: Math.max(2, metrics.panelGap),
            radius: Math.max(2, Math.round(metrics.innerRadius / 2)),
        },
    } as const;
};
const { shell, statusChip } = resolveShellDomain();

const pieceMapLayout = layoutConfig.piece_map ?? defaultLayoutPieceMap;
const heatmapLayout = layoutConfig.heatmap ?? defaultLayoutHeatmap;
const peerMapLayout = layoutConfig.peer_map ?? defaultLayoutPeerMap;
const tableLayoutConfig = {
    ...defaultTableLayout,
    ...(layoutConfig.table ?? {}),
} as const;
const detailsLayoutConfig = asRecord(layoutConfig.details);

const tableLayout = {
    // These values are CSS-driven tokens; runtime code that needs
    // numeric pixel heights should read the computed style instead.
    rowHeight: "var(--tt-h-row)",
    fontSize: tableLayoutConfig.font_size,
    fontMono: tableLayoutConfig.font_mono,
    overscan: tableLayoutConfig.overscan,
} as const;

// --- UI Token Bases from constants.json (used to initialize CSS variables) ---
const uiLayout = asRecord(layoutConfig.ui);

// Export canonical scale bases (single source of truth for unit/font/zoom).
// These values are derived from `constants.json` and must be imported by
// runtime readers (hooks/components) that need numeric scale tokens.
const scaleCfgTop = asRecord(uiLayout.scale);
const scaleBaseSchema = {
    unit: {
        configKey: "unit",
        fallback: 4,
    },
    fontBase: {
        configKey: "font_base",
        fallback: 11,
    },
    zoom: {
        configKey: "zoom",
        fallback: 1,
    },
} as const;
const scaleCfgNormalized = {
    ...scaleCfgTop,
    font_base: scaleCfgTop.font_base ?? scaleCfgTop.fontBase,
    zoom: scaleCfgTop.zoom ?? scaleCfgTop.level,
} as Record<string, unknown>;
const scaleBases = {
    ...readNumberDomainFromSchema(scaleCfgNormalized, scaleBaseSchema),
};

const uiBases = {
    navbar: {
        height: "var(--height-nav)",
        padding: "var(--spacing-workbench)",
        gap: "var(--spacing-workbench)",
        brandIcon: "var(--tt-brand-icon-size)",
        tabFont: "var(--tt-navbar-tab-font-size)",
        metaFont: "var(--tt-navbar-meta-font-size)",
        searchWidth: "var(--tt-search-width)",
        searchWidthLg: "var(--tt-search-width)",
    },
    statusbar: {
        height: "var(--height-status)",
        iconSm: "var(--tt-status-icon-sm)",
        iconMd: "var(--tt-status-icon-md)",
        iconLg: "var(--tt-status-icon-lg)",
        iconXl: "var(--tt-status-icon-xl)",
        buttonH: "var(--tt-button-h)",
        buttonMinW: "var(--tt-button-min-w)",
        min100: "var(--tt-badge-min-width)",
        min120: "var(--tt-badge-min-width)",
        min80: "var(--tt-badge-min-width)",
    },
    dropOverlay: {
        paddingX: "var(--spacing-workbench)",
        paddingY: "var(--spacing-workbench)",
        iconSize: "var(--tt-brand-icon-size)",
        titleFont: "var(--fz-scaled)",
        fontSize: "var(--fz-scaled)",
    },
    fileExplorer: {
        rowHeight: "var(--tt-h-row)",
        depthIndent: "var(--tt-file-depth-indent)",
        rowPaddingLeft: "var(--tt-file-row-padding-left)",
        contextMenuWidth: "var(--tt-file-context-menu-width)",
        contextMenuMargin: "var(--tt-file-context-menu-margin)",
        priorityBadgeFontSize: "var(--tt-priority-badge-font-size)",
        priorityBadgePaddingX: "var(--tt-priority-badge-padding-x)",
        priorityBadgePaddingY: "var(--tt-priority-badge-padding-y)",
        fileIconSize: "var(--tt-file-icon-size)",
        checkboxPadding: "var(--tt-file-checkbox-padding)",
    },
};

const uiPrimitives = {
    dropOverlayRole: "tt-drop-overlay",
    dropOverlayTitleRole: "tt-drop-overlay__title",
    // Minimum visual thickness (in pixels) for panel resize handles.
    minHandleVisualWidth: 1,
    handleHitareaClass: "w-handle",
} as const;

const visualizationPrimitives = {
    speedWindowOptions: [
        { key: "1m", label: "1m", minutes: 1 },
        { key: "5m", label: "5m", minutes: 5 },
        { key: "30m", label: "30m", minutes: 30 },
        { key: "1h", label: "1h", minutes: 60 },
    ],
} as const;

const iconography = asRecord(constants.iconography);
const iconographySchema = {
    strokeWidth: {
        configKey: "stroke_width",
        fallback: 1.5,
    },
    strokeWidthDense: {
        configKey: "stroke_width_dense",
        fallback: 1.2,
    },
} as const;
const iconographyResolved = readNumberDomainFromSchema(
    iconography,
    iconographySchema,
);

const iconTokens = {
    size: {
        primary: uiBases.statusbar.iconMd,
        secondary: uiBases.statusbar.iconSm,
    },
    strokeWidth: `var(--tt-icon-stroke, ${iconographyResolved.strokeWidth})`,
    strokeWidthDense: `var(--tt-icon-stroke-dense, ${iconographyResolved.strokeWidthDense})`,
} as const;

// Cells should not include extra layout padding for the handle — the handle
// hit-area is provided by an absolutely-positioned element so it won't
// require reserved spacing in the layout.
const tableVisualTokens = {
    cellPaddingClass: "pl-tight pr-tight",
    cellBaseClass:
        "flex items-center overflow-hidden h-full truncate whitespace-nowrap text-ellipsis box-border leading-none",
    cellClass: {
        headerLabel: "gap-tools text-scaled font-bold uppercase text-foreground/60",
        alignCenter: "justify-center",
        alignEnd: "justify-end",
        sortIcon: "text-primary shrink-0 toolbar-icon-size-sm",
        measureLayer: "absolute pointer-events-none invisible",
        measureRow: "flex",
    },
    rowClass: {
        shell: "absolute top-0 left-0 border-b border-default/5 box-border",
        dragCursorEnabled: "cursor-grab",
        dragCursorDisabled: "cursor-default",
        dragging: "opacity-50 grayscale scale-98 z-popover cursor-grabbing",
        content: "relative flex items-center w-full h-full box-border",
        selected: "bg-primary/20",
        hover: "hover:bg-content1/10",
        context: "bg-content1/20",
        highlighted: "bg-foreground/10",
    },
    headerBase: "text-label font-bold uppercase tracking-label text-foreground/60",
    surfaceBorder: "border-content1/20",
} as const;

// Shared header visual tokens used across table headers and inspector headers.
// Components should compose layout-specific classes (grid/flex) with this
// base so color, padding and typography remain consistent.
// `tableVisualTokens.headerBase` is typography-only: casing, scale, tracking and subdued text color.
// It must NOT include background, padding, grid, border, or rounding.
//
const textRoleTokens = {
    primary: "text-scaled font-semibold text-foreground",
    secondary: "text-scaled text-foreground/70",
    label: `${tableVisualTokens.headerBase} text-label`,
    helper: "text-label text-foreground/60",
} as const;

const statusChipStyle = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
} as const;

// `tableHeaderClass` composes `headerBase` with table-specific surface, padding and grid.
const tableHeaderClass = `${tableVisualTokens.headerBase} py-panel ${tableVisualTokens.cellPaddingClass} bg-background/40 grid grid-cols-torrent gap-tools rounded-modal border ${tableVisualTokens.surfaceBorder}`;

const timingSchemas = {
    heartbeat: {
        tableMs: n(
            "table_refresh_interval_ms",
            defaultHeartbeats.table_refresh_interval_ms,
        ),
        detailMs: n(
            "detail_refresh_interval_ms",
            defaultHeartbeats.detail_refresh_interval_ms,
        ),
        backgroundMs: n(
            "background_refresh_interval_ms",
            defaultHeartbeats.background_refresh_interval_ms,
        ),
    },
    debounce: {
        tablePersistMs: n(
            "table_persist_debounce_ms",
            defaultTimers.table_persist_debounce_ms,
        ),
        setLocationValidationMs: n(
            "set_location_validation_debounce_ms",
            defaultTimers.set_location_validation_debounce_ms,
        ),
    },
    cache: {
        setLocationRootProbeTtlMs: n(
            "set_location_root_probe_cache_ttl_ms",
            defaultTimers.set_location_root_probe_cache_ttl_ms,
        ),
        setLocationRootProbeErrorTtlMs: n(
            "set_location_root_probe_error_cache_ttl_ms",
            defaultTimers.set_location_root_probe_error_cache_ttl_ms,
        ),
    },
    timeouts: {
        ghostMs: n("ghost_timeout_ms", defaultTimers.ghost_timeout_ms),
        setLocationMoveMs: n(
            "set_location_move_timeout_ms",
            defaultTimers.set_location_move_timeout_ms,
        ),
    },
    wsReconnect: {
        initialDelayMs: n(
            "initial_delay_ms",
            defaultTimers.ws_reconnect.initial_delay_ms,
        ),
        maxDelayMs: n("max_delay_ms", defaultTimers.ws_reconnect.max_delay_ms),
    },
    ui: {
        toastMs: n("toast_display_duration_ms", defaultUi.toast_display_duration_ms),
        clipboardBadgeMs: n(
            "clipboard_badge_duration_ms",
            defaultTimers.clipboard_badge_duration_ms,
        ),
        focusRestoreMs: n(
            "focus_restore_delay_ms",
            defaultTimers.focus_restore_delay_ms,
        ),
        magnetEventDedupWindowMs: n(
            "magnet_event_dedup_window_ms",
            defaultTimers.magnet_event_dedup_window_ms,
        ),
        actionFeedbackStartToastMs: n(
            "action_feedback_start_toast_duration_ms",
            defaultTimers.action_feedback_start_toast_duration_ms,
        ),
        optimisticCheckingGraceMs: n(
            "optimistic_checking_grace_ms",
            defaultTimers.optimistic_checking_grace_ms,
        ),
    },
    recovery: {
        verifyWatchIntervalMs: n(
            "verify_watch_interval_ms",
            defaultTimers.verify_watch_interval_ms,
        ),
    },
} as const;

const resolvedTiming = {
    heartbeat: readNumberDomainFromSchema(heartbeatConfig, timingSchemas.heartbeat),
    debounce: readNumberDomainFromSchema(timerConfig, timingSchemas.debounce),
    cache: readNumberDomainFromSchema(timerConfig, timingSchemas.cache),
    timeouts: readNumberDomainFromSchema(timerConfig, timingSchemas.timeouts),
    wsReconnect: readNumberDomainFromSchema(
        wsReconnectConfig,
        timingSchemas.wsReconnect,
    ),
    ui: readNumberDomainFromSchema(uiConfig, timingSchemas.ui),
    recovery: readNumberDomainFromSchema(timerConfig, timingSchemas.recovery),
} as const;

const normalizeDragOverlay = (
    dragOverlay: DragOverlayConfig,
): DragOverlayConfig => ({
    ...dragOverlay,
    root: {
        ...dragOverlay.root,
        transition: {
            ...dragOverlay.root.transition,
            type: "spring",
        },
    },
    layers: dragOverlay.layers.map((layer) => ({
        ...layer,
        transition: {
            ...adaptTransition(layer.transition),
            type: "spring",
            repeatType: normalizeRepeatType(layer.transition.repeatType),
        },
    })),
    iconPulse: {
        ...dragOverlay.iconPulse,
        transition: {
            ...adaptTransition(dragOverlay.iconPulse.transition),
            type: "spring",
            repeatType: normalizeRepeatType(
                dragOverlay.iconPulse.transition.repeatType,
            ),
        },
    },
});

const resolveInteractionConfig = (): InteractionConfig => {
    const rawInteraction = constants.interaction as InteractionConfig;

    return {
        ...rawInteraction,
        dragOverlay: normalizeDragOverlay(rawInteraction.dragOverlay),
        modalBloom: {
            ...rawInteraction.modalBloom,
            transition: {
                ...rawInteraction.modalBloom.transition,
                type: "spring",
            },
        },
    };
};

const interactionConfig = resolveInteractionConfig();
const interactionChart = interactionConfig.speedChart;

const detailsLayoutSchema = {
    tabContentMaxHeight: {
        configKey: "tab_content_max_height",
        fallback: defaultLayoutDetails.tab_content_max_height,
    },
} as const;
const detailsLayoutResolved = readNumberDomainFromSchema(
    detailsLayoutConfig,
    detailsLayoutSchema,
);
const detailsTabContentMaxHeight =
    detailsLayoutResolved.tabContentMaxHeight;

const defaultDetailsVisualizations: DetailsVisualizationsConfig = {
    piece_map: {
        cell_size: 10,
        cell_gap: 2,
        columns: 60,
        rows: {
            base: 4,
            max: 16,
        },
    },
    peer_map: {
        drift_amplitude: 8,
        drift_duration: {
            min: 4,
            max: 8,
        },
        layout: {
            center: 90,
            radius: 70,
            base_node_size: 6,
            progress_scale: 12,
        },
    },
    scatter: {
        padding: {
            top: 24,
            bottom: 20,
            x: 16,
        },
        radius: {
            normal: 4,
            hover: 7,
            hit: 20,
        },
    },
    tooltip_animation: {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.1 },
    },
    availability_heatmap: {
        shadow_blur_max: 16,
        hover_stroke_width: 1.1,
        hover_stroke_inset: 0.6,
        cell_stroke_inset: 0.6,
    },
    speed_chart: {
        line_width: 3,
        fill_alpha: 0.35,
        down_stroke_token: "--heroui-success",
        up_stroke_token: "--heroui-secondary",
    },
};

const resolveDetailsVisualizations = (
    value: unknown,
): DetailsVisualizationsConfig =>
    mergeKnownKeysDeep(defaultDetailsVisualizations, asRecord(value));

const detailsVisualizations = resolveDetailsVisualizations(
    constants.visualizations?.details,
);

const detailsPieceMapConfig = detailsVisualizations.piece_map;
const detailsPeerMapConfig = detailsVisualizations.peer_map;
const detailsScatterConfig = detailsVisualizations.scatter;
const detailsTooltipAnimation =
    detailsVisualizations.tooltip_animation;
const detailsTooltipOpacityAnimation: TooltipOpacityAnimation = {
    initial: {
        opacity: readOpacity(detailsTooltipAnimation?.initial, 0),
    },
    animate: {
        opacity: readOpacity(detailsTooltipAnimation?.animate, 1),
    },
    exit: { opacity: readOpacity(detailsTooltipAnimation?.exit, 0) },
};

// Availability heatmap visual tokens (moved from hard-coded literals)
const detailsAvailabilityHeatmap =
    detailsVisualizations.availability_heatmap;
const heatmapShadowBlurMax =
    detailsAvailabilityHeatmap.shadow_blur_max;
const heatmapHoverStrokeWidth =
    detailsAvailabilityHeatmap.hover_stroke_width;
const heatmapHoverStrokeInset =
    detailsAvailabilityHeatmap.hover_stroke_inset;
const heatmapCellStrokeInset =
    detailsAvailabilityHeatmap.cell_stroke_inset;
const heatmapUseUiSamplingShim = Boolean(
    detailsAvailabilityHeatmap.use_ui_sampling_shim,
);

const detailsSpeedChart = detailsVisualizations.speed_chart;

const defaultSpeedVisualization = {
    canvasDenomFloor: 1024,
    smoothDecay: 0.98,
    retentionMs: 15 * 60_000,
    bucketWidthSmall: 240,
    bucketWidthMed: 520,
    bucketCountSmall: 48,
    bucketCountMed: 96,
} as const;

const trackingLabel = "tracking-label";

const transitionTokens = {
    fast: "transition-colors duration-150",
    medium: "transition-all duration-200",
    slow: "transition-all duration-300",
    reveal: "transition-opacity duration-500",
} as const;

const interactiveRecipe = {
    buttonDefault: `${transitionTokens.fast} hover:bg-content2/50 active:scale-95`,
    buttonPrimary: `${transitionTokens.fast} hover:bg-primary/20 active:scale-95`,
    buttonDanger: `${transitionTokens.fast} hover:bg-danger/10 text-danger hover:text-danger-600`,
    buttonGhost: `${transitionTokens.fast} hover:text-foreground hover:bg-content2/30`,
    textReveal: `${transitionTokens.fast} hover:text-foreground`,
    textMutedReveal: `${transitionTokens.fast} hover:text-foreground/70`,
    menuItem: `${transitionTokens.fast} hover:bg-content2/50 cursor-pointer`,
    menuItemDanger: `${transitionTokens.fast} hover:bg-danger/10 text-danger cursor-pointer`,
    dismiss: `${transitionTokens.fast} hover:text-foreground hover:bg-content2/30 rounded-full`,
    navItem: `${transitionTokens.fast} hover:text-foreground hover:bg-foreground/5`,
    groupReveal: `${transitionTokens.reveal} group-hover:opacity-100 opacity-0`,
} as const;

const visualState = {
    disabled: "opacity-50 pointer-events-none",
    muted: "opacity-40",
    ghost: "opacity-20",
} as const;

const statusVisualKeys = {
    tone: {
        primary: "tone_primary",
        success: "tone_success",
        warning: "tone_warning",
        danger: "tone_danger",
        muted: "tone_muted",
        neutral: "tone_neutral",
    },
    speed: {
        down: "speed_down",
        seed: "speed_seed",
        idle: "speed_idle",
    },
} as const;

const statusVisuals = {
    [status.connection.idle]: {
        bg: "bg-content1/5 hover:bg-content1/10",
        border: "border-default/10",
        text: "text-foreground/40",
        shadow: "shadow-none",
        glow: "bg-content1",
        hudSurface:
            "bg-gradient-to-br from-warning/15 via-background/30 to-background/5",
        hudIconBg: "bg-warning/15 text-warning",
    },
    [status.connection.online]: {
        bg: "bg-success/5 hover:bg-success/10",
        border: "border-default/20",
        text: "text-success",
        shadow: "shadow-success-glow",
        glow: "bg-success",
        hudSurface:
            "bg-gradient-to-br from-success/15 via-background/30 to-background/10",
        hudIconBg: "bg-success/15 text-success",
    },
    [status.connection.connected]: {
        bg: "bg-success/5 hover:bg-success/10",
        border: "border-default/20",
        text: "text-success",
        shadow: "shadow-success-glow",
        glow: "bg-success",
        hudSurface:
            "bg-gradient-to-br from-success/15 via-background/30 to-background/10",
        hudIconBg: "bg-success/15 text-success",
    },
    [status.connection.polling]: {
        bg: "bg-warning/5 hover:bg-warning/10",
        border: "border-default/20",
        text: "text-warning",
        shadow: "shadow-none",
        glow: "bg-warning",
        hudSurface:
            "bg-gradient-to-br from-warning/15 via-background/30 to-background/5",
        hudIconBg: "bg-warning/15 text-warning",
    },
    [status.connection.offline]: {
        bg: "bg-content1/5 hover:bg-content1/10",
        border: "border-default/10",
        text: "text-foreground/40",
        shadow: "shadow-none",
        glow: "bg-content1",
        hudSurface:
            "bg-gradient-to-br from-content1/10 via-background/30 to-background/5",
        hudIconBg: "bg-content1/15 text-foreground/60",
    },
    [status.connection.error]: {
        bg: "bg-danger/5 hover:bg-danger/10",
        border: "border-default/20",
        text: "text-danger",
        shadow: "shadow-danger-glow",
        glow: "bg-danger",
        hudSurface:
            "bg-gradient-to-br from-danger/20 via-background/25 to-background/5",
        hudIconBg: "bg-danger/15 text-danger",
    },
    [statusVisualKeys.tone.primary]: {
        bg: "bg-primary/10",
        border: "border-primary/30",
        text: "text-primary",
        shadow: "shadow-none",
        glow: "bg-primary",
        panel: "border-primary/40 bg-primary/10 text-primary",
        button: "text-primary hover:text-primary-600 hover:bg-primary/10",
    },
    [statusVisualKeys.tone.success]: {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        shadow: "shadow-none",
        glow: "bg-success",
        panel: "border-success/40 bg-success/10 text-success",
        button: "text-success hover:text-success-600 hover:bg-success/10",
    },
    [statusVisualKeys.tone.warning]: {
        bg: "bg-warning/10",
        border: "border-warning/30",
        text: "text-warning",
        shadow: "shadow-none",
        glow: "bg-warning",
        panel: "border-warning/30 bg-warning/10 text-warning",
        button: "text-warning hover:text-warning-600 hover:bg-warning/10",
    },
    [statusVisualKeys.tone.danger]: {
        bg: "bg-danger/10",
        border: "border-danger/30",
        text: "text-danger",
        shadow: "shadow-none",
        glow: "bg-danger",
        panel: "border-danger/40 bg-danger/5 text-danger",
        button: "text-danger hover:text-danger-600 hover:bg-danger/10",
    },
    [statusVisualKeys.tone.muted]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-foreground/30",
        shadow: "shadow-none",
        glow: "bg-content1",
    },
    [statusVisualKeys.tone.neutral]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-default-500",
        shadow: "shadow-none",
        glow: "bg-content1",
        button: "text-default-500 hover:text-foreground hover:bg-default-200",
    },
    [statusVisualKeys.speed.down]: {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        shadow: "shadow-none",
        glow: "bg-success",
    },
    [statusVisualKeys.speed.seed]: {
        bg: "bg-primary/10",
        border: "border-primary/30",
        text: "text-primary",
        shadow: "shadow-none",
        glow: "bg-primary",
    },
    [statusVisualKeys.speed.idle]: {
        bg: "bg-content1/10",
        border: "border-default/20",
        text: "text-foreground/60",
        shadow: "shadow-none",
        glow: "bg-content1",
    },
} satisfies Record<
    StatusVisualKeyFromKeys<typeof statusVisualKeys>,
    StatusVisualRecipe
>;

/* =========================================
   DOMAIN: PERFORMANCE
========================================= */
const performance = resolvedPerformance;

/* =========================================
   DOMAIN: TIMING
========================================= */
const timing = resolvedTiming;

/* =========================================
   DOMAIN: LAYOUT
========================================= */
const layout = {
    table: tableLayout,
    pieceMap: {
        columns: pieceMapLayout.columns,
        baseRows: pieceMapLayout.base_rows,
        maxRows: pieceMapLayout.max_rows,
        cellSize: pieceMapLayout.cell_size,
        cellGap: pieceMapLayout.cell_gap,
    },
    heatmap: {
        sampleLimit:
            pieceMapLayout.columns * heatmapLayout.sample_limit_multiplier,
        zoomLevels: heatmapLayout.zoom_levels,
        cellSize: heatmapLayout.cell_size,
        cellGap: heatmapLayout.cell_gap,
        shadowBlurMax: heatmapShadowBlurMax,
        hoverStrokeWidth: heatmapHoverStrokeWidth,
        hoverStrokeInset: heatmapHoverStrokeInset,
        cellStrokeInset: heatmapCellStrokeInset,
        useUiSamplingShim: heatmapUseUiSamplingShim,
    },
    peerMap: peerMapLayout,
} as const;

/* =========================================
   DOMAIN: SHELL
========================================= */

/* =========================================
   DOMAIN: INTERACTION
========================================= */
const interaction = {
    config: interactionConfig,
    chart: {
        width: interactionChart.width,
        height: interactionChart.height,
    },
} as const;

/* =========================================
   DOMAIN: VISUALS
========================================= */
const visuals = {
    status: {
        keys: statusVisualKeys,
        recipes: statusVisuals,
        chip: {
            layout: statusChip,
            style: statusChipStyle,
        },
    },
    transitions: transitionTokens,
    interactive: interactiveRecipe,
    state: visualState,
    typography: {
        trackingLabel: trackingLabel,
        headerBase: tableVisualTokens.headerBase,
        textRoles: textRoleTokens,
    },
    surface: {
        border: tableVisualTokens.surfaceBorder,
    },
    table: {
        headerClass: tableHeaderClass,
        cellBaseClass: tableVisualTokens.cellBaseClass,
        cellPaddingClass: tableVisualTokens.cellPaddingClass,
        cellClass: tableVisualTokens.cellClass,
        rowClass: tableVisualTokens.rowClass,
    },
    icon: {
        size: iconTokens.size,
        strokeWidth: iconTokens.strokeWidth,
        strokeWidthDense: iconTokens.strokeWidthDense,
    },
} as const;

/* =========================================
   DOMAIN: VISUALIZATIONS
========================================= */
const visualizations = {
    details: {
        tabContentMaxHeight: detailsTabContentMaxHeight,
        pieceMap: detailsPieceMapConfig,
        peerMap: detailsPeerMapConfig,
        scatter: detailsScatterConfig,
        tooltipAnimation: detailsTooltipAnimation,
        tooltipOpacityAnimation: detailsTooltipOpacityAnimation,
        availabilityHeatmap: detailsAvailabilityHeatmap,
        speedWindowOptions: visualizationPrimitives.speedWindowOptions,
        speedChart: {
            config: detailsSpeedChart,
            lineWidth: detailsSpeedChart.line_width,
            fillAlpha: detailsSpeedChart.fill_alpha,
            downStrokeToken: detailsSpeedChart.down_stroke_token,
            upStrokeToken: detailsSpeedChart.up_stroke_token,
            canvasDenomFloor: defaultSpeedVisualization.canvasDenomFloor,
            smoothDecay: defaultSpeedVisualization.smoothDecay,
            retentionMs: defaultSpeedVisualization.retentionMs,
            bucketWidthSmall: defaultSpeedVisualization.bucketWidthSmall,
            bucketWidthMed: defaultSpeedVisualization.bucketWidthMed,
            bucketCountSmall: defaultSpeedVisualization.bucketCountSmall,
            bucketCountMed: defaultSpeedVisualization.bucketCountMed,
        },
    },
} as const;

/* =========================================
   DOMAIN: UI
========================================= */
const ui = {
    designSystemAuthority: designSystemAuthority,
    resizeHandle: {
        minVisualWidth: uiPrimitives.minHandleVisualWidth,
        hitAreaClass: uiPrimitives.handleHitareaClass,
    },
    dropOverlay: {
        role: uiPrimitives.dropOverlayRole,
        titleRole: uiPrimitives.dropOverlayTitleRole,
    },
    scaleBases,
    bases: uiBases,
} as const;

export const registry = {
    defaults,
    runtime,
    performance,
    timing,
    layout,
    shell,
    interaction,
    visuals,
    visualizations,
    ui,
} as const;


import { HEADER_BASE, INTERACTIVE_RECIPE, SURFACE_BORDER, TRANSITION, VISUAL_STATE } from "@/config/logic";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED, withColor, withOpacity } from "@/config/textRoles";
const GLASS_SURFACE_DIAL = {
    opacity: {
        panel: "bg-content1/10",
        workbench: "bg-transparent",
        pane: "bg-content1/55",
        modal: "bg-content1/80",
        overlay: "bg-background/90",
    },
    blur: {
        panel: "blur-glass",
        soft: "backdrop-blur-sm",
        floating: "backdrop-blur-xl",
    },
    border: {
        soft: "border border-default/10",
        strong: "border border-default/20",
    },
    radius: {
        panel: "rounded-panel",
        modal: "rounded-modal",
        raised: "rounded-2xl",
        full: "rounded-full",
    },
    elevation: {
        panel: "shadow-small",
        overlay: "shadow-medium",
        floating: "shadow-visual-large",
        menu: "shadow-menu-large",
    },
} as const;

const GLASS_PANE_SURFACE = `flex flex-col min-h-0 overflow-hidden ${GLASS_SURFACE_DIAL.radius.panel} ${GLASS_SURFACE_DIAL.border.strong} ${GLASS_SURFACE_DIAL.elevation.panel} ${GLASS_SURFACE_DIAL.opacity.pane}`;
const GLASS_MENU_SURFACE = `glass-panel surface-layer-2 text-foreground outline-none ring-0 ${GLASS_SURFACE_DIAL.elevation.menu} ${GLASS_SURFACE_DIAL.radius.modal}`;
const GLASS_MENU_FRAME = `overflow-hidden ${GLASS_SURFACE_DIAL.border.strong} p-tight`;
const GLASS_OVERLAY_SURFACE = `${GLASS_SURFACE_DIAL.border.strong} ${GLASS_SURFACE_DIAL.opacity.overlay} ${GLASS_SURFACE_DIAL.blur.floating} ${GLASS_SURFACE_DIAL.elevation.overlay}`;

const GLASS_ROLE_CORE = {
    surface: {
        workbench: `glass-panel surface-layer-1 text-foreground ${GLASS_SURFACE_DIAL.opacity.workbench}`,
        panel: `${GLASS_SURFACE_DIAL.radius.panel} ${GLASS_SURFACE_DIAL.border.soft} overflow-hidden ${GLASS_SURFACE_DIAL.opacity.panel}`,
        pane: GLASS_PANE_SURFACE,
        modal: `glass-panel surface-layer-2 text-foreground ${GLASS_SURFACE_DIAL.elevation.floating} ${GLASS_SURFACE_DIAL.radius.modal} flex flex-col overflow-hidden ${GLASS_SURFACE_DIAL.border.strong}`,
        inset: `surface-layer-1 ${GLASS_SURFACE_DIAL.radius.panel} p-tight`,
        menu: `${GLASS_MENU_SURFACE} ${GLASS_MENU_FRAME}`,
        overlay: GLASS_OVERLAY_SURFACE,
    },
    chrome: {
        edgeTop: "border-t border-default/50",
        edgeBottom: "border-b border-default/50",
        sticky: `sticky top-0 z-sticky bg-background/80 ${GLASS_SURFACE_DIAL.blur.soft}`,
        divider: "border-default/20",
    },
    state: {
        interactive: INTERACTIVE_RECIPE.buttonDefault,
        disabled: VISUAL_STATE.disabled,
    },
    text: {
        heading: TEXT_ROLE.heading,
        headingSection: TEXT_ROLE.headingSection,
        bodyStrong: TEXT_ROLE.bodyStrong,
        body: TEXT_ROLE.body,
        label: TEXT_ROLE.label,
        muted: TEXT_ROLE.bodyMuted,
        caption: TEXT_ROLE.caption,
        code: TEXT_ROLE.code,
    },
} as const;

const MODAL_SURFACE_HEADER = GLASS_ROLE_CORE.chrome.edgeBottom;
const MODAL_SURFACE_FOOTER = GLASS_ROLE_CORE.chrome.edgeTop;
const MENU_SURFACE_LIST = "overflow-hidden outline-none ring-0";
export const MENU_ITEM_SURFACE =
    "rounded-panel px-panel py-tight text-scaled font-medium cursor-pointer " +
    "outline-none focus:outline-none focus-visible:outline-none " +
    "ring-0 focus:ring-0 focus-visible:ring-0 " +
    "transition-all duration-150 ease-out " +
    "hover:bg-content2 hover:text-foreground hover:translate-y-[-1px] " +
    "focus-visible:bg-content2 focus-visible:text-foreground " +
    "active:bg-content3 active:translate-y-0";
const MENU_LIST_CLASSNAMES = {
    base: "outline-none ring-0",
    list: MENU_SURFACE_LIST,
} as const;
const MENU_ITEM_CLASSNAMES = { base: MENU_ITEM_SURFACE } as const;
const MENU_SECTION_HEADING = GLASS_ROLE_CORE.text.label;
const MENU_PANEL_HEADER = `px-panel py-tight border-b border-content1/10 mb-tight flex items-center gap-tools`;
const MENU_PANEL_HEADER_ICON = "text-foreground/30";
const MENU_PANEL_HEADER_TEXT = `${TEXT_ROLE.label} text-foreground/40 truncate`;
const MENU_ACTION_BUTTON_BASE = `w-full flex items-center gap-tools px-panel py-tight rounded-xl ${TEXT_ROLE.buttonText}`;
const MENU_ACTION_BUTTON = `${MENU_ACTION_BUTTON_BASE} ${INTERACTIVE_RECIPE.menuItem}`;
const MENU_ACTION_BUTTON_DANGER = `${MENU_ACTION_BUTTON_BASE} ${withColor(TEXT_ROLE.buttonText, "danger")} ${INTERACTIVE_RECIPE.menuItemDanger} border-t border-content1/10 mt-tight`;
const STATUS_CHIP_PATTERN = {
    base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
    content: "font-bold text-scaled tracking-wider whitespace-nowrap text-foreground",
    container: "min-w-0 w-full flex items-center justify-center h-full",
    contentWrap: "flex items-center justify-center gap-tools",
    warningIcon: "toolbar-icon-size-md text-warning",
    currentIcon: "text-current",
    label: "truncate max-w-full",
} as const;
const TABLE_HEADER_PATTERN = {
    compactCell: "px-panel py-tight",
    sectionDividerCell: "border-b border-default/10 px-tight py-panel",
    iconCell: "border-b border-default/10 py-panel pl-panel pr-tight",
    statusCell: "border-b border-default/10 py-panel pl-tight pr-panel text-right",
} as const;
const PANEL_SURFACE_INSET_FRAME = `${GLASS_SURFACE_DIAL.radius.panel} ${GLASS_SURFACE_DIAL.border.soft} overflow-hidden`;
const MODAL_BASE_CLASSNAMES = {
    base: GLASS_ROLE_CORE.surface.modal,
} as const;
const MODAL_COMPACT_CLASSNAMES = {
    base: `${GLASS_ROLE_CORE.surface.modal} w-full max-w-modal-compact`,
} as const;
const MODAL_BASE_WRAPPER_HIDDEN_CLASSNAMES = {
    base: GLASS_ROLE_CORE.surface.modal,
    wrapper: "overflow-hidden",
} as const;
const MODAL_CHROME_CLASSNAMES = {
    body: "p-tight",
    header: `p-none select-none ${GLASS_SURFACE_DIAL.blur.panel}`,
    footer: "p-none select-none",
} as const;
const SURFACE_TOOLTIP = {
    content: `${GLASS_SURFACE_DIAL.opacity.modal} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.blur.floating} ${GLASS_SURFACE_DIAL.elevation.floating} ${GLASS_SURFACE_DIAL.radius.raised} px-panel py-tight text-scaled leading-tight text-foreground/90`,
    arrow: GLASS_SURFACE_DIAL.opacity.modal,
} as const;
const GLASS_SEMANTIC_CHROME = {
    dividerSoft: SURFACE_BORDER,
    headerBorder: MODAL_SURFACE_HEADER,
    footerBorder: MODAL_SURFACE_FOOTER,
    headerPassive: `${MODAL_SURFACE_HEADER} select-none`,
    footerEnd: `${MODAL_SURFACE_FOOTER} flex justify-end gap-tools`,
    footerActionsPadded: `${MODAL_SURFACE_FOOTER} px-stage py-panel flex items-center justify-end gap-tools`,
} as const;
const SURFACE_MODAL = {
    baseClassNames: MODAL_BASE_CLASSNAMES,
    compactClassNames: MODAL_COMPACT_CLASSNAMES,
    baseWrapperHiddenClassNames: MODAL_BASE_WRAPPER_HIDDEN_CLASSNAMES,
    chromeClassNames: MODAL_CHROME_CLASSNAMES,
    baseClass: GLASS_ROLE_CORE.surface.modal,
} as const;
const SURFACE_MENU = {
    surface: GLASS_ROLE_CORE.surface.menu,
    dirPickerSurface: `min-w-dir-picker ${GLASS_ROLE_CORE.surface.menu}`,
    minWidthSurface: "min-w-(--tt-menu-min-width)",
    listClassNames: MENU_LIST_CLASSNAMES,
    itemClassNames: MENU_ITEM_CLASSNAMES,
    itemSplitClassNames: {
        base: `${MENU_ITEM_SURFACE} flex items-center justify-between`,
    } as const,
    itemStrong: "font-semibold",
    itemNested: "pl-stage",
    itemPinned: "font-semibold text-foreground",
    itemSelectedPrimary: "bg-primary/15 text-primary",
    flagInlineWrap: "text-lg leading-none",
    checkIconPrimary: "text-primary",
    sectionHeading: MENU_SECTION_HEADING,
    panelHeader: MENU_PANEL_HEADER,
    panelHeaderIcon: MENU_PANEL_HEADER_ICON,
    panelHeaderText: MENU_PANEL_HEADER_TEXT,
    actionButton: MENU_ACTION_BUTTON,
    dangerActionButton: MENU_ACTION_BUTTON_DANGER,
} as const;
const SURFACE_ATOM = {
    iconButton: `surface-layer-1 ${GLASS_SURFACE_DIAL.border.soft}`,
    textCurrent: "text-current",
    objectContain: "object-contain",
    codeInline: "bg-content1/20 px-tight py-tight rounded",
    insetRounded: GLASS_ROLE_CORE.surface.inset,
    insetRoundedFull: `surface-layer-1 ${GLASS_SURFACE_DIAL.radius.full} p-tight`,
    insetBorderedItem: `${GLASS_SURFACE_DIAL.radius.panel} ${GLASS_SURFACE_DIAL.border.strong} p-tight`,
    progressTrack: "bg-content1/20 h-full",
    progressIndicatorPaused: "bg-gradient-to-r from-warning/50 to-warning",
    progressIndicatorSeeding: "bg-gradient-to-r from-primary/50 to-primary",
    progressIndicatorActive: "bg-gradient-to-r from-success/50 to-success",
    glassPanel: "glass-panel surface-layer-1 text-foreground",
    shadowBlock: GLASS_SURFACE_DIAL.elevation.panel,
    shadowPanel: GLASS_SURFACE_DIAL.elevation.overlay,
    glassBlock: "acrylic shadow-inner",
} as const;
const ROLE_PANEL_INSET_BASE = `${PANEL_SURFACE_INSET_FRAME} ${GLASS_SURFACE_DIAL.opacity.panel}`;
const ROLE_PANEL_RAISED = `${GLASS_SURFACE_DIAL.radius.raised} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.panel}`;
const ROLE_PANEL_MUTED = `${GLASS_SURFACE_DIAL.radius.raised} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.panel}`;
const ROLE_PANEL_INFO = `${GLASS_SURFACE_DIAL.radius.raised} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.workbench}`;
const GLASS_ROLE_SEMANTIC = {
    surface: {
        workbenchShell: `${SURFACE_ATOM.glassBlock} ${SURFACE_ATOM.shadowBlock}`,
        panelInset: ROLE_PANEL_INSET_BASE,
        tooltip: SURFACE_TOOLTIP.content,
        statusModule: `${GLASS_SURFACE_DIAL.radius.modal} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.panel} ${GLASS_SURFACE_DIAL.blur.soft}`,
        panelRaised: ROLE_PANEL_RAISED,
        panelMuted: ROLE_PANEL_MUTED,
        panelInfo: ROLE_PANEL_INFO,
        panelWorkflow: `${GLASS_SURFACE_DIAL.radius.raised} border ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.pane}`,
        sidebarPanel: `flex flex-col border-r ${SURFACE_BORDER} ${GLASS_SURFACE_DIAL.opacity.pane} ${GLASS_SURFACE_DIAL.blur.panel}`,
    },
    chrome: GLASS_SEMANTIC_CHROME,
} as const;
const MODAL_ICON_MD = "toolbar-icon-size-md";
const MODAL_ICON_SM = "toolbar-icon-size-sm shrink-0";
const MODAL_HEADER_ROW_BASE = `${GLASS_SEMANTIC_CHROME.headerBorder} flex justify-between items-center gap-panel px-stage py-panel`;
export const SURFACE = {
    dial: GLASS_SURFACE_DIAL,
    role: GLASS_ROLE_CORE.surface,
    surface: GLASS_ROLE_SEMANTIC.surface,
    state: GLASS_ROLE_CORE.state,
    text: GLASS_ROLE_CORE.text,
    tooltip: SURFACE_TOOLTIP,
    chrome: GLASS_ROLE_CORE.chrome,
    chromeEx: GLASS_ROLE_SEMANTIC.chrome,
    modal: SURFACE_MODAL,
    menu: SURFACE_MENU,
    atom: SURFACE_ATOM,
} as const;
const WORKBENCH_SHELL = `${SURFACE.surface.workbenchShell} surface-layer-2 border border-default/35`;

export const MODAL = {
    baseClassNames: SURFACE.modal.baseClassNames,
    compactClassNames: SURFACE.modal.compactClassNames,
    settingsModalBaseFull: `${SURFACE.modal.baseClass} flex flex-row max-h-full max-w-full`,
    settingsModalBaseRpc: `${SURFACE.modal.baseClass} flex flex-row h-settings max-h-settings min-h-settings`,
    settingsModalWrapper: "overflow-hidden",
    addTorrentModalBase: `${SURFACE.modal.baseClass} w-full`,
    addTorrentModalHeightFull: "h-full",
    addTorrentModalHeightDefault: "max-h-modal-body",
    addTorrentModalChromeClassNames: SURFACE.modal.chromeClassNames,
    sidebar: `${SURFACE.surface.sidebarPanel} ${TRANSITION.slow} absolute inset-y-0 left-0 z-sticky settings-sidebar-shell sm:relative sm:translate-x-0`,
    sidebarHidden: "-translate-x-full",
    sidebarVisible: "translate-x-0",
    sidebarHeader: "p-stage border-b border-content1/10 flex justify-between items-center h-modal-header shrink-0",
    headingFont: "tt-navbar-tab-font",
    iconMd: MODAL_ICON_MD,
    iconSm: MODAL_ICON_SM,
    headerPassive: SURFACE.chromeEx.headerPassive,
    footerEnd: SURFACE.chromeEx.footerEnd,
    footerActionsPadded: SURFACE.chromeEx.footerActionsPadded,
    sidebarCloseButton: "sm:hidden text-foreground/50",
    sidebarBody: "flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide",
    tabButtonBase: `w-full flex items-center gap-panel px-panel py-panel rounded-panel ${TRANSITION.medium} group relative`,
    tabButtonActive: "bg-primary/10 text-primary font-semibold",
    tabButtonInactive: `text-foreground/60 font-medium ${INTERACTIVE_RECIPE.navItem}`,
    tabIcon: "shrink-0 toolbar-icon-size-md",
    tabIconActive: "text-primary",
    tabIconInactive: "text-foreground/50",
    tabIndicator: "absolute settings-tab-indicator bg-primary rounded-r-pill",
    versionWrapper: "p-panel border-t border-content1/10 shrink-0",
    versionText: `${TEXT_ROLE.codeCaption} text-foreground/30`,
    header: `${SURFACE.chromeEx.headerBorder} ${SURFACE.chrome.sticky} shrink-0 h-modal-header flex items-center justify-between px-stage`,
    headerLead: "flex items-center gap-tools",
    headerLeadPrimaryIcon: "text-primary",
    hintText: `${TEXT_ROLE.bodyMuted} leading-relaxed`,
    headerTitleWrap: "flex flex-col",
    headerMobileBack: "sm:hidden -ml-tight text-foreground/50",
    headerUnsaved: `${TEXT_ROLE.statusWarning} animate-pulse tracking-0-2`,
    desktopClose: `text-foreground/40 hidden sm:flex ${INTERACTIVE_RECIPE.dismiss}`,
    contentStack: "flex flex-col space-y-stage sm:space-y-stage pb-stage",
    scrollContent: "flex-1 min-h-0 overflow-y-auto scrollbar-hide",
    alert: "mb-panel px-panel py-tight",
    inlineAlert: "px-panel py-tight",
    connectionStack: "space-y-stage",
    footer: `${SURFACE.chromeEx.footerBorder} sticky bottom-0 z-panel shrink-0 bg-content1/40 blur-glass px-stage py-stage flex items-center justify-between`,
    footerConfirmContent: "w-full flex items-center gap-panel",
    footerTextWrap: "flex flex-col min-w-0",
    footerWarningTitle: `${TEXT_ROLE.bodyStrong} text-warning`,
    footerActions: "flex gap-tools ml-auto shrink-0",
    footerButtonRow: "flex gap-tools ml-auto",
    footerResetButton: `opacity-70 ${INTERACTIVE_RECIPE.buttonDefault}`,
    footerSaveButton: "font-semibold shadow-small shadow-primary/20",
    dialogHeader: `${SURFACE.chromeEx.headerBorder} flex items-center justify-between gap-tools px-panel py-panel`,
    dialogHeaderLead: "flex items-center gap-tools",
    dialogHeaderIconWrap: SURFACE.atom.insetRoundedFull,
    dialogHeaderWarningIcon: "toolbar-icon-size-md text-warning",
    dialogBody: "flex flex-col gap-stage p-panel",
    dialogSectionStack: "flex flex-col gap-tight",
    dialogInsetStack: "flex flex-col gap-tight",
    dialogInsetPanel: SURFACE.atom.insetRounded,
    dialogInsetItem: SURFACE.atom.insetBorderedItem,
    dialogLocationRow: `flex items-center gap-tools ${SURFACE.atom.insetRounded}`,
    dialogLocationIcon: "toolbar-icon-size-md text-foreground",
    dialogLocationLabel: `${TEXT_ROLE.code} truncate`,
    dialogInsetTitle: `${TEXT_ROLE.bodySmall} font-semibold text-foreground`,
    dialogInsetLabel: `${TEXT_ROLE.bodySmall} font-medium text-foreground truncate`,
    dialogInsetDescription: `${TEXT_ROLE.bodySmall} truncate`,
    dialogOutcomePanel: `${SURFACE.atom.insetRounded} ${TEXT_ROLE.bodySmall}`,
    dialogFooter: `${SURFACE.chromeEx.footerBorder} flex items-center justify-between gap-tools px-panel py-panel`,
    dialogFooterGroup: "flex items-center gap-tools",
    dialogSecondaryAction: "font-medium text-foreground",
    dialogPrimaryAction: "font-bold",
    contentWrapper: "h-full flex flex-col",
    layout: "flex flex-row flex-1 min-h-0 overflow-hidden relative",
    mainPane: "flex-1 min-h-0 flex flex-col bg-content1/10 blur-glass relative w-full",
    workflow: {
        gateRoot: "flex flex-col h-full",
        header: MODAL_HEADER_ROW_BASE,
        titleStack: "flex flex-col overflow-hidden gap-tight",
        sourceLabelCaption: `${TEXT_ROLE.caption} truncate font-mono leading-tight`,
        sourceMutedLabel: `${TEXT_ROLE.codeMuted} text-foreground/50 truncate leading-tight`,
        iconMd: MODAL_ICON_MD,
        iconMdPrimary: `${MODAL_ICON_MD} text-primary`,
        iconLgPrimary: "toolbar-icon-size-lg text-primary",
        iconMdSuccess: `${MODAL_ICON_MD} text-success`,
        iconMdWarning: `${MODAL_ICON_MD} text-warning`,
        iconAlert: `${MODAL_ICON_MD} shrink-0`,
        iconAlertMuted: `${MODAL_ICON_MD} shrink-0 text-foreground/50`,
        warningTone: "text-warning",
        footerAlertText: `${TEXT_ROLE.bodyStrong} truncate`,
        headerIconButton: `text-foreground/60 ${INTERACTIVE_RECIPE.textReveal}`,
        gateBody: "flex-1 min-h-0 flex items-center justify-center",
        gateContent: "w-full max-w-modal",
        formRoot: "flex flex-col min-h-0 flex-1 relative",
        submitOverlay:
            "absolute inset-0 flex flex-col items-center justify-center text-foreground/50 gap-tools z-modal-internal bg-background/40 blur-glass",
        submitHintMuted: `${TEXT_ROLE.codeMuted} text-foreground/40 text-center max-w-modal`,
        submitWarningTitleCaption: `${TEXT_ROLE.codeCaption} text-foreground/70`,
        submitActions: "flex gap-tools",
        headerActions: "flex items-center gap-tools",
        headerDivider: "h-status-chip w-px bg-content1/10 mx-tight",
        body: "flex-1 min-h-0 relative p-add-modal-pane-gap",
        dropOverlay:
            "absolute inset-0 z-drop-overlay bg-primary/20 blur-glass border-divider border-primary border-dashed m-panel rounded-panel flex items-center justify-center pointer-events-none",
        dropOverlayChip:
            "bg-background px-stage py-tight rounded-pill shadow-small flex items-center gap-tools animate-pulse",
        panelGroup: "flex-1 min-h-0",
        paneHandle: `w-add-modal-pane-gap flex items-stretch justify-center bg-transparent z-panel ${TRANSITION.fast} group focus:outline-none relative`,
        paneHandleEnabled: "cursor-col-resize",
        paneHandleDisabled: "cursor-default pointer-events-none",
        resizeHandleBarWrap: "absolute inset-x-0 py-panel flex justify-center pointer-events-none",
        filePanel: `${SURFACE.atom.glassPanel} ${SURFACE.role.pane}`,
        filePanelContent: "flex flex-col flex-1 min-h-0 outline-none border-default",
        filePanelToolbar: "p-tight border-b border-default/50 flex gap-tools items-center surface-layer-1 blur-glass",
        fileTableShell: "h-full w-full min-h-0 rounded-xl overflow-hidden shadow-inner",
        filesTitle: `${TEXT_ROLE.labelDense} flex-1 pl-tight select-none text-foreground/40`,
        smartSelectButton: `${SURFACE.atom.iconButton} min-w-badge px-tight`,
        dropdownDangerItem: "text-danger",
        footerAlerts: "flex flex-col gap-tools",
        footerAlert: "flex items-center gap-tools max-w-modal-compact p-tight",
        footerInfoAlert: "flex items-center gap-tools max-w-modal-compact p-tight text-foreground/70",
        footerActionsStack: "flex flex-col gap-tools sm:items-end sm:justify-end",
        footerActionsRow: "flex flex-wrap items-center justify-end gap-tools",
        footer: `${SURFACE.chromeEx.footerBorder} flex flex-col gap-panel px-stage py-panel sm:flex-row sm:items-end sm:justify-between`,
        inlineBlock: "inline-block",
        cancelButton: "font-medium",
        primaryButton: "font-bold px-stage min-w-button",
        fileCountChipClassNames: {
            content: `${TEXT_ROLE.code} font-bold`,
        } as const,
    } as const,
    builder: {
        paneHandleClass: (isSettingsCollapsed: boolean) =>
            `${MODAL.workflow.paneHandle} ${isSettingsCollapsed ? MODAL.workflow.paneHandleDisabled : MODAL.workflow.paneHandleEnabled}`,
        bodyPanelsClass: (isFullscreen: boolean) =>
            isFullscreen ? "flex flex-col flex-1 min-h-settings h-full min-h-0" : "flex flex-col flex-1 min-h-settings",
        settingsPanelClass: (isSettingsCollapsed: boolean) =>
            [
                SURFACE.atom.glassPanel,
                SURFACE.role.pane,
                "bg-background/65",
                isSettingsCollapsed ? "min-w-0 w-0 border-none" : "",
            ]
                .filter(Boolean)
                .join(" "),
        settingsModalClassNames: (isFullMode: boolean) =>
            ({
                base: isFullMode ? MODAL.settingsModalBaseFull : MODAL.settingsModalBaseRpc,
                wrapper: MODAL.settingsModalWrapper,
            }) as const,
        addTorrentModalClassNames: (params: { showDestinationGate: boolean; isFullscreen: boolean }) =>
            ({
                ...MODAL.addTorrentModalChromeClassNames,
                base: `${MODAL.addTorrentModalBase} ${!params.showDestinationGate && params.isFullscreen ? MODAL.addTorrentModalHeightFull : MODAL.addTorrentModalHeightDefault}`,
            }) as const,
        resizeHandleBarClass: (params: { isSettingsCollapsed: boolean; isPanelResizeActive: boolean }) =>
            params.isSettingsCollapsed
                ? `h-full w-divider ${TRANSITION.fast} bg-transparent`
                : `h-full w-divider ${TRANSITION.fast} ${params.isPanelResizeActive ? "bg-primary/55" : "bg-default/30 group-hover:bg-primary/45"}`,
    } as const,
} as const;
const FORM_STATUS_TONE_CLASS = (statusKind: string) =>
    statusKind === "danger" ? "text-danger" : statusKind === "warning" ? "text-warning" : "text-foreground/60";
// Justification: settings input semantics depend on state (`disabled`, `mono`);
// this builder prevents repeated inline classNames objects in renderers.
const SETTINGS_BUFFERED_INPUT_CLASS_NAMES = (params: { disabled: boolean; mono: boolean }) => ({
    inputWrapper: params.disabled
        ? `h-button ${TRANSITION.fast} ${VISUAL_STATE.disabled}`
        : `h-button ${TRANSITION.fast} group-hover:border-primary/50`,
    input: params.mono
        ? `${withOpacity(TEXT_ROLE.body, 90)} font-mono tracking-tight`
        : `${withOpacity(TEXT_ROLE.body, 90)} font-medium`,
    label: `${TEXT_ROLE_EXTENDED.settingsLabel} font-medium mb-tight`,
});
const SETTINGS_TRACKING_STYLE = {
    wide: {
        letterSpacing: "var(--tt-tracking-wide)",
    },
    ultra: {
        letterSpacing: "var(--tt-tracking-ultra)",
    },
} as const;
const SETTINGS_SLIDER_VALUE_BADGE_STYLE = {
    minWidth: "var(--tt-badge-min-width)",
} as const;
export const FORM = {
    sectionMarginTop: "mt-panel",
    sectionContentOffsetStack: "space-y-stage mt-panel",
    sectionCard: `${SURFACE.surface.panelRaised} p-panel`,
    sectionCardEmphasized: `${SURFACE.surface.panelWorkflow} p-panel`,
    sectionTitle: `${TEXT_ROLE.heading} text-foreground/40 mb-panel leading-tight`,
    sectionTitleTrackingStyle: SETTINGS_TRACKING_STYLE.ultra,
    sectionDescription: `${TEXT_ROLE.body} mb-panel`,
    sectionDescriptionTrackingStyle: SETTINGS_TRACKING_STYLE.wide,
    sectionContentStack: "space-y-stage",
    bodyStackPanel: "space-y-panel py-panel",
    stackTools: "flex flex-col gap-tools",
    systemRow: "flex flex-col gap-tight",
    systemRowHeader: "flex items-center justify-between h-row px-panel",
    systemRowLabel: `${withOpacity(TEXT_ROLE.body, 80)} font-medium`,
    systemRowControl: "flex items-center gap-tools whitespace-nowrap",
    systemRowHelper: `px-panel ${TEXT_ROLE.caption}`,
    systemStatusChip: `${TEXT_ROLE.bodyStrong} tracking-tight`,
    systemNoticeStack: "mt-panel flex flex-col gap-tight",
    systemNoticeBody: withOpacity(TEXT_ROLE.body, 80),
    systemRootStack: "space-y-stage",
    blockStackTight: "space-y-tight",
    blockRowBetween: "flex justify-between items-center",
    switchBlock: "flex flex-col gap-tight",
    switchRow: "flex justify-between items-center h-control-row",
    switchLabel: `${withOpacity(TEXT_ROLE.body, 80)} font-medium`,
    switchSliderLabel: `${withOpacity(TEXT_ROLE.body, 90)} font-medium`,
    trackingWideStyle: SETTINGS_TRACKING_STYLE.wide,
    sliderValueBadge: "font-medium bg-content2 px-tight py-tight rounded-md text-center",
    sliderValueBadgeStyle: SETTINGS_SLIDER_VALUE_BADGE_STYLE,
    sliderValueText: withOpacity(TEXT_ROLE.code, 80),
    slider: "opacity-90",
    inputGroup: "group flex flex-col gap-tight",
    inputActionGroup: "flex flex-col gap-tight group",
    inputActionRow: "flex w-full items-end gap-tools",
    inputActionFill: "flex-1 min-w-0",
    inputEndIcon: "text-foreground/40 shrink-0 toolbar-icon-size-sm",
    inputActionButton: `h-button px-stage shrink-0 ${TEXT_ROLE.buttonText} tracking-wider uppercase bg-primary/10 text-primary ${INTERACTIVE_RECIPE.buttonPrimary}`,
    daySelectorButton: `h-button px-panel shrink-0 font-semibold tracking-wider uppercase bg-primary/10 text-primary text-scaled min-w-0 ${INTERACTIVE_RECIPE.buttonPrimary}`,
    daySelectorSelected: "font-bold",
    daySelectorUnselected: "text-foreground/60",
    daySelectorList: "flex flex-wrap gap-tools",
    inputPairGrid: "grid gap-panel",
    buttonRow: "flex",
    languageRow: "flex items-center justify-between gap-panel",
    interfaceStack: "space-y-stage",
    interfaceRow: "flex items-start justify-between gap-panel",
    interfaceRowInfo: "min-w-0",
    interfaceRowTitle: withOpacity(TEXT_ROLE.bodyStrong, 80),
    interfaceRowActions: "flex gap-tools shrink-0",
    rawConfigHeader: "flex items-center justify-between gap-panel",
    rawConfigFeedback: "mt-tight",
    rawConfigTitle: withOpacity(TEXT_ROLE.bodyStrong, 80),
    rawConfigDescription: withOpacity(TEXT_ROLE.caption, 50),
    rawConfigStatusSuccess: withColor(TEXT_ROLE.caption, "success"),
    rawConfigStatusDanger: withColor(TEXT_ROLE.caption, "danger"),
    rawConfigCode: withOpacity(TEXT_ROLE.code, 80),
    rawConfigPanel: SURFACE.surface.panelInfo,
    divider: "my-panel opacity-50",
    selectClassNames: {
        trigger: "h-button",
        value: "text-scaled font-medium",
    } as const,
    sliderClassNames: { thumb: "shadow-small" } as const,
    rawConfigTextarea:
        "w-full resize-none border-none bg-transparent px-panel py-panel leading-relaxed selection:bg-primary/40 focus:outline-none",
    locationEditorRoot: `${SURFACE.surface.panelInfo} p-tight space-y-panel`,
    locationEditorCaption: withOpacity(SURFACE.text.headingSection, 70),
    locationEditorError: withColor(SURFACE.text.caption, "danger"),
    locationEditorRow: "flex items-stretch gap-tools",
    locationEditorIconWrap: SURFACE.atom.insetRoundedFull,
    locationEditorIcon: "toolbar-icon-size-md text-foreground",
    locationEditorField: "flex-1 space-y-tight",
    locationEditorValidationRow: "h-status-chip flex items-center",
    locationEditorValidationHint: withOpacity(SURFACE.text.caption, 50),
    locationEditorValidationWarning: withColor(SURFACE.text.caption, "warning"),
    locationEditorFeedbackSlot: "h-24 overflow-hidden",
    workflow: {
        settingsToggleButton: `mr-tight text-foreground/35 ${INTERACTIVE_RECIPE.textMutedReveal}`,
        root: "p-panel flex flex-col flex-1 min-h-0 overflow-y-auto overlay-scrollbar",
        group: "flex flex-col gap-panel mb-panel",
        label: `${TEXT_ROLE_EXTENDED.settingsLabel} mb-panel flex items-center gap-tools`,
        labelIcon: "toolbar-icon-size-md",
        gatePanel: `p-panel flex flex-col gap-panel ${SURFACE.role.panel}`,
        gatePromptRow: `flex items-center gap-tools ${withOpacity(TEXT_ROLE.codeCaption, 40)}`,
        gatePromptIcon: "toolbar-icon-size-md text-foreground/50",
        destinationRow: "flex gap-tools group items-center",
        destinationInputWrap: "w-full flex-1",
        destinationInputIcon: "toolbar-icon-size-md text-primary",
        actionIcon: "toolbar-icon-size-md text-foreground/50",
        status: `h-status-chip flex items-center gap-tools min-w-0 ${TEXT_ROLE.codeMuted}`,
        statusIcon: "toolbar-icon-size-md shrink-0",
        statusSuccessIcon: "toolbar-icon-size-md shrink-0 text-success",
        statusInfoIcon: "toolbar-icon-size-md shrink-0 text-foreground/40",
        statusMessage: "font-bold truncate",
        gateActionsRow: "flex justify-end",
        gateConfirmButton: "font-bold",
        flagsDivider: "my-panel bg-foreground/25",
        flagsGroup: "flex flex-col gap-tools",
        flagsCheckboxes: "flex flex-col gap-tools",
        flagsItemLabel: "flex items-center",
        flagsItemDivider: "bg-content1/5",
        flagsIcon: "toolbar-icon-size-md mr-2 text-foreground/50",
    } as const,
    connection: {
        localRoot: "space-y-tight",
        localHeader: "flex items-center justify-between",
        localHeaderInfo: "min-w-0 space-y-tight",
        localHeaderActions: "flex items-center gap-tools",
        root: "space-y-stage",
        topRow: "flex flex-col gap-tools sm:flex-row sm:items-start sm:justify-between",
        topRowInfo: "min-w-0 space-y-tight",
        topRowActions: "flex flex-wrap items-center gap-stage",
        statusRow: "flex items-center gap-tools",
        statusMeta: "space-y-tight",
        profileTitle: `${TEXT_ROLE.headingSection} truncate`,
        profileEndpoint: `${TEXT_ROLE.caption} font-mono break-all`,
        iconSmall: "toolbar-icon-size-sm shrink-0",
        fieldsStack: "grid gap-tools",
        fieldsPairGrid: "grid gap-tools sm:grid-cols-2",
        inputHeight: "h-button",
        detectingSignin: TEXT_ROLE.caption,
        localModeHint: `${TEXT_ROLE.caption} mt-tight`,
        offlineWarning: withColor(TEXT_ROLE.label, "warning"),
        offlineWarningTrackingStyle: {
            letterSpacing: "var(--tt-tracking-wide)",
        } as const,
        insecureAuthWarning: withColor(TEXT_ROLE.caption, "warning"),
    } as const,
    builder: {
        statusToneClass: FORM_STATUS_TONE_CLASS,
        settingsBufferedInputClassNames: SETTINGS_BUFFERED_INPUT_CLASS_NAMES,
    } as const,
} as const;
const TORRENT_HEADER_CELL_BASE_CLASS = `relative flex items-center h-row border-r border-content1/10 ${TRANSITION.fast} group select-none overflow-visible box-border border-l-2 border-l-transparent`;
const TORRENT_HEADER_ACTIVATOR_BASE_CLASS =
    "flex items-center overflow-hidden h-full truncate whitespace-nowrap text-ellipsis box-border leading-none flex-1 gap-tools text-scaled font-bold uppercase text-foreground/60 pl-tight pr-tight";
const TORRENT_HEADER_ACTIVATOR_TRACKING_STYLE = {
    letterSpacing: "var(--tt-tracking-tight)",
} as const;
const TORRENT_HEADER_RESIZE_HANDLE_CLASS =
    "absolute right-0 top-0 h-full cursor-col-resize touch-none select-none flex items-center justify-end z-overlay w-handle";
const TORRENT_HEADER_RESIZE_BAR_STYLE = {
    width: "var(--tt-divider-width)",
} as const;
const TORRENT_HEADER = {
    activatorTrackingStyle: TORRENT_HEADER_ACTIVATOR_TRACKING_STYLE,
    resizeHandle: TORRENT_HEADER_RESIZE_HANDLE_CLASS,
    resizeBarStyle: TORRENT_HEADER_RESIZE_BAR_STYLE,
    builder: {
        cellClass: (params: { canSort: boolean; isOverlay: boolean; isDragging: boolean }) =>
            [
                TORRENT_HEADER_CELL_BASE_CLASS,
                params.canSort ? "cursor-pointer hover:bg-content1/10" : "cursor-default",
                params.isOverlay ? "bg-content1/90 cursor-grabbing" : "bg-transparent",
                params.isOverlay ? SURFACE.atom.shadowPanel : "",
                params.isDragging && !params.isOverlay ? "opacity-30" : "opacity-100",
            ]
                .filter(Boolean)
                .join(" "),
        activatorClass: (params: { isOverlay: boolean; align: "start" | "center" | "end"; isSelection: boolean }) =>
            [
                TORRENT_HEADER_ACTIVATOR_BASE_CLASS,
                params.isOverlay ? "text-foreground" : "",
                params.align === "center" ? "justify-center" : "",
                params.align === "end" ? "justify-end" : "",
                params.isSelection ? "justify-center" : "",
            ]
                .filter(Boolean)
                .join(" "),
        sortIconClass: (visible: boolean) =>
            `text-primary shrink-0 toolbar-icon-size-sm ${visible ? "opacity-100" : "opacity-0"}`,
        resizeBarClass: (isResizing: boolean) =>
            [
                `bg-foreground/10 ${TRANSITION.fast} rounded-full h-resize-h`,
                "group-hover:bg-primary/50",
                isResizing ? "bg-primary h-resize-h" : "",
            ]
                .filter(Boolean)
                .join(" "),
    } as const,
} as const;
const TABLE_DETAILS_CONTENT_SCROLL_STYLE = (maxHeight: number) => ({
    maxHeight,
});
export const TABLE = {
    shellPanelBase: "relative flex-1 h-full min-h-0 flex flex-col",
    shellPanel: `relative flex-1 h-full min-h-0 flex flex-col m-px overflow-hidden`,
    surface: SURFACE.role.workbench,
    shell: WORKBENCH_SHELL,
    headerGroupRow: "flex w-full min-w-max",
    headerPreviewPadding: "px-(--p-tight)",
    columnHeader: TORRENT_HEADER,
    hostRoot: "flex-1 min-h-0 flex flex-col h-full overflow-hidden relative select-none outline-none",
    hostBorderRadiusStyle: {
        borderRadius: "inherit",
    } as const,
    header: `flex w-full ${SURFACE.chrome.edgeBottom} ${SURFACE.chrome.sticky}`,
    bodyScroll: "relative flex-1 h-full min-h-0 overflow-y-auto w-full overlay-scrollbar",
    bodyScrollStyle: {
        scrollbarGutter: "stable",
    } as const,
    bodyCanvas: "relative w-full min-w-max",
    noResults: `h-full flex items-center justify-center px-stage ${TEXT_ROLE.labelDense}`,
    dragOverlay: `pointer-events-none ${SURFACE.role.overlay} px-panel box-border`,
    dragOverlayContent: "flex h-full w-full items-center",
    marquee: "pointer-events-none absolute rounded-(--r-sm) border border-primary/60 bg-primary/20",
    loadingRoot: "w-full",
    loadingRow: "flex items-center w-full border-b border-content1/5 px-panel",
    loadingSkeletonWrap: "w-full h-indicator",
    loadingSkeleton: "h-full w-full rounded-md bg-content1/10",
    emptyRoot: "h-full flex flex-col items-center justify-center gap-stage px-stage text-foreground/60",
    emptyHintRow: `flex items-center gap-tools ${TEXT_ROLE.label}`,
    emptyHintTrackingStyle: {
        letterSpacing: "var(--tt-tracking-ultra)",
    } as const,
    emptySubtext: TEXT_ROLE.labelMuted,
    emptySubtextTrackingStyle: {
        letterSpacing: "var(--tt-tracking-wide)",
    } as const,
    emptyIcon: "text-primary",
    emptyPreview: "w-full max-w-3xl space-y-tight",
    emptyBar: "h-indicator w-full rounded-full bg-content1/20",
    emptyPreviewRow: "grid grid-cols-torrent gap-tools rounded-2xl bg-content1/10 px-panel py-panel",
    columnHeaderLabel: `flex items-center gap-tight ${TEXT_ROLE.labelDense}`,
    columnHeaderLabelTrackingStyle: {
        letterSpacing: "var(--tt-tracking-ultra)",
    } as const,
    columnHeaderPulseIcon: "text-foreground/50 animate-pulse toolbar-icon-size-md",
    columnSettingsRow: "flex justify-between p-tight",
    columnDefs: {
        nameCell: "flex min-w-0 items-center h-full",
        nameLabel: `font-medium truncate max-w-full ${TRANSITION.fast} cap-height-text`,
        nameLabelPaused: "text-foreground/50",
        progressCell: "flex flex-col gap-tight w-full min-w-0 py-tight",
        progressMetricsRow: "flex justify-between items-end font-medium opacity-80",
        progressSecondary: "text-foreground/40",
        progressBar: "h-indicator",
        progressTrack: SURFACE.atom.progressTrack,
        progressIndicatorPaused: SURFACE.atom.progressIndicatorPaused,
        progressIndicatorSeeding: SURFACE.atom.progressIndicatorSeeding,
        progressIndicatorActive: SURFACE.atom.progressIndicatorActive,
        numericMuted: "text-foreground/60 min-w-0",
        numericSoft: "text-foreground/70 min-w-0",
        numericDim: "text-foreground/50 min-w-0",
        peersRow: "flex items-center justify-end gap-tight text-foreground/60 min-w-0",
        peersIcon: "opacity-50 text-current",
        peersDivider: "opacity-30",
        peersSeedCount: "opacity-50",
    } as const,
    speedCell: {
        root: "relative w-full h-full min-w-0 min-h-0",
        sparkline: "absolute inset-0 w-full h-full overflow-visible opacity-50",
        valueRow: "relative z-panel flex items-center h-full pointer-events-none",
        valueText:
            "font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] dark:drop-shadow-[0_1px_1px_rgba(255,255,255,0.15)]",
    } as const,
    detailsContentRoot: "flex h-full min-h-0 flex-col gap-panel",
    detailsContentPanel: `flex flex-1 min-h-0 flex-col ${SURFACE.surface.panelInset}`,
    detailsContentWarning: "flex flex-col gap-tools",
    detailsContentRecoveryNote: `${withColor(TEXT_ROLE.caption, "warning")} text-warning/80 mb-tight`,
    detailsContentHeaderShell: "p-panel flex flex-col gap-tools",
    detailsContentHeaderRow: "flex items-center justify-between gap-panel",
    detailsContentHeaderMeta: "flex flex-col gap-tight",
    detailsContentHeaderTitle: withOpacity(TEXT_ROLE.headingSection, 60),
    detailsContentSectionHeader: `border-b border-default/10 px-panel py-panel ${TEXT_ROLE.labelPrimary}`,
    detailsContentListHost: "flex-1 min-h-0 overflow-hidden",
    detailsContentListScroll: "h-full min-h-0 overflow-y-auto px-panel py-panel",
    builder: {
        detailsContentScrollStyle: TABLE_DETAILS_CONTENT_SCROLL_STYLE,
    } as const,
} as const;
export const DIAGNOSTIC = {
    statusChipClassNames: {
        base: `${STATUS_CHIP_PATTERN.base} border border-default/20 bg-content1/70`,
        content: `${TEXT_ROLE_EXTENDED.badge} font-semibold`,
    } as const,
    root: "min-h-screen surface-layer-0 text-foreground pb-stage",
    stack: "flex flex-col gap-stage",
    topbar: "flex flex-wrap items-center justify-between gap-tools",
    topbarText: "flex flex-col gap-tight",
    grid: "grid grid-cols-1 lg:grid-cols-2 gap-stage",
    sectionTitle: "text-navbar font-semibold text-foreground",
    panelPrimary: "p-panel",
    panelSecondaryWrap: "lg:border-l lg:border-default/20 lg:pl-panel",
    panelSecondary: "p-panel bg-content1/35",
    stepCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    stepHeader: "flex flex-col gap-tight",
    optionsStack: "flex flex-col gap-tools",
    optionsWrap: "flex flex-wrap items-center gap-tools",
    optionsGridResponsive: "grid grid-cols-1 sm:grid-cols-2 gap-tools",
    optionButtonFull: "h-auto w-full justify-start whitespace-normal text-left",
    optionButtonLeft: "justify-start text-left whitespace-normal",
    optionLabelStrong: "font-medium",
    executeRow: "flex flex-wrap items-center justify-between gap-stage",
    executeActions: "flex flex-wrap items-center justify-end gap-tools",
    stateRow: "flex flex-wrap items-center gap-tools",
    statePill: "surface-layer-1 rounded-pill px-tight py-tight",
    statePillValue: "font-semibold text-foreground",
    smokeCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    smokeRows: "surface-layer-1 rounded-panel p-tight flex flex-col divide-y divide-default/10",
    smokeRow: "py-tight flex flex-wrap items-center justify-between gap-tools",
    verifyCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    verifyTableWrap: "surface-layer-1 rounded-panel overflow-hidden",
    verifyTable: "w-full border-separate border-spacing-0 text-left",
    verifyHead: "bg-background/40",
    verifyHeadRow: "border-b border-default/15",
    verifyHeaderCell: TABLE_HEADER_PATTERN.compactCell,
    verifyRow: "border-b border-default/10 last:border-b-0",
    verifyCell: TABLE_HEADER_PATTERN.compactCell,
    verifyLabelWrap: "flex flex-col gap-tight",
    systemCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    systemRows: "flex flex-col gap-tools",
    systemRowCard: "surface-layer-1 rounded-panel p-tight border-l border-default/20 pl-panel flex flex-col gap-tools",
    systemRowHead: "flex flex-wrap items-center justify-between gap-tools",
    systemStatusRow: "flex flex-wrap items-center gap-stage",
    systemStatusPair: "flex items-center gap-tight",
    systemMeta: "flex flex-wrap items-center gap-stage",
    footer: "fixed bottom-0 left-0 right-0 z-overlay border-t border-default/20 bg-content1/85 p-panel backdrop-blur-xl",
    footerStack: "flex flex-col gap-tools",
    footerRow: "flex flex-wrap items-center justify-between gap-tools",
    footerLeft: "flex flex-wrap items-center gap-tools",
    footerScenarioLabel: "font-semibold text-foreground",
    footerScenario: "surface-layer-1 rounded-panel px-tight py-tight",
    footerSummary: "truncate flex-1 min-w-0",
    footerSummaryMuted: "text-foreground/50",
    footerRight: "flex items-center gap-tools",
    footerExpected: "whitespace-pre-wrap leading-relaxed border-t border-default/10 pt-tight mt-tight",
    footerExpectedTone: "text-foreground/80",
} as const;
const WORKBENCH_NAV = {
    root: "sticky top-0 z-overlay w-full shrink-0 select-none overflow-visible",
    surface: `${SURFACE.role.workbench} ${SURFACE.chrome.edgeBottom}`,
    shell: WORKBENCH_SHELL,
    titlebar: "app-titlebar flex w-full items-stretch",
    titlebarBaseStyle: {
        height: "var(--tt-navbar-h)",
        gap: "var(--spacing-panel)",
    } as const,
    main: "flex grow h-full min-w-0 items-center justify-between gap-stage py-tight relative",
    left: "flex items-center gap-tools min-w-0",
    brandGroup: "flex items-center gap-tools pr-tight",
    brandIconWrap: "flex items-center justify-center",
    brandIconStyle: {
        width: "var(--tt-brand-icon-size)",
        height: "var(--tt-brand-icon-size)",
    } as const,
    brandTextWrap: "hidden xl:flex flex-col justify-center ml-tight",
    brandName: "font-bold tracking-tight text-foreground text-base leading-none text-navbar",
    brandVersion: `${TEXT_ROLE.codeMuted} text-xs font-medium leading-none mt-0.5 text-default-400`,
    primarySeparator: "hidden sm:flex h-sep w-px bg-default-200/50 mx-tight",
    tabsWrap: "hidden xl:flex text-navbar min-w-0",
    tabTitle: "flex items-center gap-tight",
    tabLabel: "hidden 2xl:inline",
    tabIcon: "text-default-400",
    searchWrap: "hidden 2xl:flex",
    searchStyle: {
        width: "var(--tt-search-width)",
        fontSize: "var(--tt-fz-navbar)",
    } as const,
    searchIcon: "text-default-400",
    actions: `flex items-center gap-tools ${TRANSITION.medium} shrink-0 opacity-100`,
    primaryActions: "flex items-center gap-tools min-w-0",
    primaryActionEmphasis: "ring-1 ring-primary/20",
    selectionSeparator: "hidden sm:flex w-px bg-default-200/50 mx-tight",
    selectionSeparatorStyle: {
        height: "calc(var(--tt-navbar-h) / 2)",
    } as const,
    selectionExtraActions: "hidden sm:flex gap-tools",
    selectionPauseEmphasis: "ring-1 ring-warning/30 shadow-sm",
    selectionRecheckEmphasis: "ring-1 ring-default/20 shadow-sm",
    ghostAction: `text-default-400 ${INTERACTIVE_RECIPE.buttonGhost}`,
    ghostActionOverflow: "overflow-visible",
    themeMobileWrap: "flex md:hidden",
    rehashWrap: "absolute inset-x-6 bottom-0 translate-y-1/2",
    rehashTooltipWrap: "relative group cursor-help",
    rehashTrack: "h-track bg-transparent",
    rehashIndicator: "h-full bg-gradient-to-r from-primary to-secondary shadow-nav",
    rehashTooltip: `absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 text-white px-tight py-tight rounded shadow-lg whitespace-nowrap pointer-events-none ${TEXT_ROLE.body} ${INTERACTIVE_RECIPE.groupReveal}`,
    windowControls: "hidden md:flex h-full items-stretch divide-x divide-default/20 overflow-hidden",
    windowControlsStyle: {
        paddingLeft: 0,
        paddingRight: 0,
    } as const,
    toneButtonFallback: {
        primary: `text-primary ${INTERACTIVE_RECIPE.buttonPrimary}`,
        success: `text-success ${INTERACTIVE_RECIPE.buttonDefault}`,
        warning: `text-warning ${INTERACTIVE_RECIPE.buttonDefault}`,
        danger: INTERACTIVE_RECIPE.buttonDanger,
        neutral: `text-default-500 ${INTERACTIVE_RECIPE.buttonGhost}`,
    } as const,
    filterTabsClassNames: {
        base: "",
        tabList:
            "bg-default-100/50 p-tight border border-default-200/50 shadow-inner gap-tight h-navbar-pill overflow-visible",
        cursor: "bg-background shadow-sm border-default-100 h-navbar-cursor rounded-full",
        tab: `px-panel font-semibold text-default-500 text-navbar ${INTERACTIVE_RECIPE.navItem}`,
    } as const,
    searchInputClassNames: {
        base: TRANSITION.medium,
        mainWrapper: "h-navbar-pill",
        input: "text-navbar font-medium text-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis placeholder:opacity-70",
        inputWrapper: `h-full flex items-center gap-tools flex-nowrap font-normal text-default-500 bg-default-100/50 hover:bg-default-200/50 p-tight border border-default-200/50 focus-within:bg-default-100 focus-within:border-primary/20 shadow-inner rounded-full ${TRANSITION.fast}`,
    } as const,
    builder: {
        selectionActionsClass: (hasSelection: boolean) =>
            hasSelection
                ? `flex items-center gap-tools ${TRANSITION.medium} opacity-100`
                : `flex items-center gap-tools ${TRANSITION.medium} opacity-30 pointer-events-none grayscale`,
    } as const,
} as const;
const WORKBENCH_STATUS = {
    surface: `${SURFACE.role.workbench} ${SURFACE.chrome.edgeTop}`,
    iconCurrent: "text-current",
    iconMuted: "opacity-50",
    srOnly: "sr-only",
    statGroup: "flex flex-col gap-tight whitespace-nowrap",
    statGroupDesktop: "hidden sm:flex",
    statGroupEnd: "items-end",
    statGroupStart: "items-start",
    statValueRow: "flex items-center gap-tools",
    statValueText: `${TEXT_ROLE_EXTENDED.statusBarValue} truncate text-right font-semibold`,
    statIcon: "text-foreground/30",
    telemetryIconWrap: "inline-flex items-center",
    speedModule: `flex flex-1 items-center h-full min-w-0 gap-tools group ${SURFACE.surface.statusModule} ${TRANSITION.slow} group-hover:border-content1/40 group-hover:bg-content1/10`,
    speedModuleGraphWrap: "relative flex flex-1 h-full min-w-0 gap-tools",
    speedModuleGraph: `relative flex-1 h-full min-w-0 min-h-0 py-tight overflow-visible opacity-30 grayscale ${TRANSITION.reveal} group-hover:grayscale-0 group-hover:opacity-100`,
    speedModuleGraphCanvas: "absolute inset-0 h-full w-full",
    speedModuleOverlay: "absolute inset-0 flex items-center justify-start px-panel pointer-events-none",
    speedModuleOverlayRow: "flex items-center gap-tools text-foreground",
    speedModuleIconWrap: `flex items-center justify-center rounded-modal ${TRANSITION.fast} toolbar-icon-size-xl`,
    speedModuleTextWrap: "flex flex-col gap-tight text-left",
    speedModuleLabel: `${TEXT_ROLE_EXTENDED.statusBarLabel} text-foreground/40`,
    speedModuleValue: `${TEXT_ROLE.heading} tracking-tight leading-none`,
    speedSeparator: "w-px bg-content1/10",
    engineButton: `relative flex items-center justify-center rounded-modal border px-panel ${TRANSITION.medium} active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer`,
    engineConnectedWrap: "absolute inset-0 flex items-start justify-end p-tight",
    engineConnectedPulse: "absolute inline-flex rounded-full",
    engineConnectedDot: "relative inline-flex rounded-full bg-current",
    footer: `w-full shrink-0 select-none relative z-overlay overflow-visible ${WORKBENCH_SHELL}`,
    main: "flex items-center justify-between gap-stage",
    speedFull: "hidden sm:flex flex-1 items-center h-full py-tight gap-stage min-w-0",
    speedCompact: "flex sm:hidden flex-1 items-center h-full py-tight min-w-0",
    speedCompactGraphWrap: "relative flex-1 h-full min-h-0",
    speedCompactLayer: "absolute inset-0",
    speedCompactUpLayer: "absolute inset-0 z-panel",
    speedCompactDownGraph: "h-full w-full",
    speedCompactUpGraph: "h-full w-full opacity-60 mix-blend-screen",
    speedCompactOverlay: "relative z-overlay flex items-center justify-center h-full pointer-events-none",
    speedCompactOverlayRow: "flex items-center gap-tight text-center",
    speedCompactColumn: "flex flex-col items-center",
    speedCompactDownIcon: "toolbar-icon-size-md text-success",
    speedCompactUpIcon: "toolbar-icon-size-md text-primary",
    speedCompactValue: `${TEXT_ROLE.heading} tracking-tight leading-none`,
    speedCompactDivider: "w-px h-nav bg-content1/10 mx-tight",
    right: "flex shrink-0 items-center border-l border-content1/10 gap-stage",
    telemetryGrid: "grid gap-x-stage gap-y-tight",
} as const;
export const WORKBENCH = {
    root: "tt-app-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20",
    content: "relative z-panel flex w-full flex-1",
    nativeShellBody: "native-shell-body",
    nativeShellInner: "native-shell-inner",
    nativeShellMain: "native-shell-main",
    iconCurrent: "text-current",
    nav: WORKBENCH_NAV,
    status: WORKBENCH_STATUS,
    reconnectToast: "fixed z-toast",
    section: "tt-shell-body flex w-full flex-1 flex-col",
    sectionGapImmersive: "gap-stage",
    sectionGapClassic: "gap-tools",
    immersiveBackgroundRoot: "pointer-events-none absolute inset-0 z-floor",
    immersiveBackgroundBase: "absolute inset-0 bg-background/95",
    immersiveBackgroundPrimaryBlend: "absolute inset-0 mix-blend-screen opacity-50 bg-primary/20",
    immersiveBackgroundSecondaryBlend: "absolute inset-0 mix-blend-screen opacity-40 bg-content1/15",
    immersiveBackgroundNoise: "absolute inset-0 bg-noise opacity-20",
    immersiveBackgroundAccentBottom:
        "absolute left-1/2 -translate-x-1/2 bottom-0 h-shell-accent-large rounded-pill bg-primary/30 blur-glass opacity-40",
    immersiveBackgroundAccentTop:
        "absolute left-1/2 -translate-x-1/2 top-0 h-shell-accent-medium rounded-pill bg-primary/30 blur-glass opacity-35",
    immersiveNavbarWrap: `${WORKBENCH_SHELL} shadow-hud`,
    immersiveMainWrap: `tt-shell-no-drag ${WORKBENCH_SHELL} flex-1 min-h-0 h-full shadow-hud`,
    immersiveMain: "flex-1 min-h-0 h-full overflow-hidden border bg-background/20 shadow-inner",
    immersiveHudSection: "tt-shell-no-drag grid gap-panel",
    immersiveHudCard:
        "glass-panel relative overflow-hidden border border-content1/10 bg-background/55 p-panel shadow-hud",
    immersiveHudDismissButton:
        "absolute rounded-pill bg-content1/20 p-tight text-foreground/60 transition hover:bg-content1/40 hover:text-foreground",
    immersiveHudCardContent: "flex items-start gap-workbench",
    immersiveHudIconWrap: "flex size-icon-btn-lg items-center justify-center rounded-panel",
    immersiveHudTextWrap: "flex-1",
    immersiveHudTextLabel: `mt-tight ${TEXT_ROLE.bodyStrong}`,
    immersiveHudTextDescription: `mt-panel ${TEXT_ROLE.caption}`,
    immersiveStatusWrap: `tt-shell-no-drag ${WORKBENCH_SHELL} bg-background/75 shadow-hud blur-glass`,
    classicStack: "flex-1 min-h-0 h-full flex flex-col gap-tools",
    classicMainWrap: "tt-shell-no-drag flex-1 min-h-0 h-full",
    classicStatusWrap: "tt-shell-no-drag",
} as const;
export const SPLIT = {
    emptyText: `${TEXT_ROLE.bodyStrong} text-foreground/30`,
    emptyPanel: "flex h-full items-center justify-center border-default/10 text-center",
    panelGroup: "flex-1 min-h-0",
    panel: "min-h-0",
    root: "flex flex-col h-full min-h-0 overflow-hidden gap-tools",
    contentStack: "flex flex-col flex-1 min-h-0 gap-panel",
    surfacePanel: "h-full w-full relative overflow-hidden p-panel",
    surfacePanelBody: "h-full w-full relative",
    surfacePanelFill: "absolute inset-0 flex",
    sectionHeader: "flex items-center justify-between mb-tight shrink-0",
    sectionHeaderMeta: withOpacity(TEXT_ROLE.body, 60),
    sectionHeaderCaption: withOpacity(TEXT_ROLE.caption, 50),
    mapStatsRow: `flex flex-wrap justify-between gap-panel ${withOpacity(TEXT_ROLE.body, 50)}`,
    mapStatsTrackingStyle: {
        letterSpacing: "var(--tt-tracking-wide)",
    } as const,
    mapStatColumn: "flex flex-col gap-tight",
    mapStatWarningCount: withColor(TEXT_ROLE.code, "warning"),
    mapStatDangerCount: withColor(TEXT_ROLE.code, "danger"),
    mapNote: withOpacity(TEXT_ROLE.body, 60),
    mapFrame: `relative z-panel flex-1 min-h-0 ${SURFACE.surface.panelRaised} p-panel overflow-hidden`,
    mapFrameInner: "relative h-full w-full",
    mapCanvasLayer: "absolute inset-0 block h-full w-full rounded-2xl",
    mapCanvasOverlayLayer: "absolute inset-0 block h-full w-full rounded-2xl pointer-events-none",
    mapTooltip: `pointer-events-none absolute z-panel max-w-tooltip rounded-2xl border border-content1/30 bg-content1/90 px-panel py-tight shadow-large backdrop-blur-xl ${TEXT_ROLE.body} text-foreground/90`,
    mapTooltipPrimaryLine: "block whitespace-normal font-semibold",
    mapTooltipSecondaryLine: "block whitespace-normal text-foreground/70",
    mapHintWrap: "absolute inset-0 flex items-end justify-end p-tight pointer-events-none",
    mapHintChip: `${TEXT_ROLE.codeCaption} text-foreground/60 bg-content1/40 backdrop-blur-xl border border-content1/25 rounded-full px-panel py-tight`,
    mapLegendRow: "mt-tight flex items-center gap-panel",
    mapLegendItem: "flex items-center gap-tight",
    mapLegendSwatch: "inline-block rounded-panel",
    mapPanel: "flex flex-col h-full w-full",
    hudRow: "flex items-center justify-end gap-tools px-panel",
    hudLabel: `${withOpacity(TEXT_ROLE.label, 40)} mr-2`,
    mapCanvas: "h-full w-full",
    resizeHandle: "h-sep cursor-row-resize flex items-center justify-center",
    resizeBar: `w-24 h-0.5 rounded bg-content1/50 hover:bg-primary/50 ${TRANSITION.fast}`,
    listSurface: `flex-1 min-h-0 relative flex flex-col ${SURFACE.surface.panelRaised}`,
    header: `flex items-center gap-panel px-panel py-tight border-b border-content1/10 ${withOpacity(TEXT_ROLE.label, 30)}`,
    headerFlagCol: "w-col-id",
    headerEndpointCol: "flex-1",
    headerClientCol: "w-col-client",
    headerSpeedCol: "w-col-speed text-right",
    listScroll: "flex-1 min-h-0 overflow-y-auto relative outline-none select-none",
    flagsCol: `w-col-id ${TEXT_ROLE.codeMuted}`,
    flagsWrap: "flex gap-tight",
    flagToken: `cursor-help hover:text-primary ${TRANSITION.fast}`,
    endpointCol: "flex-1 min-w-0 flex items-center gap-tools",
    encryptedIcon: "text-success/50",
    utpIcon: "text-primary/50",
    clientCol: `w-col-client truncate ${withOpacity(TEXT_ROLE.caption, 40)}`,
    downRateCol: `w-col-speed text-right tabular-nums ${withColor(TEXT_ROLE.code, "success")}`,
    upRateCol: `w-col-speed text-right tabular-nums ${withColor(TEXT_ROLE.code, "primary")}`,
    peerMapRoot: `flex flex-col flex-1 ${SURFACE.surface.panelMuted} p-panel gap-tools overflow-hidden relative`,
    peerMapHud: "flex items-center justify-between z-sticky pointer-events-none",
    peerMapHudMeta: "flex flex-col",
    peerMapHudStats: "flex items-center gap-tools",
    peerMapNodeCount: `${TEXT_ROLE.codeMuted} text-foreground/40`,
    peerMapInstrumentInfo: "flex items-center gap-tools",
    peerMapAperture: `${TEXT_ROLE.codeCaption} text-foreground/40`,
    peerMapCompassIcon: "text-primary/50",
    peerMapCanvasWrap: "flex-1 min-h-0 relative",
    peerMapSvg: "w-full h-full cursor-crosshair overflow-visible",
    peerMapRing: `${TRANSITION.fast} opacity-03`,
    peerMapGuides: "pointer-events-none",
    peerMapGuideCircle: "text-foreground/5",
    peerMapGuideAxis: "text-foreground/10",
    peerMapActivityIcon: TRANSITION.reveal,
    peerMapActivityIconActive: "opacity-100 text-primary",
    peerMapActivityIconInactive: "opacity-0",
    peerMapNodeMotion: TRANSITION.medium,
    peerMapNodeGlow: "drop-shadow-primary-small",
    builder: {
        addressClass: (isHostile: boolean) =>
            isHostile ? `${TEXT_ROLE.code} truncate text-danger` : `${TEXT_ROLE.code} truncate text-foreground/90`,
        peerActivityClass: (isInstrument: boolean) =>
            isInstrument ? `${TRANSITION.reveal} opacity-100 text-primary` : `${TRANSITION.reveal} opacity-0`,
        peerNodeClass: (isUTP: boolean) =>
            isUTP ? `${TRANSITION.medium} drop-shadow-primary-small` : TRANSITION.medium,
        rowClass: (params: { hovered: boolean; hostile: boolean }) =>
            params.hostile
                ? `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 bg-danger/5`
                : params.hovered
                  ? `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 bg-primary/10`
                  : `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 hover:bg-content1/5`,
        virtualCanvasStyle: (totalSize: number) =>
            ({
                height: totalSize,
                position: "relative",
            }) as const,
        virtualRowStyle: (params: { top: number; height: number }) =>
            ({
                top: params.top,
                height: params.height,
            }) as const,
        canvasInteractionStyle: (cursor: string) =>
            ({
                cursor,
                touchAction: "none",
                pointerEvents: "auto",
            }) as const,
        legendSwatchStyle: (params: { background: string; borderColor?: string; opacity?: number }) =>
            ({
                width: 14,
                height: 14,
                background: params.background,
                borderWidth: params.borderColor ? "var(--tt-divider-width)" : 0,
                borderStyle: params.borderColor ? "solid" : "none",
                borderColor: params.borderColor,
                opacity: params.opacity,
                display: "inline-block",
            }) as const,
    } as const,
} as const;
const CONTEXT_MENU_PANEL_STYLE = { minWidth: 200 } as const;
export const CONTEXT_MENU = {
    panel: `pointer-events-auto absolute z-popover ${SURFACE.role.menu}`,
    header: SURFACE.menu.panelHeader,
    headerIcon: SURFACE.menu.panelHeaderIcon,
    headerText: SURFACE.menu.panelHeaderText,
    sectionHeading: `border-t ${SURFACE_BORDER} pt-panel`,
    sectionHeadingStrong: `border-t ${SURFACE_BORDER} mt-tight pt-tight font-bold`,
    sectionHeadingTrackingStyle: {
        letterSpacing: "var(--tt-tracking-ultra)",
    } as const,
    sectionNestedItem: "pl-stage",
    editorItem: `border-t ${SURFACE_BORDER} p-0`,
    editorWrap: "px-panel pt-panel",
    actionButton: SURFACE.menu.actionButton,
    dangerActionButton: SURFACE.menu.dangerActionButton,
    builder: {
        anchorStyle: (params: { top: number; left: number }) =>
            ({
                position: "fixed",
                top: params.top,
                left: params.left,
                width: 0,
                height: 0,
            }) as const,
        panelStyle: (params: { x: number; y: number }) => ({
            top: params.y,
            left: params.x,
            ...CONTEXT_MENU_PANEL_STYLE,
        }),
    } as const,
} as const;
const METRIC_CHART_LAYOUT_BUTTON_CLASS = (active: boolean) =>
    active
        ? "rounded-tight bg-background shadow-small text-foreground"
        : "rounded-tight bg-transparent text-foreground/50";
const METRIC_CHART_WINDOW_BUTTON_CLASS = (active: boolean) =>
    active
        ? "rounded-pill px-tight min-w-0 font-medium bg-foreground text-background shadow-small"
        : "rounded-pill px-tight min-w-0 font-medium text-foreground/60";
const METRIC_CHART_CAPACITY_GAUGE_CONTAINER_CLASS = (isInsufficient: boolean) =>
    isInsufficient
        ? `${METRIC_CHART.capacityGauge.container} border-danger/40 bg-danger/5`
        : `${METRIC_CHART.capacityGauge.container} ${SURFACE_BORDER}`;
const METRIC_CHART_CAPACITY_GAUGE_INDICATOR_CLASS = (isInsufficient: boolean) =>
    isInsufficient
        ? "h-full rounded-full bg-gradient-to-r from-danger/70 via-warning/70 to-success/70"
        : "h-full rounded-full bg-gradient-to-r from-success/50 to-success";
export const METRIC_CHART = {
    canvasWrap: "w-full relative min-h-0",
    canvas: "block w-full h-full",
    root: "flex flex-col gap-tools h-full min-h-0",
    header: `flex items-center justify-between shrink-0 ${withOpacity(TEXT_ROLE.code, 60)}`,
    metrics: "flex items-center gap-panel",
    downMetric: "flex items-center gap-tight text-success font-bold",
    upMetric: "flex items-center gap-tight text-primary font-bold",
    controls: "flex items-center gap-tight",
    layoutGroup: "bg-content1/20 rounded-panel p-tight gap-none mr-tight",
    windowGroup: "flex bg-content1/20 rounded-pill p-tight",
    content: "flex-1 min-h-0 flex flex-col gap-panel",
    panel: `flex-1 min-h-0 flex flex-col ${SURFACE.role.panel} p-panel relative`,
    panelLabelWrap: "absolute z-panel pointer-events-none",
    panelSeries: "flex-1",
    baselineMuted: "opacity-10",
    baselineActive: "opacity-60",
    areaMuted: "opacity-20",
    progressBar: {
        track: "relative h-full overflow-hidden rounded-full bg-content1/20",
        indicator: `absolute inset-y-0 left-0 transform origin-left rounded-full ${TRANSITION.slow} ease-out`,
    } as const,
    capacityGauge: {
        container: "space-y-tight rounded-xl border bg-content1/15 p-tight",
        header: `flex items-center justify-between ${TEXT_ROLE.labelDense} text-foreground/60`,
        headerStyle: {
            fontSize: "var(--tt-font-size-base)",
            letterSpacing: "var(--tt-tracking-ultra)",
        } as const,
        baseTextStyle: {
            fontSize: "var(--tt-font-size-base)",
        } as const,
        path: `${TEXT_ROLE.codeMuted} text-foreground/40`,
        progressWrap: "h-sep",
        stats: `flex justify-between ${TEXT_ROLE.codeMuted}`,
        hint: `${TEXT_ROLE.caption} text-foreground/50`,
        errorRow: "flex items-center justify-between gap-tools",
        progressTrack: "h-full bg-content1/20",
        builder: {
            containerClass: METRIC_CHART_CAPACITY_GAUGE_CONTAINER_CLASS,
            indicatorClass: METRIC_CHART_CAPACITY_GAUGE_INDICATOR_CLASS,
        } as const,
    } as const,
    builder: {
        layoutButtonClass: METRIC_CHART_LAYOUT_BUTTON_CLASS,
        windowButtonClass: METRIC_CHART_WINDOW_BUTTON_CLASS,
    } as const,
} as const;
const DASHBOARD_RESIZE_HANDLE_CLASS = (isHorizontalSplit: boolean) =>
    isHorizontalSplit
        ? `group relative z-panel ${TRANSITION.fast} focus:outline-none cursor-col-resize`
        : `group relative z-panel ${TRANSITION.fast} focus:outline-none cursor-row-resize`;
const DASHBOARD_INSPECTOR_PANEL_CLASS = (isHorizontalSplit: boolean) =>
    isHorizontalSplit
        ? "hidden overflow-hidden lg:flex shadow-medium h-full"
        : "hidden overflow-hidden lg:flex shadow-medium w-full";
export const DASHBOARD = {
    root: `relative h-full w-full flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden ${TRANSITION.medium} border-t border-default/10 bg-transparent`,
    content: "relative flex-1 min-h-0 w-full h-full overflow-hidden",
    contentClassicSurface: "bg-background/40",
    dropOverlay: "pointer-events-none absolute inset-0 flex items-center justify-center z-popover",
    dropOverlayAccent: "absolute inset-2 border border-primary/60",
    dropOverlayIconWrap: "relative z-panel",
    dropOverlayIconTone: "text-primary",
    panelGroup: "flex-1 min-h-0 h-full w-full relative overflow-hidden rounded-2xl",
    mainPanel: "relative flex-1 min-h-0 shadow-medium",
    tableHost: "relative z-panel h-full min-h-0 overflow-hidden",
    tableWatermark: "torrent-table-watermark absolute inset-0 z-0 pointer-events-none",
    tableContent: "relative z-panel h-full min-h-0",
    resizeHandleInner: "absolute inset-0 flex items-center justify-center",
    resizeHandleBar: `${TRANSITION.fast} bg-foreground/0 group-hover:bg-foreground/10 group-active:bg-primary/50`,
    inspectorContent: "h-full min-h-0 flex-1",
    section: "flex-1 min-h-0 h-full",
    fullscreenOverlay: "fixed inset-0 z-dnd",
    fullscreenSection: "relative h-full flex items-center justify-center",
    fullscreenBackdrop: "absolute inset-0 pointer-events-none bg-background/60 backdrop-blur-sm",
    fullscreenPanel: `relative z-panel flex h-full w-full flex-col overflow-hidden bg-content1/80 backdrop-blur-xl border ${SURFACE_BORDER} shadow-medium`,
    builder: {
        resizeHandleClass: DASHBOARD_RESIZE_HANDLE_CLASS,
        inspectorPanelClass: DASHBOARD_INSPECTOR_PANEL_CLASS,
    } as const,
} as const;
const DETAIL_TABLE_AVAILABILITY_DOT_CLASS = (isOnline: boolean) =>
    isOnline
        ? "size-dot rounded-full shadow-dot bg-success shadow-success/50"
        : "size-dot rounded-full shadow-dot bg-warning shadow-warning/50";
const DETAILS_TABLE = {
    root: "flex h-full flex-col gap-panel",
    toolbar: `${SURFACE.chrome.sticky} flex items-center justify-between px-tight`,
    toolbarGroup: "flex items-center gap-tools",
    toolbarIconPrimary: "text-primary",
    body: "relative min-h-0 flex-1",
    panel: "min-h-0 flex-1 overflow-hidden",
    scroll: "h-full overflow-auto",
    emptyPanel: SPLIT.emptyPanel,
    emptyText: SPLIT.emptyText,
    table: "w-full border-separate border-spacing-0 text-left",
    tableHeadRow: `${TEXT_ROLE.label} text-foreground/40`,
    tableHeadIconMuted: "text-foreground/50",
    tableHeadCellIcon: TABLE_HEADER_PATTERN.iconCell,
    tableHeadCell: TABLE_HEADER_PATTERN.sectionDividerCell,
    tableHeadCellStatus: TABLE_HEADER_PATTERN.statusCell,
    tableBody: TEXT_ROLE.code,
    tableRow: "group hover:bg-primary/5",
    cellIcon: "border-b border-default/5 py-panel pl-panel pr-tight",
    cellHost: "truncate border-b border-default/5 px-tight py-panel font-sans font-medium text-foreground/80",
    cellAnnounce: "border-b border-default/5 px-tight py-panel text-foreground/50 tabular-nums",
    cellPeers: "border-b border-default/5 px-tight py-panel text-foreground/70",
    cellStatus: `border-b border-default/5 py-panel pl-tight pr-panel text-right ${TEXT_ROLE.labelPrimary}`,
    statusTone: {
        pending: "text-foreground/50",
        online: "text-success",
        partial: "text-warning",
    } as const,
    announceRow: "flex items-center gap-tight",
    peerRow: "flex items-center gap-tools",
    overlay: "absolute inset-0 z-overlay flex flex-col bg-background/40 backdrop-blur-xl",
    overlayHeader: "flex items-center justify-between border-b border-default/10 px-panel py-panel",
    overlayTitle: withColor(TEXT_ROLE.labelPrimary, "primary"),
    overlayBody: "flex-1 p-panel",
    overlayFooter: "flex justify-end gap-tools border-t border-default/10 p-panel",
    inputClassNames: {
        input: "font-mono",
        inputWrapper: "bg-background/40",
    } as const,
    builder: {
        availabilityDotClass: DETAIL_TABLE_AVAILABILITY_DOT_CLASS,
    } as const,
} as const;
export const DETAILS = {
    root: `h-full min-h-0 flex flex-col outline-none rounded-2xl ${SURFACE.atom.glassBlock} ${SURFACE.atom.shadowBlock}`,
    rootStandalone: "overflow-y-auto",
    body: "flex-1 min-h-0 bg-transparent py-tight",
    headerRoot: `flex items-center h-row ${HEADER_BASE}`,
    headerRootEmbedded: "bg-content1/80 border-b border-default/10",
    headerTrackingStyle: {
        letterSpacing: "var(--tt-tracking-wide)",
    } as const,
    headerLeft: "flex items-center w-full gap-tight px-tight",
    headerInfoIcon: "text-foreground/50 shrink-0 toolbar-icon-size-md",
    headerTitle: "truncate min-w-0 text-foreground font-semibold",
    headerStatus: `${TEXT_ROLE.caption} block`,
    headerPrimaryHint: withOpacity(TEXT_ROLE.caption, 50),
    headerCenter: "flex items-center w-full gap-panel",
    headerTabs: "flex items-center gap-tight",
    headerTabBase: `py-tight rounded-full border ${TEXT_ROLE.buttonText} font-bold ${TRANSITION.fast} px-panel`,
    headerTabActive: "text-foreground",
    headerTabInactive: `text-foreground/60 ${INTERACTIVE_RECIPE.navItem}`,
    headerRight: "flex items-center gap-tight min-w-max px-tight",
    speedRoot: "h-full flex flex-col",
    speedStandaloneSurface: "flex-1 p-stage flex flex-col min-h-0",
    speedEmbeddedSurface: "flex-1 h-full p-stage flex flex-col min-h-0",
    speedChartHost: "flex-1 min-h-0",
    speedCheckingAlert: `${withColor(TEXT_ROLE.body, "warning")} mb-tight shrink-0`,
    speedCollectingPanel: `mb-tight shrink-0 rounded-2xl border ${SURFACE_BORDER} bg-background/20 p-panel ${withOpacity(TEXT_ROLE.body, 50)}`,
    generalRoot: "space-y-stage",
    generalCard: `p-panel flex flex-col gap-tools ${SURFACE.surface.panelInfo}`,
    generalHeaderRow: "flex items-center justify-between",
    generalPathCode: `${TEXT_ROLE.codeMuted} ${SURFACE.atom.codeInline} wrap-break-word mt-2`,
    generalPrimaryCol: "flex-1",
    generalVerifyCol: "w-1/3 pl-4",
    generalVerifyWrap: "mt-2",
    generalWarningStack: "flex flex-col gap-tools",
    generalProbeStack: `flex flex-col gap-tight ${TEXT_ROLE.codeMuted} text-warning/80`,
    generalRecoveryHint: `${withColor(TEXT_ROLE.caption, "warning")} text-warning/80`,
    generalControlsGrid: "grid gap-tools sm:grid-cols-2",
    generalControlsSpan: "col-span-2",
    generalControlsMeta: "flex flex-col gap-tight",
    generalControlsActions: "flex items-center gap-tools",
    generalControlsDescription: withOpacity(TEXT_ROLE.body, 50),
    generalButtonIcon: "mr-2",
    generalVerificationTrack: "h-3 bg-transparent",
    generalVerificationIndicator: "h-3 bg-gradient-to-r from-primary to-success",
    table: DETAILS_TABLE,
    builder: {
        headerClass: (isStandalone: boolean) =>
            isStandalone ? DETAILS.headerRoot : `${DETAILS.headerRoot} ${DETAILS.headerRootEmbedded}`,
        headerTabButtonClass: (isActive: boolean) =>
            isActive
                ? `${DETAILS.headerTabBase} ${DETAILS.headerTabActive}`
                : `${DETAILS.headerTabBase} ${DETAILS.headerTabInactive}`,
    } as const,
} as const;

export const COMMAND_PALETTE = {
    overlay: "fixed inset-0 z-popover",
    backdrop: "absolute inset-0 bg-background/90 backdrop-blur-xl",
    section: "relative h-full flex items-start justify-center",
    panel: `${SURFACE.role.modal} relative z-panel w-full max-w-2xl`,
    input: "rounded-none border-0 bg-transparent px-panel py-panel text-base font-semibold outline-none placeholder:text-foreground/50",
    list: "max-h-command-palette overflow-y-auto px-panel py-panel",
    groupWrap: "pb-panel",
    item: "glass-panel mt-tight flex cursor-pointer flex-col border border-content1/10 bg-background/80 py-panel px-panel text-left transition hover:border-foreground/40 hover:bg-background/90 focus:border-primary focus:outline-none",
    itemRow: "flex items-center justify-between text-sm font-semibold text-foreground",
    shortcutWrap: `flex gap-tools ${TEXT_ROLE.codeCaption} text-foreground/50`,
    shortcutKey: "rounded-full border border-foreground/30 px-tight py-tight",
    description: `${TEXT_ROLE.bodySmall} text-foreground/70`,
    empty: `py-panel text-center ${TEXT_ROLE.caption}`,
    outcome: "border-t border-default/20 px-panel py-tight text-xs font-medium",
} as const;
export const FORM_CONTROL = {
    checkboxPrimaryClassNames: { wrapper: "after:bg-primary" } as const,
    checkboxMarginRightClassNames: { base: "mr-tight" } as const,
    checkboxLabelBodySmallClassNames: {
        label: TEXT_ROLE.bodySmall,
    } as const,
    priorityChipClassNames: {
        content: "text-label font-semibold uppercase px-0",
    } as const,
    statusChipClassNames: {
        base: STATUS_CHIP_PATTERN.base,
        content: STATUS_CHIP_PATTERN.content,
    } as const,
    statusChipContainer: STATUS_CHIP_PATTERN.container,
    statusChipContent: STATUS_CHIP_PATTERN.contentWrap,
    statusChipWarningIcon: STATUS_CHIP_PATTERN.warningIcon,
    statusChipCurrentIcon: STATUS_CHIP_PATTERN.currentIcon,
    statusChipLabel: STATUS_CHIP_PATTERN.label,
} as const;
export const INPUT = {
    mono: {
        input: "font-mono text-scaled selection:bg-primary/20 selection:text-foreground !outline-none focus:!outline-none focus-visible:!outline-none",
        inputWrapper: `surface-layer-1 ${TRANSITION.fast} shadow-none group-hover:border-default/10`,
    } as const,
    monoEmphasized: {
        inputWrapper: "surface-layer-1 border border-default/10 shadow-none focus-within:border-primary/70",
        content: "",
        input: "bg-transparent text-scaled font-mono text-foreground placeholder:text-foreground/30",
    } as const,
    codeTextareaClassNames: {
        input: TEXT_ROLE.code,
    } as const,
} as const;
export const FILE_BROWSER = {
    container: "flex flex-col h-full rounded-medium border border-default-200/50 shadow-small",
    toolbar: "flex flex-wrap items-center gap-tools p-tight border-b border-default-200/50 bg-content1/30",
    searchInputClassNames: {
        base: "min-w-0",
        inputWrapper: "h-button text-scaled",
    } as const,
    filterButton: "h-button toolbar-icon-hit",
    filterIcon: "toolbar-icon-size-sm text-default-600",
    toolbarSpacer: "flex-1",
    toolsDivider: "h-sep w-divider bg-default-300 mx-tight",
    expandButton: "h-button toolbar-icon-hit",
    selectionActionsLabel: `${TEXT_ROLE.bodySmall} text-default-500 font-medium hidden sm:inline-block`,
    priorityButton: `h-button ${TEXT_ROLE.body}`,
    headerRow: "grid grid-cols-file-tree items-center px-panel py-tight border-b border-default-200/50 z-sticky",
    headerCheckboxWrap: "flex items-center justify-center",
    headerPriority: "text-center",
    headerProgress: "text-center",
    headerSize: "text-right",
    scroll: "flex-1 overflow-auto min-h-0 relative scrollbar-hide",
    virtualCanvas: "relative w-full",
    virtualRow: "absolute top-0 left-0 w-full",
    emptyOverlay: "flex flex-col items-center justify-center h-full text-default-400 gap-tools absolute inset-0",
    emptyIcon: "toolbar-icon-size-lg opacity-20",
    emptyText: `${TEXT_ROLE.body} opacity-50`,
    progressClassNames: {
        track: "h-sep",
        indicator: `${TRANSITION.medium} h-sep`,
    } as const,
    row: `grid grid-cols-file-tree items-center h-row px-panel w-full select-none border-b border-default-100/50 hover:bg-default-100/60 ${TRANSITION.fast}`,
    rowDimmed: "opacity-60 grayscale-[0.5]",
    rowCheckboxWrap: "flex items-center justify-center",
    rowNameCell: "flex items-center overflow-hidden min-w-0 pr-panel pl-file-tree-indent",
    rowIndentSpacer: "w-file-tree-indent-spacer",
    rowIconWrap: "mr-tight text-default-500 shrink-0",
    rowFolderIcon: "toolbar-icon-size-sm fill-default-400/20",
    rowNameBase: "text-scaled truncate cursor-default",
    rowNameFolder: "font-medium text-foreground",
    rowNameFile: "text-foreground/80",
    rowPriorityWrap: "flex justify-center",
    rowProgressWrap: "flex flex-col justify-center px-tight",
    rowSizeText: `${TEXT_ROLE.codeMuted} text-right text-default-400`,
    iconVideo: "toolbar-icon-size-sm text-primary",
    iconAudio: "toolbar-icon-size-sm text-warning",
    iconImage: "toolbar-icon-size-sm text-success",
    iconText: "toolbar-icon-size-sm text-default-500",
    iconDefault: "toolbar-icon-size-sm text-default-400",
    iconSmall: "toolbar-icon-size-sm",
    chevronButton: `file-tree-chevron-hit text-default-400 rounded-full hover:text-foreground hover:bg-default-200/50 ${TRANSITION.fast}`,
    priorityChip: `h-status-chip gap-tight px-tight min-w-status-chip cursor-pointer hover:opacity-80 ${TRANSITION.reveal}`,
    priorityMenuDangerItem: "text-danger",
    priorityMenuHighIcon: "toolbar-icon-size-sm text-success",
    priorityMenuNormalIcon: "toolbar-icon-size-sm text-primary",
    priorityMenuLowIcon: "toolbar-icon-size-sm text-warning",
    priorityMenuSkipIcon: "toolbar-icon-size-sm",
    builder: {
        selectionActionsClass: (hasSelection: boolean) =>
            hasSelection
                ? `flex items-center gap-tools ${TRANSITION.medium} opacity-100`
                : `flex items-center gap-tools ${TRANSITION.medium} opacity-0 pointer-events-none`,
    } as const,
} as const;
const HEATMAP_CANVAS_FRAME_CLASS = `${SURFACE.surface.panelRaised} p-tight ${TRANSITION.medium}`;
const HEATMAP_CANVAS_PULSE_CLASS = "opacity-70 shadow-availability ring-1 ring-primary/40";
export const HEATMAP = {
    empty: `${SURFACE.surface.panelRaised} p-panel text-center`,
    emptyMuted: withOpacity(TEXT_ROLE.body, 50),
    root: "flex flex-col gap-tools",
    header: "flex items-center justify-between",
    legend: "flex items-center gap-tools",
    legendMuted: withOpacity(TEXT_ROLE.body, 50),
    legendItem: "flex items-center gap-tight",
    legendDot: "size-dot rounded-full",
    legendDotRare: "bg-danger",
    legendDotCommon: "bg-primary",
    controls: "flex items-center gap-tight",
    zoomButton: "size-icon-btn rounded-full",
    zoomIcon: "text-current",
    zoomValue: withOpacity(TEXT_ROLE.code, 60),
    canvas: "w-full h-auto block rounded-2xl cursor-crosshair",
    labelTrackingStyle: {
        letterSpacing: "var(--tt-tracking-ultra)",
    } as const,
    builder: {
        canvasFrameClass: (isZooming: boolean) =>
            isZooming ? `${HEATMAP_CANVAS_FRAME_CLASS} ${HEATMAP_CANVAS_PULSE_CLASS}` : HEATMAP_CANVAS_FRAME_CLASS,
    } as const,
} as const;

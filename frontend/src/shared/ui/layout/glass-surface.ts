import {
    INTERACTIVE_RECIPE,
    SURFACE_BORDER,
    TRANSITION,
    VISUAL_STATE,
} from "@/config/logic";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED, withColor, withOpacity } from "@/config/textRoles";

// Reusable glass surface styling for popups and dropdowns.
const GLASS_MODAL_SURFACE =
    "glass-panel surface-layer-2 text-foreground shadow-visual-large rounded-modal";
const MODAL_SURFACE_FRAME =
    "flex flex-col overflow-hidden border border-default/20";
const MODAL_SURFACE_HEADER = "border-b border-default/20";
const MODAL_SURFACE_FOOTER = "border-t border-default/20";
const STICKY_HEADER =
    "sticky top-0 z-sticky bg-background/80 backdrop-blur-md";
const GLASS_MENU_SURFACE =
    "glass-panel surface-layer-2 text-foreground shadow-menu-large rounded-modal";
const MENU_SURFACE_FRAME =
    "overflow-hidden border border-default/20 p-tight";
const MENU_SURFACE_LIST = "overflow-hidden";
const MENU_ITEM_SURFACE =
    `rounded-panel px-panel py-tight text-scaled font-medium ${INTERACTIVE_RECIPE.menuItem} hover:text-foreground active:bg-content2/80`;
const MENU_SURFACE_CLASS = `${GLASS_MENU_SURFACE} ${MENU_SURFACE_FRAME}`;
const MENU_LIST_CLASSNAMES = { list: MENU_SURFACE_LIST } as const;
const MENU_ITEM_CLASSNAMES = { base: MENU_ITEM_SURFACE } as const;
const MENU_SECTION_HEADING = TEXT_ROLE.label;
const PANEL_SURFACE_FRAME =
    "rounded-panel border border-default/10 overflow-hidden";
const PANEL_SURFACE_INSET_FRAME =
    "rounded-panel border border-default/15 overflow-hidden";
const PANE_SURFACE_FRAME =
    "flex flex-col min-h-0 overflow-hidden rounded-panel border border-default/20 shadow-small";
const MODAL_SURFACE_BASE_CLASS = `${GLASS_MODAL_SURFACE} ${MODAL_SURFACE_FRAME}`;
const MODAL_BASE_CLASSNAMES = {
    base: MODAL_SURFACE_BASE_CLASS,
} as const;
const MODAL_COMPACT_CLASSNAMES = {
    base: `${MODAL_SURFACE_BASE_CLASS} w-full max-w-modal-compact`,
} as const;
const MODAL_BASE_WRAPPER_HIDDEN_CLASSNAMES = {
    base: MODAL_SURFACE_BASE_CLASS,
    wrapper: "overflow-hidden",
} as const;
const MODAL_CHROME_CLASSNAMES = {
    body: "p-tight",
    header: "p-none select-none blur-glass",
    footer: "p-none select-none",
} as const;
const STANDARD_SURFACE_TOOLTIP = {
    content: `bg-content1/80 border ${SURFACE_BORDER} backdrop-blur-3xl shadow-visual-large rounded-2xl px-panel py-tight text-scaled leading-tight text-foreground/90`,
    arrow: "bg-content1/80",
} as const;
const STANDARD_SURFACE_CHROME = {
    headerBorder: MODAL_SURFACE_HEADER,
    footerBorder: MODAL_SURFACE_FOOTER,
    stickyHeader: STICKY_HEADER,
    headerPassive: `${MODAL_SURFACE_HEADER} select-none`,
    footerEnd: `${MODAL_SURFACE_FOOTER} flex justify-end gap-tools`,
    footerActionsPadded:
        `${MODAL_SURFACE_FOOTER} px-stage py-panel flex items-center justify-end gap-tools`,
} as const;
const STANDARD_SURFACE_MODAL = {
    baseClassNames: MODAL_BASE_CLASSNAMES,
    compactClassNames: MODAL_COMPACT_CLASSNAMES,
    baseWrapperHiddenClassNames: MODAL_BASE_WRAPPER_HIDDEN_CLASSNAMES,
    chromeClassNames: MODAL_CHROME_CLASSNAMES,
    baseClass: MODAL_SURFACE_BASE_CLASS,
} as const;
const STANDARD_SURFACE_MENU = {
    surface: MENU_SURFACE_CLASS,
    dirPickerSurface: `min-w-dir-picker ${MENU_SURFACE_CLASS}`,
    listClassNames: MENU_LIST_CLASSNAMES,
    itemClassNames: MENU_ITEM_CLASSNAMES,
    itemSplitClassNames: {
        base: `${MENU_ITEM_SURFACE} flex items-center justify-between`,
    } as const,
    itemSelectedPrimary: "bg-primary/15 text-primary",
    flagInlineWrap: "text-lg leading-none",
    checkIconPrimary: "text-primary",
    sectionHeading: MENU_SECTION_HEADING,
} as const;
const STANDARD_SURFACE_FRAME = {
    panel: PANEL_SURFACE_FRAME,
    panelInset: PANEL_SURFACE_INSET_FRAME,
    pane: PANE_SURFACE_FRAME,
} as const;
const STANDARD_SURFACE_ATOM = {
    iconButton: "surface-layer-1 border border-default/10",
    insetRounded: "surface-layer-1 rounded-panel p-tight",
    insetRoundedFull: "surface-layer-1 rounded-full p-tight",
    insetBorderedItem: "rounded-panel border border-default/20 p-tight",
    glassPanel: "glass-panel surface-layer-1 text-foreground",
    shadowBlock: "shadow-small",
    shadowPanel: "shadow-medium",
    glassBlock: "acrylic  shadow-inner",
} as const;
const STANDARD_SURFACE_SEMANTIC = {
    actionCard: `p-panel rounded-2xl border ${SURFACE_BORDER} bg-content1/10`,
    settingsPanel: `p-panel rounded-2xl border ${SURFACE_BORDER} bg-content1/10`,
    listContainer: `${PANEL_SURFACE_FRAME} bg-content1/10`,
    infoPanel: `rounded-2xl border ${SURFACE_BORDER} bg-content1/30`,
    workflowStep: `rounded-2xl border ${SURFACE_BORDER} bg-content1/50 p-panel`,
    sidebarPanel: `flex flex-col border-r ${SURFACE_BORDER} bg-content1/50 blur-glass`,
    modalBody: "p-tight",
    menuPanel: MENU_SURFACE_CLASS,
} as const;
export const STANDARD_SURFACE_CLASS = {
    tooltip: STANDARD_SURFACE_TOOLTIP,
    chrome: STANDARD_SURFACE_CHROME,
    modal: STANDARD_SURFACE_MODAL,
    menu: STANDARD_SURFACE_MENU,
    frame: STANDARD_SURFACE_FRAME,
    atom: STANDARD_SURFACE_ATOM,
    semantic: STANDARD_SURFACE_SEMANTIC,
} as const;
export const GLASS_TOOLTIP_CLASSNAMES = STANDARD_SURFACE_CLASS.tooltip;
export const SURFACE_CHROME_CLASS = STANDARD_SURFACE_CLASS.chrome;
export const MODAL_SURFACE_CLASS = STANDARD_SURFACE_CLASS.modal;
export const MENU_CLASS = STANDARD_SURFACE_CLASS.menu;
export const SURFACE_FRAME_CLASS = STANDARD_SURFACE_CLASS.frame;
export const SURFACE_ATOM_CLASS = STANDARD_SURFACE_CLASS.atom;
export const APP_MODAL_CLASS = {
    sidebar:
        `${STANDARD_SURFACE_CLASS.semantic.sidebarPanel} ${TRANSITION.slow} absolute inset-y-0 left-0 z-sticky settings-sidebar-shell sm:relative sm:translate-x-0`,
    sidebarHidden: "-translate-x-full",
    sidebarVisible: "translate-x-0",
    sidebarHeader:
        "p-stage border-b border-content1/10 flex justify-between items-center h-modal-header shrink-0",
    sidebarCloseButton: "sm:hidden text-foreground/50",
    sidebarBody: "flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide",
    tabButtonBase:
        `w-full flex items-center gap-panel px-panel py-panel rounded-panel ${TRANSITION.medium} group relative`,
    tabButtonActive: "bg-primary/10 text-primary font-semibold",
    tabButtonInactive: `text-foreground/60 font-medium ${INTERACTIVE_RECIPE.navItem}`,
    tabIcon: "shrink-0 toolbar-icon-size-md",
    tabIconActive: "text-primary",
    tabIconInactive: "text-foreground/50",
    tabIndicator: "absolute settings-tab-indicator bg-primary rounded-r-pill",
    versionWrapper: "p-panel border-t border-content1/10 shrink-0",
    versionText: `${TEXT_ROLE.codeCaption} text-foreground/30`,
    header:
        `${SURFACE_CHROME_CLASS.headerBorder} ${SURFACE_CHROME_CLASS.stickyHeader} shrink-0 h-modal-header flex items-center justify-between px-stage`,
    headerLead: "flex items-center gap-tools",
    headerLeadPrimaryIcon: "text-primary",
    headerTitleWrap: "flex flex-col",
    headerMobileBack: "sm:hidden -ml-tight text-foreground/50",
    headerUnsaved: `${TEXT_ROLE.statusWarning} animate-pulse tracking-0-2`,
    desktopClose: `text-foreground/40 hidden sm:flex ${INTERACTIVE_RECIPE.dismiss}`,
    contentStack: "flex flex-col space-y-stage sm:space-y-stage pb-stage",
    scrollContent: "flex-1 min-h-0 overflow-y-auto scrollbar-hide",
    alert: "mb-panel px-panel py-tight",
    inlineAlert: "px-panel py-tight",
    connectionStack: "space-y-stage",
    footer:
        `${SURFACE_CHROME_CLASS.footerBorder} sticky bottom-0 z-panel shrink-0 bg-content1/40 blur-glass px-stage py-stage flex items-center justify-between`,
    footerConfirmContent: "w-full flex items-center gap-panel",
    footerTextWrap: "flex flex-col min-w-0",
    footerWarningTitle: `${TEXT_ROLE.bodyStrong} text-warning`,
    footerActions: "flex gap-tools ml-auto shrink-0",
    footerButtonRow: "flex gap-tools ml-auto",
    footerResetButton: `opacity-70 ${INTERACTIVE_RECIPE.buttonDefault}`,
    footerSaveButton: "font-semibold shadow-small shadow-primary/20",
    dialogHeader: `${SURFACE_CHROME_CLASS.headerBorder} flex items-center justify-between gap-tools px-panel py-panel`,
    dialogHeaderLead: "flex items-center gap-tools",
    dialogHeaderIconWrap: SURFACE_ATOM_CLASS.insetRoundedFull,
    dialogHeaderWarningIcon: "toolbar-icon-size-md text-warning",
    dialogBody: "flex flex-col gap-stage p-panel",
    dialogSectionStack: "flex flex-col gap-tight",
    dialogInsetStack: "flex flex-col gap-tight",
    dialogLocationRow: `flex items-center gap-tools ${SURFACE_ATOM_CLASS.insetRounded}`,
    dialogLocationIcon: "toolbar-icon-size-md text-foreground",
    dialogLocationLabel: `${TEXT_ROLE.code} truncate`,
    dialogInsetTitle: `${TEXT_ROLE.bodySmall} font-semibold text-foreground`,
    dialogInsetLabel: `${TEXT_ROLE.bodySmall} font-medium text-foreground truncate`,
    dialogInsetDescription: `${TEXT_ROLE.bodySmall} truncate`,
    dialogOutcomePanel: `${SURFACE_ATOM_CLASS.insetRounded} ${TEXT_ROLE.bodySmall}`,
    dialogFooter: `${SURFACE_CHROME_CLASS.footerBorder} flex items-center justify-between gap-tools px-panel py-panel`,
    dialogFooterGroup: "flex items-center gap-tools",
    dialogSecondaryAction: "font-medium text-foreground",
    dialogPrimaryAction: "font-bold",
    contentWrapper: "h-full flex flex-col",
    layout: "flex flex-row flex-1 min-h-0 overflow-hidden relative",
    mainPane: "flex-1 min-h-0 flex flex-col bg-content1/10 blur-glass relative w-full",
    workflow: {
        gateRoot: "flex flex-col h-full",
        headerLayout: "flex justify-between items-center gap-panel px-stage py-panel",
        header: `${SURFACE_CHROME_CLASS.headerBorder} flex justify-between items-center gap-panel px-stage py-panel`,
        titleStack: "flex flex-col overflow-hidden gap-tight",
        sourceLabel: "truncate font-mono leading-tight",
        sourceLabelCaption: `${TEXT_ROLE.caption} truncate font-mono leading-tight`,
        sourceMuted: "text-foreground/50 truncate leading-tight",
        sourceMutedLabel: `${TEXT_ROLE.codeMuted} text-foreground/50 truncate leading-tight`,
        iconMd: "toolbar-icon-size-md",
        iconMdPrimary: "toolbar-icon-size-md text-primary",
        iconLgPrimary: "toolbar-icon-size-lg text-primary",
        iconMdSuccess: "toolbar-icon-size-md text-success",
        iconMdWarning: "toolbar-icon-size-md text-warning",
        iconAlert: "toolbar-icon-size-md shrink-0",
        iconAlertMuted: "toolbar-icon-size-md shrink-0 text-foreground/50",
        warningTone: "text-warning",
        footerAlertText: `${TEXT_ROLE.bodyStrong} truncate`,
        headerIconButton: `text-foreground/60 ${INTERACTIVE_RECIPE.textReveal}`,
        gateBody: "flex-1 min-h-0 flex items-center justify-center",
        gateContent: "w-full max-w-modal",
        formRoot: "flex flex-col min-h-0 flex-1 relative",
        submitOverlay:
            "absolute inset-0 flex flex-col items-center justify-center text-foreground/50 gap-tools z-modal-internal bg-background/40 blur-glass",
        submitHint: "text-foreground/40 text-center max-w-modal",
        submitHintMuted: `${TEXT_ROLE.codeMuted} text-foreground/40 text-center max-w-modal`,
        submitWarningTitle: "text-foreground/70",
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
        paneHandle:
            `w-add-modal-pane-gap flex items-stretch justify-center bg-transparent z-panel ${TRANSITION.fast} group focus:outline-none relative`,
        paneHandleEnabled: "cursor-col-resize",
        paneHandleDisabled: "cursor-default pointer-events-none",
        resizeHandleBarWrap: "absolute inset-x-0 py-panel flex justify-center pointer-events-none",
        filePanel: `${SURFACE_ATOM_CLASS.glassPanel} ${SURFACE_FRAME_CLASS.pane} bg-content1/55`,
        filePanelContent: "flex flex-col flex-1 min-h-0 outline-none border-default",
        filePanelToolbar: "p-tight border-b border-default/50 flex gap-tools items-center surface-layer-1 blur-glass",
        fileTableShell: "h-full w-full min-h-0 rounded-xl overflow-hidden shadow-inner",
        filesTitle: `${TEXT_ROLE.labelDense} flex-1 pl-tight select-none text-foreground/40`,
        smartSelectButton: `${SURFACE_ATOM_CLASS.iconButton} min-w-badge px-tight`,
        dropdownDangerItem: "text-danger",
        footerLayout: "flex flex-col gap-panel px-stage py-panel sm:flex-row sm:items-end sm:justify-between",
        footerAlerts: "flex flex-col gap-tools",
        footerAlert: "flex items-center gap-tools max-w-modal-compact p-tight",
        footerInfoAlert: "flex items-center gap-tools max-w-modal-compact p-tight text-foreground/70",
        footerActionsStack: "flex flex-col gap-tools sm:items-end sm:justify-end",
        footerActionsRow: "flex flex-wrap items-center justify-end gap-tools",
        footer: `${SURFACE_CHROME_CLASS.footerBorder} flex flex-col gap-panel px-stage py-panel sm:flex-row sm:items-end sm:justify-between`,
        inlineBlock: "inline-block",
        cancelButton: "font-medium",
        primaryButton: "font-bold px-stage min-w-button",
        fileCountChipClassNames: {
            content: `${TEXT_ROLE.code} font-bold`,
        } as const,
    } as const,
} as const;
export const FORM_UI_CLASS = {
    sectionCard: STANDARD_SURFACE_CLASS.semantic.settingsPanel,
    sectionCardEmphasized: STANDARD_SURFACE_CLASS.semantic.workflowStep,
    sectionTitle: `${TEXT_ROLE.heading} text-foreground/40 mb-panel leading-tight`,
    sectionDescription: `${TEXT_ROLE.body} mb-panel`,
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
    systemRootStack: "space-y-stage",
    blockStackTight: "space-y-tight",
    blockRowBetween: "flex justify-between items-center",
    switchBlock: "flex flex-col gap-tight",
    switchRow: "flex justify-between items-center h-control-row",
    sliderValueBadge: "font-medium bg-content2 px-tight py-tight rounded-md text-center",
    slider: "opacity-90",
    inputGroup: "group flex flex-col gap-tight",
    inputActionGroup: "flex flex-col gap-tight group",
    inputActionRow: "flex w-full items-end gap-tools",
    inputActionFill: "flex-1 min-w-0",
    inputEndIcon: "text-foreground/40 shrink-0 toolbar-icon-size-sm",
    inputActionButton:
        `h-button px-stage shrink-0 ${TEXT_ROLE.buttonText} tracking-wider uppercase bg-primary/10 text-primary ${INTERACTIVE_RECIPE.buttonPrimary}`,
    daySelectorButton:
        `h-button px-panel shrink-0 font-semibold tracking-wider uppercase bg-primary/10 text-primary text-scaled min-w-0 ${INTERACTIVE_RECIPE.buttonPrimary}`,
    daySelectorSelected: "font-bold",
    daySelectorUnselected: "text-foreground/60",
    daySelectorList: "flex flex-wrap gap-tools",
    inputPairGrid: "grid gap-panel",
    buttonRow: "flex",
    languageRow: "flex items-center justify-between gap-panel",
    rawConfigHeader: "flex items-center justify-between gap-panel",
    rawConfigPanel: STANDARD_SURFACE_CLASS.semantic.infoPanel,
    divider: "my-panel opacity-50",
    selectClassNames: {
        trigger: "h-button",
        value: "text-scaled font-medium",
    } as const,
    sliderClassNames: { thumb: "shadow-small" } as const,
    rawConfigTextarea:
        "w-full resize-none border-none bg-transparent px-panel py-panel leading-relaxed selection:bg-primary/40 focus:outline-none",
    workflow: {
        settingsToggleButton: `mr-tight text-foreground/35 ${INTERACTIVE_RECIPE.textMutedReveal}`,
        root: "p-panel flex flex-col flex-1 min-h-0 overflow-y-auto overlay-scrollbar",
        group: "flex flex-col gap-panel mb-panel",
        label: `${TEXT_ROLE_EXTENDED.settingsLabel} mb-panel flex items-center gap-tools`,
        labelIcon: "toolbar-icon-size-md",
        gatePanel: `p-panel flex flex-col gap-panel ${SURFACE_FRAME_CLASS.panel}`,
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
} as const;
export const TABLE_VIEW_CLASS = {
    header: `flex w-full border-b ${SURFACE_BORDER} ${STICKY_HEADER}`,
    bodyScroll: "relative flex-1 h-full min-h-0 overflow-y-auto w-full overlay-scrollbar",
    bodyScrollStyle: {
        scrollbarGutter: "stable",
    } as const,
    bodyCanvas: "relative w-full min-w-max",
    noResults: `h-full flex items-center justify-center px-stage ${TEXT_ROLE.labelDense}`,
    dragOverlay:
        `pointer-events-none border bg-background/90 backdrop-blur-3xl px-panel box-border ${SURFACE_BORDER} shadow-medium`,
    dragOverlayContent: "flex h-full w-full items-center",
    marquee:
        "pointer-events-none absolute rounded-(--r-sm) border border-primary/60 bg-primary/20",
    loadingRoot: "w-full",
    loadingRow: "flex items-center w-full border-b border-content1/5 px-panel",
    loadingSkeletonWrap: "w-full h-indicator",
    loadingSkeleton: "h-full w-full rounded-md bg-content1/10",
    emptyRoot:
        "h-full flex flex-col items-center justify-center gap-stage px-stage text-foreground/60",
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
    emptyPreviewRow:
        "grid grid-cols-torrent gap-tools rounded-2xl bg-content1/10 px-panel py-panel",
} as const;
export const DIAGNOSTIC_VIEW_CLASS = {
    statusChipClassNames: {
        base: "border border-default/20 bg-content1/70",
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
    optionButtonFull: "h-auto w-full justify-start whitespace-normal text-left",
    optionButtonLeft: "justify-start text-left whitespace-normal",
    executeRow: "flex flex-wrap items-center justify-between gap-stage",
    executeActions: "flex flex-wrap items-center justify-end gap-tools",
    stateRow: "flex flex-wrap items-center gap-tools",
    statePill: "surface-layer-1 rounded-pill px-tight py-tight",
    statePillValue: "font-semibold text-foreground",
    smokeCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    smokeRows:
        "surface-layer-1 rounded-panel p-tight flex flex-col divide-y divide-default/10",
    smokeRow: "py-tight flex flex-wrap items-center justify-between gap-tools",
    verifyCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    verifyTableWrap: "surface-layer-1 rounded-panel overflow-hidden",
    verifyTable: "w-full border-separate border-spacing-0 text-left",
    verifyHead: "bg-background/40",
    verifyHeadRow: "border-b border-default/15",
    verifyHeaderCell: "px-panel py-tight",
    verifyRow: "border-b border-default/10 last:border-b-0",
    verifyCell: "px-panel py-tight",
    verifyLabelWrap: "flex flex-col gap-tight",
    systemCard: "surface-layer-2 rounded-panel p-panel flex flex-col gap-stage",
    systemRows: "flex flex-col gap-tools",
    systemRowCard:
        "surface-layer-1 rounded-panel p-tight border-l border-default/20 pl-panel flex flex-col gap-tools",
    systemRowHead: "flex flex-wrap items-center justify-between gap-tools",
    systemStatusRow: "flex flex-wrap items-center gap-stage",
    systemStatusPair: "flex items-center gap-tight",
    systemMeta: "flex flex-wrap items-center gap-stage",
    footer:
        "fixed bottom-0 left-0 right-0 z-overlay border-t border-default/20 bg-content1/85 p-panel backdrop-blur-xl",
    footerStack: "flex flex-col gap-tools",
    footerRow: "flex flex-wrap items-center justify-between gap-tools",
    footerLeft: "flex flex-wrap items-center gap-tools",
    footerScenario: "surface-layer-1 rounded-panel px-tight py-tight",
    footerSummary: "truncate flex-1 min-w-0",
    footerRight: "flex items-center gap-tools",
    footerExpected:
        "whitespace-pre-wrap leading-relaxed border-t border-default/10 pt-tight mt-tight",
} as const;
export const WORKBENCH_CLASS = {
    root: "tt-app-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20",
    content: "relative z-panel flex w-full flex-1",
    reconnectToast: "fixed z-toast",
    section: "tt-shell-body flex w-full flex-1 flex-col",
    sectionGapImmersive: "gap-stage",
    sectionGapClassic: "gap-tools",
    immersiveBackgroundRoot: "pointer-events-none absolute inset-0 z-floor",
    immersiveBackgroundBase: "absolute inset-0 bg-background/95",
    immersiveBackgroundPrimaryBlend:
        "absolute inset-0 mix-blend-screen opacity-50 bg-primary/20",
    immersiveBackgroundSecondaryBlend:
        "absolute inset-0 mix-blend-screen opacity-40 bg-content1/15",
    immersiveBackgroundNoise: "absolute inset-0 bg-noise opacity-20",
    immersiveBackgroundAccentBottom:
        "absolute left-1/2 -translate-x-1/2 bottom-0 h-shell-accent-large rounded-pill bg-primary/30 blur-glass opacity-40",
    immersiveBackgroundAccentTop:
        "absolute left-1/2 -translate-x-1/2 top-0 h-shell-accent-medium rounded-pill bg-primary/30 blur-glass opacity-35",
    immersiveNavbarWrap: "acrylic border shadow-hud",
    immersiveMainWrap: "tt-shell-no-drag acrylic flex-1 min-h-0 h-full border shadow-hud",
    immersiveMain: "flex-1 min-h-0 h-full overflow-hidden border bg-background/20 shadow-inner",
    immersiveHudSection: "tt-shell-no-drag grid gap-panel",
    immersiveHudCard:
        "glass-panel relative overflow-hidden border border-content1/10 bg-background/55 p-panel shadow-hud",
    immersiveHudDismissButton:
        "absolute rounded-pill bg-content1/20 p-tight text-foreground/60 transition hover:bg-content1/40 hover:text-foreground",
    immersiveHudCardContent: "flex items-start gap-workbench",
    immersiveHudIconWrap: "flex size-icon-btn-lg items-center justify-center rounded-panel",
    immersiveHudTextWrap: "flex-1",
    immersiveStatusWrap:
        "tt-shell-no-drag glass-panel border border-content1/10 bg-background/75 shadow-hud blur-glass",
    classicStack: "flex-1 min-h-0 h-full flex flex-col gap-tools",
    classicMainWrap: "tt-shell-no-drag flex-1 min-h-0 h-full",
    classicStatusWrap: "tt-shell-no-drag",
} as const;
export const SPLIT_VIEW_CLASS = {
    emptyText: `${TEXT_ROLE.bodyStrong} text-foreground/30`,
    emptyPanel: "flex h-full items-center justify-center border-default/10 text-center",
    root: "flex flex-col h-full min-h-0 overflow-hidden gap-tools",
    mapPanel: "flex flex-col h-full w-full",
    hudRow: "flex items-center justify-end gap-tools px-panel",
    hudLabel: `${withOpacity(TEXT_ROLE.label, 40)} mr-2`,
    mapCanvas: "h-full w-full",
    resizeHandle: "h-sep cursor-row-resize flex items-center justify-center",
    resizeBar: `w-24 h-0.5 rounded bg-content1/50 hover:bg-primary/50 ${TRANSITION.fast}`,
    listSurface:
        `${SURFACE_FRAME_CLASS.panel} flex-1 min-h-0 relative flex flex-col rounded-2xl border-content1/30 bg-content1/10`,
    header:
        `flex items-center gap-panel px-panel py-tight border-b border-content1/10 ${withOpacity(TEXT_ROLE.label, 30)}`,
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
    peerMapRoot:
        `flex flex-col flex-1 rounded-2xl border ${SURFACE_BORDER} bg-content1/5 p-panel gap-tools overflow-hidden relative`,
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
} as const;
export const buildSplitViewAddressClass = (isHostile: boolean) =>
    isHostile
        ? `${TEXT_ROLE.code} truncate text-danger`
        : `${TEXT_ROLE.code} truncate text-foreground/90`;
export const buildSplitViewPeerActivityClass = (isInstrument: boolean) =>
    isInstrument
        ? `${SPLIT_VIEW_CLASS.peerMapActivityIcon} ${SPLIT_VIEW_CLASS.peerMapActivityIconActive}`
        : `${SPLIT_VIEW_CLASS.peerMapActivityIcon} ${SPLIT_VIEW_CLASS.peerMapActivityIconInactive}`;
export const buildSplitViewPeerNodeClass = (isUTP: boolean) =>
    isUTP
        ? `${SPLIT_VIEW_CLASS.peerMapNodeMotion} ${SPLIT_VIEW_CLASS.peerMapNodeGlow}`
        : SPLIT_VIEW_CLASS.peerMapNodeMotion;
export const buildSplitViewRowClass = (params: {
    hovered: boolean;
    hostile: boolean;
}) =>
    params.hostile
        ? `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 bg-danger/5`
        : params.hovered
          ? `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 bg-primary/10`
          : `absolute left-0 right-0 flex items-center px-panel ${TRANSITION.fast} border-b border-content1/5 hover:bg-content1/5`;
export const CONTEXT_MENU_CLASS = {
    panel:
        "pointer-events-auto absolute z-popover rounded-2xl border border-content1/40 bg-content1/90 p-tight backdrop-blur-3xl shadow-2xl",
    panelStyle: { minWidth: 200 } as const,
    header: "px-panel py-tight border-b border-content1/10 mb-tight flex items-center gap-tools",
    headerIcon: "text-foreground/30",
    headerText: `${TEXT_ROLE.label} text-foreground/40 truncate`,
    actionButton:
        `w-full flex items-center gap-tools px-panel py-tight rounded-xl ${TEXT_ROLE.buttonText} ${INTERACTIVE_RECIPE.menuItem}`,
    dangerActionButton:
        `w-full flex items-center gap-tools px-panel py-tight rounded-xl ${withColor(TEXT_ROLE.buttonText, "danger")} ${INTERACTIVE_RECIPE.menuItemDanger} border-t border-content1/10 mt-tight`,
} as const;
export const APP_STATUS_CLASS = {
    statGroup: "flex flex-col gap-tight whitespace-nowrap",
    statGroupEnd: "items-end",
    statGroupStart: "items-start",
    statValueRow: "flex items-center gap-tools",
    statValueText: `${TEXT_ROLE_EXTENDED.statusBarValue} truncate text-right font-semibold`,
    statIcon: "text-foreground/30",
    telemetryIconWrap: "inline-flex items-center",
    speedModule:
        `flex flex-1 items-center h-full min-w-0 gap-tools group rounded-modal border ${SURFACE_BORDER} bg-content1/5 backdrop-blur-sm ${TRANSITION.slow} group-hover:border-content1/40 group-hover:bg-content1/10`,
    speedModuleGraphWrap: "relative flex flex-1 h-full min-w-0 gap-tools",
    speedModuleGraph:
        `relative flex-1 h-full min-w-0 min-h-0 py-tight overflow-visible opacity-30 grayscale ${TRANSITION.reveal} group-hover:grayscale-0 group-hover:opacity-100`,
    speedModuleGraphCanvas: "absolute inset-0 h-full w-full",
    speedModuleOverlay: "absolute inset-0 flex items-center justify-start px-panel pointer-events-none",
    speedModuleOverlayRow: "flex items-center gap-tools text-foreground",
    speedModuleIconWrap:
        `flex items-center justify-center rounded-modal ${TRANSITION.fast} toolbar-icon-size-xl`,
    speedModuleTextWrap: "flex flex-col gap-tight text-left",
    speedModuleLabel: `${TEXT_ROLE_EXTENDED.statusBarLabel} text-foreground/40`,
    speedModuleValue: `${TEXT_ROLE.heading} tracking-tight leading-none`,
    speedSeparator: "w-px bg-content1/10",
    engineButton:
        `relative flex items-center justify-center rounded-modal border px-panel ${TRANSITION.medium} active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer`,
    engineConnectedWrap: "absolute inset-0 flex items-start justify-end p-tight",
    engineConnectedPulse: "absolute inline-flex rounded-full",
    engineConnectedDot: "relative inline-flex rounded-full bg-current",
    footer: "w-full shrink-0 select-none relative z-overlay overflow-visible acrylic shadow-inner shadow-small",
    main: "flex items-center justify-between gap-stage",
    speedFull: "hidden sm:flex flex-1 items-center h-full py-tight gap-stage min-w-0",
    speedCompact: "flex sm:hidden flex-1 items-center h-full py-tight min-w-0",
    speedCompactGraphWrap: "relative flex-1 h-full min-h-0",
    speedCompactLayer: "absolute inset-0",
    speedCompactUpLayer: "absolute inset-0 z-panel",
    speedCompactUpGraph: "h-full w-full opacity-60 mix-blend-screen",
    speedCompactOverlay: "relative z-overlay flex items-center justify-center h-full pointer-events-none",
    speedCompactOverlayRow: "flex items-center gap-tight text-center",
    speedCompactColumn: "flex flex-col items-center",
    speedCompactDownIcon: "toolbar-icon-size-md text-success",
    speedCompactUpIcon: "toolbar-icon-size-md text-primary",
    speedCompactValue: `${TEXT_ROLE.heading} tracking-tight leading-none`,
    speedCompactDivider: "w-px h-nav bg-content1/10 mx-tight",
    right: "flex shrink-0 items-center border-l border-content1/10 gap-stage",
} as const;
export const METRIC_CHART_CLASS = {
    canvasWrap: "w-full relative min-h-0",
    canvas: "block w-full h-full",
    root: "flex flex-col gap-tools h-full min-h-0",
    header: `flex items-center justify-between shrink-0 ${withOpacity(TEXT_ROLE.code, 60)}`,
    metrics: "flex items-center gap-panel",
    downMetric: "flex items-center gap-tight text-success font-bold",
    upMetric: "flex items-center gap-tight text-primary font-bold",
    controls: "flex items-center gap-tight",
    layoutGroup: "bg-content1/20 rounded-panel p-tight gap-none mr-tight",
    layoutButtonBase: "rounded-tight",
    windowGroup: "flex bg-content1/20 rounded-pill p-tight",
    windowButtonBase: "rounded-pill px-tight min-w-0 font-medium",
    content: "flex-1 min-h-0 flex flex-col gap-panel",
    panel:
        `flex-1 min-h-0 flex flex-col rounded-panel border ${SURFACE_BORDER} bg-content1/10 p-panel overflow-hidden relative`,
    panelLabelWrap: "absolute z-panel pointer-events-none",
    panelSeries: "flex-1",
    progressBar: {
        track: "relative h-full overflow-hidden rounded-full bg-content1/20",
        indicator:
            `absolute inset-y-0 left-0 transform origin-left rounded-full ${TRANSITION.slow} ease-out`,
    } as const,
    capacityGauge: {
        container: "space-y-tight rounded-xl border bg-content1/15 p-panel",
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
    } as const,
} as const;
export const buildMetricChartLayoutButtonClass = (active: boolean) =>
    active
        ? `${METRIC_CHART_CLASS.layoutButtonBase} bg-background shadow-small text-foreground`
        : `${METRIC_CHART_CLASS.layoutButtonBase} bg-transparent text-foreground/50`;
export const buildMetricChartWindowButtonClass = (active: boolean) =>
    active
        ? `${METRIC_CHART_CLASS.windowButtonBase} bg-foreground text-background shadow-small`
        : `${METRIC_CHART_CLASS.windowButtonBase} text-foreground/60`;
export const DASHBOARD_LAYOUT_CLASS = {
    root:
        `relative h-full w-full flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden ${TRANSITION.medium} border-t border-default/10 bg-transparent`,
    content: "relative flex-1 min-h-0 w-full h-full overflow-hidden",
    contentClassicSurface: "bg-background/40",
    dropOverlay:
        "pointer-events-none absolute inset-0 flex items-center justify-center z-popover",
    dropOverlayAccent: "absolute inset-2 border border-primary/60",
    dropOverlayIconWrap: "relative z-panel",
    panelGroup: "flex-1 min-h-0 h-full w-full relative overflow-hidden rounded-2xl",
    mainPanel: "relative flex-1 min-h-0 shadow-medium",
    tableHost: "relative z-panel h-full min-h-0 overflow-hidden",
    tableWatermark: "torrent-table-watermark absolute inset-0 z-0 pointer-events-none",
    tableContent: "relative z-panel h-full min-h-0",
    resizeHandleInner: "absolute inset-0 flex items-center justify-center",
    resizeHandleBar:
        `${TRANSITION.fast} bg-foreground/0 group-hover:bg-foreground/10 group-active:bg-primary/50`,
    inspectorContent: "h-full min-h-0 flex-1",
    section: "flex-1 min-h-0 h-full",
    fullscreenOverlay: "fixed inset-0 z-dnd",
    fullscreenSection: "relative h-full flex items-center justify-center",
    fullscreenBackdrop: "absolute inset-0 pointer-events-none bg-background/60 backdrop-blur-sm",
    fullscreenPanel:
        `relative z-panel flex h-full w-full flex-col overflow-hidden bg-content1/80 backdrop-blur-xl border ${SURFACE_BORDER} shadow-medium`,
} as const;
export const buildDashboardResizeHandleClass = (isHorizontalSplit: boolean) =>
    isHorizontalSplit
        ? `group relative z-panel ${TRANSITION.fast} focus:outline-none cursor-col-resize`
        : `group relative z-panel ${TRANSITION.fast} focus:outline-none cursor-row-resize`;
export const buildDashboardInspectorPanelClass = (isHorizontalSplit: boolean) =>
    isHorizontalSplit
        ? "hidden overflow-hidden lg:flex shadow-medium h-full"
        : "hidden overflow-hidden lg:flex shadow-medium w-full";
export const APP_NAV_CLASS = {
    root: "sticky top-0 z-overlay w-full shrink-0 select-none overflow-visible",
    titlebar: "app-titlebar flex w-full items-stretch",
    main: "flex grow h-full min-w-0 items-center justify-between gap-stage py-tight relative",
    left: "flex items-center gap-tools min-w-0",
    brandGroup: "flex items-center gap-tools pr-tight",
    brandIconWrap: "flex items-center justify-center",
    brandTextWrap: "hidden xl:flex flex-col justify-center ml-tight",
    brandName: "font-bold tracking-tight text-foreground text-base leading-none text-navbar",
    brandVersion: `${TEXT_ROLE.codeMuted} text-xs font-medium leading-none mt-0.5 text-default-400`,
    primarySeparator: "hidden min-[600px]:flex h-sep w-px bg-default-200/50 mx-tight",
    tabsWrap: "hidden min-[1200px]:flex text-navbar min-w-0",
    tabTitle: "flex items-center gap-tight",
    tabLabel: "hidden min-[1600px]:inline",
    tabIcon: "text-default-400",
    searchWrap: "hidden min-[1400px]:flex",
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
    selectionExtraActions: "hidden min-[600px]:flex gap-tools",
    selectionPauseEmphasis: "ring-1 ring-warning/30 shadow-sm",
    selectionRecheckEmphasis: "ring-1 ring-default/20 shadow-sm",
    ghostAction: `text-default-400 ${INTERACTIVE_RECIPE.buttonGhost}`,
    themeMobileWrap: "flex max-[799px]:flex min-[800px]:hidden",
    rehashWrap: "absolute inset-x-6 bottom-0 translate-y-1/2",
    rehashTooltipWrap: "relative group cursor-help",
    rehashTrack: "h-track bg-transparent",
    rehashIndicator: "h-full bg-gradient-to-r from-primary to-secondary shadow-nav",
    rehashTooltip:
        `absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 text-white px-tight py-tight rounded shadow-lg whitespace-nowrap pointer-events-none ${TEXT_ROLE.body} ${INTERACTIVE_RECIPE.groupReveal}`,
    windowControls:
        "hidden min-[800px]:flex h-full items-stretch divide-x divide-default/20 overflow-hidden",
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
        inputWrapper:
            `h-full flex items-center gap-tools flex-nowrap font-normal text-default-500 bg-default-100/50 hover:bg-default-200/50 p-tight border border-default-200/50 focus-within:bg-default-100 focus-within:border-primary/20 shadow-inner rounded-full ${TRANSITION.fast}`,
    } as const,
} as const;
export const buildAppNavSelectionActionsClass = (hasSelection: boolean) =>
    hasSelection
        ? `flex items-center gap-tools ${TRANSITION.medium} opacity-100`
        : `flex items-center gap-tools ${TRANSITION.medium} opacity-30 pointer-events-none grayscale`;
export const COMMAND_PALETTE_CLASS = {
    overlay: "fixed inset-0 z-popover",
    backdrop: "absolute inset-0 bg-background/90 backdrop-blur-xl",
    section: "relative h-full flex items-start justify-center",
    panel: `${GLASS_MODAL_SURFACE} ${MODAL_SURFACE_FRAME} relative z-panel w-full max-w-2xl`,
    input:
        "rounded-none border-0 bg-transparent px-panel py-panel text-base font-semibold outline-none placeholder:text-foreground/50",
    list: "max-h-command-palette overflow-y-auto px-panel py-panel",
    groupWrap: "pb-panel",
    item:
        "glass-panel mt-tight flex cursor-pointer flex-col border border-content1/10 bg-background/80 py-panel px-panel text-left transition hover:border-foreground/40 hover:bg-background/90 focus:border-primary focus:outline-none",
    itemRow: "flex items-center justify-between text-sm font-semibold text-foreground",
    shortcutWrap: `flex gap-tools ${TEXT_ROLE.codeCaption} text-foreground/50`,
    shortcutKey: "rounded-full border border-foreground/30 px-tight py-tight",
    description: `${TEXT_ROLE.bodySmall} text-foreground/70`,
    empty: `py-panel text-center ${TEXT_ROLE.caption}`,
    outcome: "border-t border-default/20 px-panel py-tight text-xs font-medium",
} as const;
const TORRENT_HEADER_CELL_BASE_CLASS =
    `relative flex items-center h-row border-r border-content1/10 ${TRANSITION.fast} group select-none overflow-visible box-border border-l-2 border-l-transparent`;
export const buildTorrentHeaderCellClass = (params: {
    canSort: boolean;
    isOverlay: boolean;
    isDragging: boolean;
}) =>
    [
        TORRENT_HEADER_CELL_BASE_CLASS,
        params.canSort ? "cursor-pointer hover:bg-content1/10" : "cursor-default",
        params.isOverlay ? "bg-content1/90 cursor-grabbing" : "bg-transparent",
        params.isOverlay ? SURFACE_ATOM_CLASS.shadowPanel : "",
        params.isDragging && !params.isOverlay ? "opacity-30" : "opacity-100",
    ]
        .filter(Boolean)
        .join(" ");
const TORRENT_HEADER_ACTIVATOR_BASE_CLASS =
    "flex items-center overflow-hidden h-full truncate whitespace-nowrap text-ellipsis box-border leading-none flex-1 gap-tools text-scaled font-bold uppercase text-foreground/60 pl-tight pr-tight";
const TORRENT_HEADER_ACTIVATOR_TRACKING_STYLE = {
    letterSpacing: "var(--tt-tracking-tight)",
} as const;
export const buildTorrentHeaderActivatorClass = (params: {
    isOverlay: boolean;
    align: "start" | "center" | "end";
    isSelection: boolean;
}) =>
    [
        TORRENT_HEADER_ACTIVATOR_BASE_CLASS,
        params.isOverlay ? "text-foreground" : "",
        params.align === "center" ? "justify-center" : "",
        params.align === "end" ? "justify-end" : "",
        params.isSelection ? "justify-center" : "",
    ]
        .filter(Boolean)
        .join(" ");
export const buildTorrentHeaderSortIconClass = (visible: boolean) =>
    `text-primary shrink-0 toolbar-icon-size-sm ${visible ? "opacity-100" : "opacity-0"}`;
const TORRENT_HEADER_RESIZE_HANDLE_CLASS =
    "absolute right-0 top-0 h-full cursor-col-resize touch-none select-none flex items-center justify-end z-overlay w-handle";
export const buildTorrentHeaderResizeBarClass = (isResizing: boolean) =>
    [
        `bg-foreground/10 ${TRANSITION.fast} rounded-full h-resize-h`,
        "group-hover:bg-primary/50",
        isResizing ? "bg-primary h-resize-h" : "",
    ]
        .filter(Boolean)
        .join(" ");
const TORRENT_HEADER_RESIZE_BAR_STYLE = {
    width: "var(--tt-divider-width)",
} as const;
export const TORRENT_HEADER_CLASS = {
    activatorTrackingStyle: TORRENT_HEADER_ACTIVATOR_TRACKING_STYLE,
    resizeHandle: TORRENT_HEADER_RESIZE_HANDLE_CLASS,
    resizeBarStyle: TORRENT_HEADER_RESIZE_BAR_STYLE,
} as const;
// Justification: runtime mode (Full vs Rpc) changes modal geometry;
// this remains a token builder to avoid mode branches in feature files.
export const buildSettingsModalClassNames = (uiMode: string) => ({
    base: `${MODAL_SURFACE_BASE_CLASS} ${
        uiMode === "Full"
            ? "flex flex-row max-h-full max-w-full"
            : "flex flex-row h-settings max-h-settings min-h-settings"
    }`,
    wrapper: "overflow-hidden",
});
// Justification: gate/fullscreen state determines shell height;
// this builder centralizes modal shell variability in one authority.
export const buildAddTorrentModalClassNames = (params: {
    showDestinationGate: boolean;
    isFullscreen: boolean;
}) => ({
    base: `${MODAL_SURFACE_BASE_CLASS} w-full ${
        !params.showDestinationGate && params.isFullscreen
            ? "h-full"
            : "max-h-modal-body"
    }`,
    ...MODAL_CHROME_CLASSNAMES,
});
export const FORM_CONTROL_CLASS = {
    checkboxPrimaryClassNames: { wrapper: "after:bg-primary" } as const,
    checkboxMarginRightClassNames: { base: "mr-tight" } as const,
    checkboxLabelBodySmallClassNames: {
        label: TEXT_ROLE.bodySmall,
    } as const,
    priorityChipClassNames: {
        content: "text-label font-semibold uppercase px-0",
    } as const,
    statusChipClassNames: {
        base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
        content: "font-bold text-scaled tracking-wider whitespace-nowrap text-foreground",
    } as const,
    statusChipContainer: "min-w-0 w-full flex items-center justify-center h-full",
    statusChipContent: "flex items-center justify-center gap-tools",
    statusChipWarningIcon: "toolbar-icon-size-md text-warning",
    statusChipLabel: "truncate max-w-full",
} as const;
export const INPUT_SURFACE_CLASS = {
    mono: {
        input: "font-mono text-scaled selection:bg-primary/20 selection:text-foreground !outline-none focus:!outline-none focus-visible:!outline-none",
        inputWrapper:
            `surface-layer-1 ${TRANSITION.fast} shadow-none group-hover:border-default/10`,
    } as const,
    monoEmphasized: {
        inputWrapper:
            "surface-layer-1 border border-default/10 shadow-none focus-within:border-primary/70",
        content: "",
        input: "bg-transparent text-scaled font-mono text-foreground placeholder:text-foreground/30",
    } as const,
    codeTextareaClassNames: {
        input: TEXT_ROLE.code,
    } as const,
} as const;
export const FILE_BROWSER_CLASS = {
    container: "flex flex-col h-full rounded-medium border border-default-200/50 shadow-small",
    toolbar:
        "flex flex-wrap items-center gap-tools p-tight border-b border-default-200/50 bg-content1/30",
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
    headerRow:
        "grid grid-cols-file-tree items-center px-panel py-tight border-b border-default-200/50 z-sticky",
    headerCheckboxWrap: "flex items-center justify-center",
    headerPriority: "text-center",
    headerProgress: "text-center",
    headerSize: "text-right",
    scroll: "flex-1 overflow-auto min-h-0 relative scrollbar-hide",
    virtualCanvas: "relative w-full",
    virtualRow: "absolute top-0 left-0 w-full",
    emptyOverlay:
        "flex flex-col items-center justify-center h-full text-default-400 gap-tools absolute inset-0",
    emptyIcon: "toolbar-icon-size-lg opacity-20",
    emptyText: `${TEXT_ROLE.body} opacity-50`,
    progressClassNames: {
        track: "h-sep",
        indicator: `${TRANSITION.medium} h-sep`,
    } as const,
    row:
        `grid grid-cols-file-tree items-center h-row px-panel w-full select-none border-b border-default-100/50 hover:bg-default-100/60 ${TRANSITION.fast}`,
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
    chevronButton:
        `file-tree-chevron-hit text-default-400 rounded-full hover:text-foreground hover:bg-default-200/50 ${TRANSITION.fast}`,
    priorityChip:
        `h-status-chip gap-tight px-tight min-w-status-chip cursor-pointer hover:opacity-80 ${TRANSITION.reveal}`,
    priorityMenuDangerItem: "text-danger",
    priorityMenuHighIcon: "toolbar-icon-size-sm text-success",
    priorityMenuNormalIcon: "toolbar-icon-size-sm text-primary",
    priorityMenuLowIcon: "toolbar-icon-size-sm text-warning",
    priorityMenuSkipIcon: "toolbar-icon-size-sm",
} as const;
export const buildFileBrowserSelectionActionsClass = (hasSelection: boolean) =>
    hasSelection
        ? `flex items-center gap-tools ${TRANSITION.medium} opacity-100`
        : `flex items-center gap-tools ${TRANSITION.medium} opacity-0 pointer-events-none`;
export const DETAIL_TABLE_CLASS = {
    root: "flex h-full flex-col gap-panel",
    toolbar: "sticky top-0 z-sticky flex items-center justify-between px-tight",
    toolbarGroup: "flex items-center gap-tools",
    body: "relative min-h-0 flex-1",
    panel: "min-h-0 flex-1 overflow-hidden",
    scroll: "h-full overflow-auto",
    emptyPanel: SPLIT_VIEW_CLASS.emptyPanel,
    emptyText: SPLIT_VIEW_CLASS.emptyText,
    table: "w-full border-separate border-spacing-0 text-left",
    tableHeadRow: `${TEXT_ROLE.label} text-foreground/40`,
    tableHeadCellIcon: "border-b border-default/10 py-panel pl-panel pr-tight",
    tableHeadCell: "border-b border-default/10 px-tight py-panel",
    tableHeadCellStatus: "border-b border-default/10 py-panel pl-tight pr-panel text-right",
    tableBody: TEXT_ROLE.code,
    tableRow: "group hover:bg-primary/5",
    cellIcon: "border-b border-default/5 py-panel pl-panel pr-tight",
    cellHost:
        "truncate border-b border-default/5 px-tight py-panel font-sans font-medium text-foreground/80",
    cellAnnounce: "border-b border-default/5 px-tight py-panel text-foreground/50 tabular-nums",
    cellPeers: "border-b border-default/5 px-tight py-panel text-foreground/70",
    cellStatus:
        `border-b border-default/5 py-panel pl-tight pr-panel text-right ${TEXT_ROLE.labelPrimary}`,
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
} as const;
export const buildAvailabilityDotClass = (isOnline: boolean) =>
    isOnline
        ? "size-dot rounded-full shadow-dot bg-success shadow-success/50"
        : "size-dot rounded-full shadow-dot bg-warning shadow-warning/50";
export const buildCapacityGaugeContainerClass = (isInsufficient: boolean) =>
    isInsufficient
        ? `${METRIC_CHART_CLASS.capacityGauge.container} border-danger/40 bg-danger/5`
        : `${METRIC_CHART_CLASS.capacityGauge.container} ${SURFACE_BORDER}`;
export const buildCapacityGaugeIndicatorClass = (isInsufficient: boolean) =>
    isInsufficient
        ? "h-full rounded-full bg-gradient-to-r from-danger/70 via-warning/70 to-success/70"
        : "h-full rounded-full bg-gradient-to-r from-success/50 to-success";
export const buildMissingFilesStatusTriggerClass = (isBusyWithOtherTorrent: boolean) =>
    isBusyWithOtherTorrent
        ? `min-w-0 outline-none rounded-panel ${TRANSITION.reveal} cursor-pointer opacity-90 hover:opacity-90`
        : `min-w-0 outline-none rounded-panel ${TRANSITION.reveal} cursor-pointer hover:opacity-90`;
export const buildModalPaneHandleBarClass = (isActive: boolean) =>
    isActive
        ? "bg-primary/55"
        : "bg-default/30 group-hover:bg-primary/45";
export const buildModalPaneHandleClass = (isSettingsCollapsed: boolean) =>
    `${APP_MODAL_CLASS.workflow.paneHandle} ${
        isSettingsCollapsed
            ? APP_MODAL_CLASS.workflow.paneHandleDisabled
            : APP_MODAL_CLASS.workflow.paneHandleEnabled
    }`;
export const buildModalBodyPanelsClass = (isFullscreen: boolean) =>
    isFullscreen
        ? "flex flex-col flex-1 min-h-settings h-full min-h-0"
        : "flex flex-col flex-1 min-h-settings";
export const buildModalSettingsPanelClass = (isSettingsCollapsed: boolean) =>
    [
        SURFACE_ATOM_CLASS.glassPanel,
        SURFACE_FRAME_CLASS.pane,
        "bg-background/65",
        isSettingsCollapsed ? "min-w-0 w-0 border-none" : "",
    ]
        .filter(Boolean)
        .join(" ");
export const buildModalResizeHandleBarClass = (params: {
    isSettingsCollapsed: boolean;
    isPanelResizeActive: boolean;
}) =>
    params.isSettingsCollapsed
        ? `h-full w-divider ${TRANSITION.fast} bg-transparent`
        : `h-full w-divider ${TRANSITION.fast} ${buildModalPaneHandleBarClass(
              params.isPanelResizeActive,
          )}`;
export const buildFormStatusToneClass = (statusKind: string) =>
    statusKind === "danger"
        ? "text-danger"
        : statusKind === "warning"
            ? "text-warning"
            : "text-foreground/60";
export const HEATMAP_VIEW_CLASS = {
    empty: `rounded-2xl border ${SURFACE_BORDER} bg-content1/10 p-panel text-center`,
    root: "flex flex-col gap-tools",
    header: "flex items-center justify-between",
    legend: "flex items-center gap-tools",
    legendItem: "flex items-center gap-tight",
    legendDot: "size-dot rounded-full",
    controls: "flex items-center gap-tight",
    zoomButton: "size-icon-btn rounded-full",
    zoomIcon: "text-current",
    canvasFrame: `rounded-2xl border ${SURFACE_BORDER} bg-content1/10 p-tight ${TRANSITION.medium}`,
    canvasPulse: "opacity-70 shadow-availability ring-1 ring-primary/40",
    canvas: "w-full h-auto block rounded-2xl cursor-crosshair",
    labelTrackingStyle: {
        letterSpacing: "var(--tt-tracking-ultra)",
    } as const,
} as const;
// Justification: settings input semantics depend on state (`disabled`, `mono`);
// this builder prevents repeated inline classNames objects in renderers.
export const buildSettingsBufferedInputClassNames = (params: {
    disabled: boolean;
    mono: boolean;
}) => ({
    inputWrapper:
        params.disabled
            ? `h-button ${TRANSITION.fast} ${VISUAL_STATE.disabled}`
            : `h-button ${TRANSITION.fast} group-hover:border-primary/50`,
    input: params.mono
        ? `${withOpacity(TEXT_ROLE.body, 90)} font-mono tracking-tight`
        : `${withOpacity(TEXT_ROLE.body, 90)} font-medium`,
    label: `${TEXT_ROLE_EXTENDED.settingsLabel} font-medium mb-tight`,
});


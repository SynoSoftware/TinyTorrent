# Surface Component Tree

Generated: 2026-02-13

Scope: all TSX importers of glass-surface.ts

Files analyzed: 55

## Common Token Usage

- TEXT_ROLE.caption: 24
- MODAL.workflow: 16
- TEXT_ROLE.bodySmall: 13
- TEXT_ROLE.label: 10
- TABLE.emptyBar: 8
- SURFACE.menu.listClassNames: 6
- SURFACE.menu.surface: 6
- TEXT_ROLE.body: 5
- SPLIT.mapStatColumn: 5
- DIAGNOSTIC.verifyHeaderCell: 4
- DIAGNOSTIC.verifyCell: 4
- FORM.interfaceRowTitle: 4
- SURFACE.atom.textCurrent: 4
- FILE_BROWSER.iconSmall: 4
- DIAGNOSTIC.stepHeader: 3
- DIAGNOSTIC.stack: 3
- DIAGNOSTIC.topbar: 3
- NAV.tabTitle: 3
- NAV.tabIcon: 3
- NAV.tabLabel: 3
- STATUS_BAR.iconCurrent: 3
- TEXT_ROLE.labelPrimary: 3
- DETAILS.generalButtonIcon: 3
- SURFACE.tooltip: 3
- TEXT_ROLE.code: 3
- SPLIT.mapLegendItem: 3
- SPLIT.mapLegendSwatch: 3
- TEXT_ROLE.bodyMuted: 3
- METRIC_CHART.panel: 3
- METRIC_CHART.panelSeries: 3
- DETAIL_TABLE.tableHeadCell: 3
- TEXT_ROLE_EXTENDED.modalTitle: 3
- TABLE.emptyHintRow: 3
- FORM_CONTROL.statusChipContainer: 3
- FORM_CONTROL.statusChipClassNames: 3
- FORM_CONTROL.statusChipContent: 3
- FORM.sectionMarginTop: 3
- FORM.blockStackTight: 3
- FORM.connection.iconSmall: 3
- SURFACE.atom.iconButton: 3

## Common Element + Token Patterns

- div > div > div > span :: TEXT_ROLE.label: 6
- div > div > div :: SPLIT.mapStatColumn: 5
- Section > div > div > div > GlassPanel > div > div > div > table > thead > tr > th :: DIAGNOSTIC.verifyHeaderCell: 4
- Section > div > div > div > GlassPanel > div > div > div > table > tbody > tr > td :: DIAGNOSTIC.verifyCell: 4
- div > div > div > div > span :: TABLE.emptyBar: 4
- div > div > div > span :: TABLE.emptyBar: 4
- Section > div > div > div > GlassPanel > div > div > p :: TEXT_ROLE.bodySmall: 3
- header > div > div > div > div > Tabs > div :: NAV.tabTitle: 3
- header > div > div > div > div > Tabs > div > StatusIcon :: NAV.tabIcon: 3
- header > div > div > div > div > Tabs > div > span :: NAV.tabLabel: 3
- div > div > div > span :: TEXT_ROLE.code: 3
- div > div > span :: SPLIT.mapLegendItem: 3
- div > div > span > span :: SPLIT.mapLegendSwatch: 3
- div > div > span > span :: TEXT_ROLE.bodyMuted: 3
- table > thead > tr > th :: DETAIL_TABLE.tableHeadCell: 3
- div :: FORM_CONTROL.statusChipContainer: 3
- Fragment > SettingsSection :: FORM.sectionMarginTop: 3
- div :: FORM.blockStackTight: 3
- Modal > ModalContent > AddTorrentModalContextProvider > form > div > Fragment > p :: MODAL.workflow: 3
- Modal > ModalContent > AddTorrentModalContextProvider > form > ModalFooter > div > AlertPanel > span :: MODAL.workflow: 3
- Section > div > div > GlassPanel > div > DevWorkflowStep > div :: DIAGNOSTIC.optionsStack: 2
- Section > div > div > div > GlassPanel > div > div > div :: DIAGNOSTIC.topbar: 2
- Section > div > div > div > GlassPanel > div > div > div > table > tbody > tr > td :: TEXT_ROLE_EXTENDED.tableCell: 2
- Section > div > div > div > GlassPanel > div > div > div > div > div > div :: DIAGNOSTIC.systemStatusPair: 2
- Section > div > div > div > div > span :: TEXT_ROLE.bodySmall: 2
- Section > div > div > div > div > span :: TEXT_ROLE.caption: 2
- header > div > div :: NAV.workbenchShell: 2
- header > div > div > div > div :: NAV.selectionSeparator: 2
- footer > div > div > div > div > div > div :: STATUS_BAR.speedCompactColumn: 2
- footer > div > div > div > div > div > div > span :: STATUS_BAR.srOnly: 2
- footer > div > div > div > div > div > div > span :: STATUS_BAR.speedCompactValue: 2
- div :: TABLE.detailsContentRoot: 2
- div > GlassPanel > div > div > div :: TEXT_ROLE.caption: 2
- div > PanelGroup > Panel > GlassPanel > div > span :: SPLIT.headerSpeedCol: 2
- div > PanelGroup > Panel > GlassPanel > div > div > button :: CONTEXT_MENU.actionButton: 2
- PanelGroup > Panel :: SPLIT.panel: 2
- PanelGroup > Panel > GlassPanel :: SPLIT.surfacePanel: 2
- PanelGroup > Panel > GlassPanel > div :: SPLIT.sectionHeader: 2
- PanelGroup > Panel > GlassPanel > div > span :: TEXT_ROLE.label: 2
- motion.div > div > div > span :: HEATMAP.legendItem: 2

## Component Trees

### src/app/components/CommandPalette.tsx (component)

- motion.div [COMMAND_PALETTE.overlay]
  - motion.div [COMMAND_PALETTE.backdrop]
  - Section [COMMAND_PALETTE.section]
    - motion.div [COMMAND_PALETTE.panel]
      - Command
        - Command.Input [COMMAND_PALETTE.input]
        - Command.List [COMMAND_PALETTE.list]
          - div [COMMAND_PALETTE.groupWrap]
            - div [TEXT_ROLE_EXTENDED.commandSection]
            - Command.Group
              - Command.Item [COMMAND_PALETTE.item]
                - div [COMMAND_PALETTE.itemRow]
                  - div [COMMAND_PALETTE.shortcutWrap]
                    - span [COMMAND_PALETTE.shortcutKey]
                - p [COMMAND_PALETTE.description]
          - Command.Empty [COMMAND_PALETTE.empty]
        - div [COMMAND_PALETTE.outcome]

### src/app/components/DevTest.tsx (component)

- div [DIAGNOSTIC.stepCard]
  - div [DIAGNOSTIC.stepHeader]
- Chip [DIAGNOSTIC.statusChipClassNames]
- Section [DIAGNOSTIC.root]
  - div [DIAGNOSTIC.stack]
    - div [DIAGNOSTIC.topbar]
      - div [DIAGNOSTIC.topbarText]
        - h1 [TEXT_ROLE.heading]
        - p [TEXT_ROLE.bodySmall]
    - div [DIAGNOSTIC.grid]
      - GlassPanel [DIAGNOSTIC.panelPrimary]
        - div [DIAGNOSTIC.stack]
          - div [DIAGNOSTIC.stepHeader]
            - h2 [DIAGNOSTIC.sectionTitle]
          - DevWorkflowStep
            - div [DIAGNOSTIC.optionsStack]
              - Button [DIAGNOSTIC.optionButtonFull]
                - span [TEXT_ROLE.body]
          - DevWorkflowStep
            - div [DIAGNOSTIC.optionsWrap]
          - DevWorkflowStep
            - div [DIAGNOSTIC.optionsStack]
              - div [DIAGNOSTIC.optionsGridResponsive]
                - Button [DIAGNOSTIC.optionButtonLeft]
                  - span [DIAGNOSTIC.optionLabelStrong, TEXT_ROLE.body]
          - DevWorkflowStep
            - div [DIAGNOSTIC.executeRow]
              - div [DIAGNOSTIC.executeActions]
            - div [DIAGNOSTIC.stateRow, TEXT_ROLE.bodySmall]
              - span [DIAGNOSTIC.statePill]
                - span [DIAGNOSTIC.statePillValue]
      - div [DIAGNOSTIC.panelSecondaryWrap]
        - GlassPanel [DIAGNOSTIC.panelSecondary]
          - div [DIAGNOSTIC.stack]
            - div [DIAGNOSTIC.stepHeader]
              - h2 [DIAGNOSTIC.sectionTitle]
            - div [DIAGNOSTIC.smokeCard]
              - div [DIAGNOSTIC.topbar]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC.smokeRows]
                - div [DIAGNOSTIC.smokeRow]
                  - span [TEXT_ROLE.body]
            - div [DIAGNOSTIC.verifyCard]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC.verifyTableWrap]
                - table [DIAGNOSTIC.verifyTable]
                  - thead [DIAGNOSTIC.verifyHead]
                    - tr [DIAGNOSTIC.verifyHeadRow]
                      - th [DIAGNOSTIC.verifyHeaderCell]
                      - th [DIAGNOSTIC.verifyHeaderCell]
                      - th [DIAGNOSTIC.verifyHeaderCell]
                      - th [DIAGNOSTIC.verifyHeaderCell]
                  - tbody
                    - tr [DIAGNOSTIC.verifyRow]
                      - td [DIAGNOSTIC.verifyCell]
                        - div [DIAGNOSTIC.verifyLabelWrap]
                          - span [TEXT_ROLE.body]
                          - span [TEXT_ROLE.caption]
                      - td [DIAGNOSTIC.verifyCell, TEXT_ROLE_EXTENDED.tableCell]
                      - td [DIAGNOSTIC.verifyCell, TEXT_ROLE_EXTENDED.tableCell]
                      - td [DIAGNOSTIC.verifyCell]
            - div [DIAGNOSTIC.systemCard]
              - div [DIAGNOSTIC.topbar]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC.systemRows]
                - div [DIAGNOSTIC.systemRowCard]
                  - div [DIAGNOSTIC.systemRowHead]
                    - span [DIAGNOSTIC.optionLabelStrong, TEXT_ROLE.body]
                    - span [TEXT_ROLE.caption]
                  - div [DIAGNOSTIC.systemStatusRow]
                    - div [DIAGNOSTIC.systemStatusPair]
                    - div [DIAGNOSTIC.systemStatusPair]
                  - div [DIAGNOSTIC.systemMeta, TEXT_ROLE.bodySmall]
                  - span [TEXT_ROLE.caption]
  - div [DIAGNOSTIC.footer]
    - div [DIAGNOSTIC.footerStack]
      - div [DIAGNOSTIC.footerRow]
        - div [DIAGNOSTIC.footerLeft]
          - span [DIAGNOSTIC.footerScenarioLabel, TEXT_ROLE.bodySmall]
          - span [DIAGNOSTIC.footerScenario, TEXT_ROLE.bodySmall]
          - span [DIAGNOSTIC.footerSummary, DIAGNOSTIC.footerSummaryMuted, TEXT_ROLE.caption]
        - div [DIAGNOSTIC.footerRight]
          - span [TEXT_ROLE.caption]
      - pre [DIAGNOSTIC.footerExpected, DIAGNOSTIC.footerExpectedTone, TEXT_ROLE.codeMuted]

### src/app/components/layout/Navbar.tsx (layout)

- header [NAV.root, NAV.workbenchSurface]
  - div [NAV.titlebar]
    - div [NAV.main, NAV.workbenchShell]
      - div [NAV.left]
        - div [NAV.brandGroup]
          - div [NAV.brandIconWrap]
          - div [NAV.brandTextWrap]
            - span [NAV.brandName]
            - span [NAV.brandVersion]
        - div [NAV.primarySeparator]
        - div [NAV.tabsWrap]
          - Tabs [NAV.filterTabsClassNames]
            - div [NAV.tabTitle]
              - StatusIcon [NAV.tabIcon]
              - span [NAV.tabLabel]
            - div [NAV.tabTitle]
              - StatusIcon [NAV.tabIcon]
              - span [NAV.tabLabel]
            - div [NAV.tabTitle]
              - StatusIcon [NAV.tabIcon]
              - span [NAV.tabLabel]
        - div [NAV.searchWrap]
          - Input [NAV.searchInputClassNames]
      - div [NAV.actions]
        - div [NAV.primaryActions]
          - ToolbarIconButton [NAV.primaryActionEmphasis]
        - div [NAV.selectionSeparator]
        - div [NAV.builder.selectionActionsClass]
          - ToolbarIconButton [NAV.selectionPauseEmphasis]
          - div [NAV.selectionExtraActions]
            - ToolbarIconButton [NAV.selectionRecheckEmphasis]
        - div [NAV.selectionSeparator]
        - ToolbarIconButton [NAV.ghostAction, NAV.ghostActionOverflow]
        - div [NAV.themeMobileWrap]
          - ToolbarIconButton [NAV.ghostAction, NAV.ghostActionOverflow]
      - div [NAV.rehashWrap]
        - div [NAV.rehashTooltipWrap]
          - div [NAV.rehashTooltip]
    - div [NAV.windowControls, NAV.workbenchShell]

### src/app/components/layout/StatusBar.tsx (layout)

- div [STATUS_BAR.statGroup, STATUS_BAR.statGroupEnd, STATUS_BAR.statGroupStart]
  - span [TEXT_ROLE_EXTENDED.statusBarLabel]
  - div [STATUS_BAR.statValueRow]
    - span [STATUS_BAR.statValueText]
    - StatusIcon [STATUS_BAR.statIcon]
- span [STATUS_BAR.telemetryIconWrap]
  - StatusIcon [STATUS_BAR.iconCurrent]
- Fragment
  - div [STATUS_BAR.speedModule]
    - div [STATUS_BAR.speedModuleGraphWrap]
      - div [STATUS_BAR.speedModuleGraph]
        - NetworkGraph [STATUS_BAR.speedModuleGraphCanvas]
        - div [STATUS_BAR.speedModuleOverlay]
          - div [STATUS_BAR.speedModuleOverlayRow]
            - div [STATUS_BAR.speedModuleIconWrap]
              - StatusIcon [STATUS_BAR.iconCurrent]
            - div [STATUS_BAR.speedModuleTextWrap]
              - span [STATUS_BAR.speedModuleLabel]
              - span [STATUS_BAR.speedModuleValue]
  - div [STATUS_BAR.speedSeparator]
- div [STATUS_BAR.telemetryGrid]
- StatusIcon [STATUS_BAR.iconMuted]
- StatusIcon [STATUS_BAR.iconCurrent]
- button [STATUS_BAR.engineButton]
  - span [STATUS_BAR.engineConnectedWrap]
    - motion.span [STATUS_BAR.engineConnectedPulse]
    - span [STATUS_BAR.engineConnectedDot]
- footer [STATUS_BAR.footer, STATUS_BAR.workbenchSurface]
  - div [STATUS_BAR.main]
    - StatGroup [STATUS_BAR.statGroupDesktop]
    - div [STATUS_BAR.speedFull]
    - div [STATUS_BAR.speedCompact]
      - div [STATUS_BAR.speedCompactGraphWrap]
        - div [STATUS_BAR.speedCompactLayer]
          - div [STATUS_BAR.speedCompactLayer]
            - NetworkGraph [STATUS_BAR.speedCompactDownGraph]
          - div [STATUS_BAR.speedCompactUpLayer]
            - NetworkGraph [STATUS_BAR.speedCompactUpGraph]
        - div [STATUS_BAR.speedCompactOverlay]
          - div [STATUS_BAR.speedCompactOverlayRow]
            - div [STATUS_BAR.speedCompactColumn]
              - ArrowDown [STATUS_BAR.speedCompactDownIcon]
              - span [STATUS_BAR.srOnly]
              - span [STATUS_BAR.speedCompactValue]
            - div [STATUS_BAR.speedCompactDivider]
            - div [STATUS_BAR.speedCompactColumn]
              - ArrowUp [STATUS_BAR.speedCompactUpIcon]
              - span [STATUS_BAR.srOnly]
              - span [STATUS_BAR.speedCompactValue]
    - div [STATUS_BAR.right]

### src/app/components/WorkspaceShell.tsx (shell)

- div [WORKBENCH.root]
  - div [WORKBENCH.immersiveBackgroundRoot]
    - div [WORKBENCH.immersiveBackgroundBase]
    - div [WORKBENCH.immersiveBackgroundPrimaryBlend]
    - div [WORKBENCH.immersiveBackgroundSecondaryBlend]
    - div [WORKBENCH.immersiveBackgroundNoise]
    - div [WORKBENCH.immersiveBackgroundAccentBottom]
    - div [WORKBENCH.immersiveBackgroundAccentTop]
  - AnimatePresence
    - motion.div [WORKBENCH.reconnectToast]
  - div [WORKBENCH.content]
    - Section [WORKBENCH.nativeShellBody, WORKBENCH.section, WORKBENCH.sectionGapClassic, WORKBENCH.sectionGapImmersive]
      - div [WORKBENCH.immersiveNavbarWrap]
      - Fragment
        - div [WORKBENCH.immersiveMainWrap, WORKBENCH.nativeShellInner]
          - main [WORKBENCH.immersiveMain, WORKBENCH.nativeShellMain]
        - section [WORKBENCH.immersiveHudSection]
          - AnimatePresence
            - motion.div [WORKBENCH.immersiveHudCard]
              - button [WORKBENCH.immersiveHudDismissButton]
                - StatusIcon [WORKBENCH.iconCurrent]
              - div [WORKBENCH.immersiveHudCardContent]
                - div [WORKBENCH.immersiveHudIconWrap]
                  - StatusIcon [WORKBENCH.iconCurrent]
                - div [WORKBENCH.immersiveHudTextWrap]
                  - p [TEXT_ROLE.caption]
                  - p [WORKBENCH.immersiveHudTextLabel]
                  - p [WORKBENCH.immersiveHudTextDescription]
        - div [WORKBENCH.immersiveStatusWrap]
      - div [WORKBENCH.classicStack]
        - div [WORKBENCH.classicMainWrap]
        - div [WORKBENCH.classicStatusWrap]

### src/modules/dashboard/components/Dashboard_Layout.tsx (layout)

- AnimatePresence
  - motion.div [DASHBOARD.dropOverlay]
    - motion.div [DASHBOARD.dropOverlayAccent]
    - div [DASHBOARD.dropOverlayIconWrap]
      - StatusIcon [DASHBOARD.dropOverlayIconTone]
- PanelGroup [DASHBOARD.panelGroup]
  - Panel [DASHBOARD.mainPanel]
    - div
      - div
        - div [DASHBOARD.tableHost]
          - div [DASHBOARD.tableWatermark]
          - div [DASHBOARD.tableContent]
  - PanelResizeHandle [DASHBOARD.builder.resizeHandleClass]
    - div [DASHBOARD.resizeHandleInner]
      - div [DASHBOARD.resizeHandleBar]
  - Panel [DASHBOARD.builder.inspectorPanelClass]
    - div
      - div
        - div [DASHBOARD.inspectorContent]
          - motion.div [DASHBOARD.inspectorContent]
- Section [DASHBOARD.section]
  - AnimatePresence
    - motion.div [DASHBOARD.fullscreenOverlay]
      - Section [DASHBOARD.fullscreenSection]
        - div [DASHBOARD.fullscreenBackdrop]
        - motion.div [DASHBOARD.fullscreenPanel]

### src/modules/dashboard/components/SetLocationEditor.tsx (component)

- div [FORM.locationEditorRoot]
  - div [FORM.locationEditorCaption]
  - div [FORM.locationEditorRow]
    - div [FORM.locationEditorIconWrap]
      - HardDrive [FORM.locationEditorIcon]
    - div [FORM.locationEditorField]
      - label [TEXT_ROLE.caption]
      - Input [TEXT_ROLE.codeMuted]
  - p [TEXT_ROLE.bodySmall]
  - div [TEXT_ROLE.bodySmall]
  - div [FORM.locationEditorActions]
  - div [FORM.locationEditorError]

### src/modules/dashboard/components/TorrentDetails_Content.tsx (component)

- div [TABLE.detailsContentRoot]
  - AlertPanel [TABLE.detailsContentWarning]
    - div [TEXT_ROLE.statusWarning]
    - div [TABLE.detailsContentRecoveryNote]
- div [TABLE.detailsContentRoot]
  - GlassPanel [TABLE.detailsContentHeaderShell]
    - div [TABLE.detailsContentHeaderRow]
      - div [TABLE.detailsContentHeaderMeta]
        - span [TABLE.detailsContentHeaderTitle]
        - p [TEXT_ROLE.caption]
      - span [TEXT_ROLE.labelPrimary]
  - div [TABLE.detailsContentHeaderShell]
    - div [TABLE.detailsContentHeaderRow]
      - div [TABLE.detailsContentHeaderMeta]
        - span [TABLE.detailsContentHeaderTitle]
        - p [TEXT_ROLE.caption]
      - span [TEXT_ROLE.labelPrimary]
  - GlassPanel [TABLE.detailsContentPanel]
    - div [TABLE.detailsContentSectionHeader]
    - div [TABLE.detailsContentListHost]
      - div [TABLE.detailsContentListScroll]

### src/modules/dashboard/components/TorrentDetails_General.tsx (component)

- div [DETAILS.generalRoot]
  - GlassPanel [DETAILS.generalCard]
    - div [DETAILS.generalHeaderRow]
      - div [DETAILS.generalPrimaryCol]
        - div [TEXT_ROLE.caption]
        - code [DETAILS.generalPathCode]
      - div [DETAILS.generalVerifyCol]
        - div [TEXT_ROLE.caption]
        - div [DETAILS.generalVerifyWrap]
  - AlertPanel
    - div [DETAILS.generalWarningStack]
      - span [TEXT_ROLE.statusWarning]
      - div [DETAILS.generalProbeStack]
      - div [TEXT_ROLE.bodySmall]
      - div [DETAILS.generalRecoveryHint]
  - div [DETAILS.generalControlsGrid]
    - div [DETAILS.generalControlsSpan]
      - GlassPanel [DETAILS.generalCard]
        - div [DETAILS.generalHeaderRow]
          - div
            - div [TEXT_ROLE.caption]
            - div [DETAILS.generalControlsDescription]
          - div [DETAILS.generalControlsMeta]
            - div [DETAILS.generalControlsActions]
              - Button
                - Fragment
                  - ToggleIcon [DETAILS.generalButtonIcon]
              - Button
                - Fragment
                  - Folder [DETAILS.generalButtonIcon]
              - Button
                - Fragment
                  - Trash2 [DETAILS.generalButtonIcon]

### src/modules/dashboard/components/TorrentDetails_Header.tsx (component)

- div [DETAILS.builder.headerClass]
  - div [DETAILS.headerLeft]
    - Info [DETAILS.headerInfoIcon]
    - span [DETAILS.headerTitle]
      - span [DETAILS.headerStatus]
        - em [DETAILS.headerPrimaryHint]
  - div [DETAILS.headerCenter]
    - div [DETAILS.headerTabs]
      - button [DETAILS.builder.headerTabButtonClass]
  - div [DETAILS.headerRight]

### src/modules/dashboard/components/TorrentDetails_Peers_Map.tsx (component)

- div [SPLIT.peerMapRoot]
  - div [SPLIT.peerMapHud]
    - div [SPLIT.peerMapHudMeta]
      - span [TEXT_ROLE_EXTENDED.chartLabelMuted]
      - div [SPLIT.peerMapHudStats]
        - StatusIcon [SPLIT.builder.peerActivityClass]
        - span [SPLIT.peerMapNodeCount]
    - AnimatePresence
      - motion.div [SPLIT.peerMapInstrumentInfo]
        - span [SPLIT.peerMapAperture]
        - StatusIcon [SPLIT.peerMapCompassIcon]
  - div [SPLIT.peerMapCanvasWrap]
    - svg [SPLIT.peerMapSvg]
      - circle [SPLIT.peerMapRing]
      - AnimatePresence
        - motion.g [SPLIT.peerMapGuides]
          - circle [SPLIT.peerMapGuideCircle]
          - line [SPLIT.peerMapGuideAxis]
      - g
        - Tooltip [SURFACE.tooltip]
          - g
            - motion.circle [SPLIT.builder.peerNodeClass]

### src/modules/dashboard/components/TorrentDetails_Peers.tsx (component)

- p [SPLIT.emptyText]
- GlassPanel [SPLIT.emptyPanel]
- div [SPLIT.root]
  - PanelGroup
    - Panel
      - GlassPanel [SPLIT.mapPanel]
        - div [SPLIT.hudRow]
          - div [SPLIT.hudLabel]
        - div [SPLIT.mapCanvas]
    - PanelResizeHandle
      - div [SPLIT.resizeHandle]
        - div [SPLIT.resizeBar]
    - Panel
      - GlassPanel [SPLIT.listSurface]
        - div [SPLIT.header]
          - span [SPLIT.headerFlagCol]
          - span [SPLIT.headerEndpointCol]
          - span [SPLIT.headerClientCol]
          - span [SPLIT.headerSpeedCol]
          - span [SPLIT.headerSpeedCol]
        - div [SPLIT.listScroll]
          - div
            - div [SPLIT.builder.rowClass]
              - div [SPLIT.flagsCol]
                - div [SPLIT.flagsWrap]
                  - Tooltip [SURFACE.tooltip]
                    - span [SPLIT.flagToken]
              - div [SPLIT.endpointCol]
                - StatusIcon [SPLIT.encryptedIcon]
                - StatusIcon [SPLIT.utpIcon]
                - span [SPLIT.builder.addressClass]
              - div [SPLIT.clientCol]
              - div [SPLIT.downRateCol]
              - div [SPLIT.upRateCol]
          - div [CONTEXT_MENU.panel]
            - div [CONTEXT_MENU.header]
              - StatusIcon [CONTEXT_MENU.headerIcon]
              - span [CONTEXT_MENU.headerText]
            - button [CONTEXT_MENU.actionButton]
            - button [CONTEXT_MENU.actionButton]
            - button [CONTEXT_MENU.dangerActionButton]

### src/modules/dashboard/components/TorrentDetails_Pieces_Heatmap.tsx (component)

- div [HEATMAP.empty, HEATMAP.emptyMuted]
- motion.div [HEATMAP.root]
  - div [HEATMAP.header]
    - span [TEXT_ROLE.label]
    - div [HEATMAP.legend, HEATMAP.legendMuted]
      - span [HEATMAP.legendItem]
        - span [HEATMAP.legendDot, HEATMAP.legendDotRare]
      - span [HEATMAP.legendItem]
        - span [HEATMAP.legendDot, HEATMAP.legendDotCommon]
    - div [HEATMAP.controls]
      - Button [HEATMAP.zoomButton]
        - StatusIcon [HEATMAP.zoomIcon]
      - span [HEATMAP.zoomValue]
      - Button [HEATMAP.zoomButton]
        - StatusIcon [HEATMAP.zoomIcon]
  - div [HEATMAP.builder.canvasFrameClass]
    - Tooltip [SURFACE.tooltip]
      - canvas [HEATMAP.canvas]

### src/modules/dashboard/components/TorrentDetails_Pieces_Map.tsx (component)

- div [SPLIT.contentStack]
  - div [SPLIT.mapStatsRow]
    - div [SPLIT.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [SPLIT.mapStatWarningCount]
    - div [SPLIT.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [SPLIT.mapStatDangerCount]
  - div [SPLIT.mapNote]
  - div [SPLIT.mapFrame]
    - div [SPLIT.mapFrameInner]
      - canvas [SPLIT.mapCanvasLayer]
      - canvas [SPLIT.mapCanvasOverlayLayer]
      - div [SPLIT.mapTooltip]
        - span [SPLIT.mapTooltipPrimaryLine, SPLIT.mapTooltipSecondaryLine]
      - div [SPLIT.mapHintWrap]
        - div [SPLIT.mapHintChip]
  - div [SPLIT.mapLegendRow]
    - span [SPLIT.mapLegendItem]
      - span [SPLIT.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]
    - span [SPLIT.mapLegendItem]
      - span [SPLIT.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]
    - span [SPLIT.mapLegendItem]
      - span [SPLIT.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]

### src/modules/dashboard/components/TorrentDetails_Pieces.tsx (component)

- PanelGroup [SPLIT.panelGroup]
  - Panel [SPLIT.panel]
    - GlassPanel [SPLIT.surfacePanel]
      - div [SPLIT.sectionHeader]
        - span [TEXT_ROLE.label]
        - span [SPLIT.sectionHeaderMeta]
      - div [SPLIT.surfacePanelBody]
        - div [SPLIT.surfacePanelFill]
  - PanelResizeHandle
    - div [SPLIT.resizeHandle]
      - div [SPLIT.resizeBar]
  - Panel [SPLIT.panel]
    - GlassPanel [SPLIT.surfacePanel]
      - div [SPLIT.sectionHeader]
        - span [TEXT_ROLE.label]
        - span [SPLIT.sectionHeaderCaption]

### src/modules/dashboard/components/TorrentDetails_Speed_Chart.tsx (component)

- div [METRIC_CHART.canvasWrap]
  - canvas [METRIC_CHART.canvas]
- div [METRIC_CHART.canvasWrap]
  - canvas [METRIC_CHART.canvas]
- div [METRIC_CHART.root]
  - div [METRIC_CHART.header]
    - div [METRIC_CHART.metrics]
      - span [METRIC_CHART.downMetric]
      - span [METRIC_CHART.upMetric]
    - div [METRIC_CHART.controls]
      - ButtonGroup [METRIC_CHART.layoutGroup]
        - ToolbarIconButton [METRIC_CHART.builder.layoutButtonClass]
        - ToolbarIconButton [METRIC_CHART.builder.layoutButtonClass]
      - div [METRIC_CHART.windowGroup]
        - Button [METRIC_CHART.builder.windowButtonClass]
  - div [METRIC_CHART.content]
    - Fragment
      - div [METRIC_CHART.panel]
        - span [METRIC_CHART.panelLabelWrap, TEXT_ROLE_EXTENDED.chartLabelSuccess]
        - SeriesChart [METRIC_CHART.panelSeries]
      - div [METRIC_CHART.panel]
        - span [METRIC_CHART.panelLabelWrap, TEXT_ROLE_EXTENDED.chartLabelPrimary]
        - SeriesChart [METRIC_CHART.panelSeries]
    - div [METRIC_CHART.panel]
      - CombinedChart [METRIC_CHART.panelSeries]

### src/modules/dashboard/components/TorrentDetails_Speed.tsx (component)

- Fragment
  - AlertPanel [DETAILS.speedCheckingAlert]
  - div [DETAILS.speedCollectingPanel]
  - div [DETAILS.speedChartHost]
- div [DETAILS.speedRoot]
  - GlassPanel [DETAILS.speedStandaloneSurface]
  - div [DETAILS.speedEmbeddedSurface]

### src/modules/dashboard/components/TorrentDetails_Trackers.tsx (component)

- p [DETAIL_TABLE.emptyText]
- GlassPanel [DETAIL_TABLE.emptyPanel]
- table [DETAIL_TABLE.table]
  - thead [SURFACE.chrome.sticky]
    - tr [DETAIL_TABLE.tableHeadRow]
      - th [DETAIL_TABLE.tableHeadCellIcon]
        - StatusIcon [DETAIL_TABLE.tableHeadIconMuted]
      - th [DETAIL_TABLE.tableHeadCell]
      - th [DETAIL_TABLE.tableHeadCell]
      - th [DETAIL_TABLE.tableHeadCell]
      - th [DETAIL_TABLE.tableHeadCellStatus]
  - tbody [DETAIL_TABLE.tableBody]
    - tr [DETAIL_TABLE.tableRow]
      - td [DETAIL_TABLE.cellIcon]
        - div [DETAIL_TABLE.builder.availabilityDotClass]
      - td [DETAIL_TABLE.cellHost]
      - td [DETAIL_TABLE.cellAnnounce]
        - div [DETAIL_TABLE.announceRow]
      - td [DETAIL_TABLE.cellPeers]
        - div [DETAIL_TABLE.peerRow]
      - td [DETAIL_TABLE.cellStatus]
        - span [DETAIL_TABLE.statusTone.pending]
        - span [DETAIL_TABLE.statusTone.online]
        - span [DETAIL_TABLE.statusTone.partial]
- div [DETAIL_TABLE.root]
  - div [DETAIL_TABLE.toolbar]
    - div [DETAIL_TABLE.toolbarGroup]
      - StatusIcon [DETAIL_TABLE.toolbarIconPrimary]
      - span [TEXT_ROLE.label]
    - div [DETAIL_TABLE.toolbarGroup]
  - div [DETAIL_TABLE.body]
    - GlassPanel [DETAIL_TABLE.panel]
      - div [DETAIL_TABLE.scroll]
    - div [DETAIL_TABLE.scroll]
    - GlassPanel [DETAIL_TABLE.overlay]
      - div [DETAIL_TABLE.overlayHeader]
        - span [DETAIL_TABLE.overlayTitle]
      - div [DETAIL_TABLE.overlayBody]
        - Textarea [DETAIL_TABLE.inputClassNames]
      - div [DETAIL_TABLE.overlayFooter]

### src/modules/dashboard/components/TorrentDetails.tsx (component)

- div [DETAILS.root, DETAILS.rootStandalone]
  - div [DETAILS.body]

### src/modules/dashboard/components/TorrentRecoveryModal.tsx (modal)

- Modal [MODAL.compactClassNames]
  - ModalContent
    - Fragment
      - ModalHeader [MODAL.dialogHeader]
        - div [MODAL.dialogHeaderLead]
          - div [MODAL.dialogHeaderIconWrap]
            - AlertTriangle [MODAL.dialogHeaderWarningIcon]
          - h2 [TEXT_ROLE_EXTENDED.modalTitle]
      - ModalBody [MODAL.dialogBody]
        - div [MODAL.dialogSectionStack]
          - p [TEXT_ROLE.bodyStrong]
          - p [TEXT_ROLE.bodySmall]
        - div [MODAL.dialogLocationRow]
          - HardDrive [MODAL.dialogLocationIcon]
          - span [MODAL.dialogLocationLabel]
        - div [TEXT_ROLE.caption]
        - div [MODAL.dialogOutcomePanel]
        - div [MODAL.dialogInsetPanel]
          - div [MODAL.dialogInsetStack]
            - p [MODAL.dialogInsetTitle]
            - p [TEXT_ROLE.bodySmall]
            - div [MODAL.dialogInsetStack]
              - div [MODAL.dialogInsetItem]
                - p [MODAL.dialogInsetLabel]
                - p [MODAL.dialogInsetDescription]
            - p [TEXT_ROLE.caption]
      - ModalFooter [MODAL.dialogFooter]
        - div [MODAL.dialogFooterGroup]
          - Button [MODAL.dialogSecondaryAction]
        - div [MODAL.dialogFooterGroup]
          - Button [MODAL.dialogSecondaryAction]
          - Button [MODAL.dialogPrimaryAction]

### src/modules/dashboard/components/TorrentTable_Body.tsx (component)

- div [TABLE.bodyScroll]
  - div [TABLE.loadingRoot]
    - div [TABLE.loadingRow]
      - div [TABLE.loadingSkeletonWrap]
        - Skeleton [TABLE.loadingSkeleton]
  - div [TABLE.emptyRoot]
    - div [TABLE.emptyHintRow]
      - StatusIcon [TABLE.emptyIcon]
    - p [TABLE.emptySubtext]
    - div [TABLE.emptyPreview]
      - div [TABLE.emptyHintRow]
        - span [TABLE.emptyBar]
      - div [TABLE.emptyPreviewRow]
        - span [TABLE.emptyBar]
        - span [TABLE.emptyBar]
        - span [TABLE.emptyBar]
  - div [TABLE.noResults]
  - DndContext
    - SortableContext
      - div [TABLE.bodyCanvas]
    - DragOverlay
      - div [TABLE.dragOverlay]
        - div [TABLE.dragOverlayContent]
  - div [TABLE.marquee]

### src/modules/dashboard/components/TorrentTable_ColumnDefs.tsx (component)

- div [TABLE.columnDefs.nameCell]
  - span [TABLE.columnDefs.nameLabel, TABLE.columnDefs.nameLabelPaused]
- div [TABLE.columnDefs.progressCell]
  - div [TABLE.columnDefs.progressMetricsRow]
    - span [TABLE.columnDefs.progressSecondary]
  - SmoothProgressBar [TABLE.columnDefs.progressBar]
- span [TABLE.columnDefs.numericMuted]
- span [TABLE.columnDefs.numericSoft]
- span [TABLE.columnDefs.numericSoft]
- div [TABLE.columnDefs.peersRow]
  - StatusIcon [TABLE.columnDefs.peersIcon]
  - span [TABLE.columnDefs.peersDivider]
  - span [TABLE.columnDefs.peersSeedCount]
- span [TABLE.columnDefs.numericDim]
- span [TABLE.columnDefs.numericMuted]
- span [TABLE.columnDefs.numericDim]

### src/modules/dashboard/components/TorrentTable_ColumnSettingsModal.tsx (modal)

- Modal [MODAL.baseClassNames]
  - ModalContent
    - Fragment
      - ModalBody
        - div [TABLE.columnSettingsRow]

### src/modules/dashboard/components/TorrentTable_EmptyState.tsx (component)

- div [TABLE.loadingRoot]
  - div [TABLE.loadingRow]
    - div [TABLE.loadingSkeletonWrap]
      - Skeleton [TABLE.loadingSkeleton]
- div [TABLE.emptyRoot]
  - div [TABLE.emptyHintRow]
    - StatusIcon [TABLE.emptyIcon]
  - p [TABLE.emptySubtext]
  - div [TABLE.emptyPreview]
    - div
      - span [TABLE.emptyBar]
    - div [TABLE.emptyPreviewRow]
      - span [TABLE.emptyBar]
      - span [TABLE.emptyBar]
      - span [TABLE.emptyBar]

### src/modules/dashboard/components/TorrentTable_Header.tsx (component)

- motion.div [TORRENT_HEADER.builder.cellClass]
  - div [TORRENT_HEADER.builder.activatorClass]
    - SortArrowIcon [TORRENT_HEADER.builder.sortIconClass]
  - div [TORRENT_HEADER.resizeHandle]
    - div [TORRENT_HEADER.builder.resizeBarClass]

### src/modules/dashboard/components/TorrentTable_HeaderMenu.tsx (component)

- AnimatePresence
  - Dropdown
    - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.minWidthSurface, SURFACE.menu.surface]
      - DropdownItem [SURFACE.menu.itemStrong]
      - DropdownItem [SURFACE.menu.itemStrong]
      - DropdownSection
        - DropdownItem [SURFACE.menu.itemNested, SURFACE.menu.itemPinned]

### src/modules/dashboard/components/TorrentTable_Headers.tsx (component)

- div [TABLE.headerPreviewPadding, TORRENT_HEADER.builder.cellClass]
- div
  - SortableContext
    - div [TABLE.headerGroupRow]

### src/modules/dashboard/components/TorrentTable_MissingFilesStatusCell.tsx (component)

- div [FORM_CONTROL.statusChipContainer]
  - Chip [FORM_CONTROL.statusChipClassNames]
    - div [FORM_CONTROL.statusChipContent]
      - AlertTriangle [FORM_CONTROL.statusChipWarningIcon]
- div [FORM_CONTROL.statusChipContainer]
  - button [TABLE.builder.missingFilesStatusTriggerClass]
    - Chip [FORM_CONTROL.statusChipClassNames]
      - div [FORM_CONTROL.statusChipContent]
        - AlertTriangle [FORM_CONTROL.statusChipWarningIcon]
        - span [FORM_CONTROL.statusChipLabel]

### src/modules/dashboard/components/TorrentTable_RowMenu.tsx (component)

- DropdownItem [CONTEXT_MENU.sectionHeading, SURFACE.menu.sectionHeading]
- DropdownItem [CONTEXT_MENU.sectionNestedItem]
- DropdownItem [CONTEXT_MENU.sectionHeadingStrong, SURFACE.menu.sectionHeading]
- DropdownItem [CONTEXT_MENU.editorItem]
  - div [CONTEXT_MENU.editorWrap]
- Dropdown
  - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.surface]

### src/modules/dashboard/components/TorrentTable_SpeedColumnCell.tsx (component)

- div [TABLE.speedCell.root]
  - svg [TABLE.speedCell.sparkline]
  - div [TABLE.speedCell.valueRow]
    - span [TABLE.speedCell.valueText]

### src/modules/dashboard/components/TorrentTable_StatusColumnCell.tsx (component)

- div [FORM_CONTROL.statusChipContainer]
  - Chip [FORM_CONTROL.statusChipClassNames]
    - div [FORM_CONTROL.statusChipContent]
      - StatusIcon [FORM_CONTROL.statusChipCurrentIcon]
      - span [FORM_CONTROL.statusChipLabel]

### src/modules/dashboard/components/TorrentTable.tsx (component)

- Fragment
  - div [TABLE.hostRoot, TABLE.workbenchShell, TABLE.workbenchSurface]

### src/modules/dashboard/hooks/useTorrentTableColumns.tsx (component)

- div [TABLE.columnHeaderLabel]
  - HeaderIcon [TABLE.columnHeaderPulseIcon]

### src/modules/settings/components/InterfaceTabContent.tsx (component)

- Fragment
  - SettingsSection
    - div [FORM.interfaceStack]
      - div [FORM.interfaceRow]
        - div [FORM.interfaceRowInfo]
          - p [FORM.interfaceRowTitle]
          - p [TEXT_ROLE.caption]
        - div [FORM.interfaceRowActions]
      - div [FORM.interfaceRow]
        - div [FORM.interfaceRowInfo]
          - p [FORM.interfaceRowTitle]
          - p [TEXT_ROLE.caption]
  - SettingsSection [FORM.sectionMarginTop]
    - div [FORM.switchRow]
      - span [FORM.systemRowLabel]
  - SettingsSection [FORM.sectionMarginTop]
    - div [FORM.languageRow]
      - div
        - span [FORM.interfaceRowTitle]
        - p [TEXT_ROLE.caption]
  - SettingsSection [FORM.sectionMarginTop]

### src/modules/settings/components/SettingsBlockRenderers.tsx (component)

- div [FORM.blockStackTight]
  - div [FORM.blockRowBetween]
    - Switch
      - span [FORM.switchSliderLabel]
    - div [FORM.sliderValueBadge, FORM.sliderValueText]
  - Slider [FORM.slider, FORM.sliderClassNames]
- div [FORM.switchBlock]
  - div [FORM.switchRow]
    - span [FORM.switchLabel]
  - p [TEXT_ROLE.caption]
- BufferedInput [FORM.builder.settingsBufferedInputClassNames]
- p [TEXT_ROLE.caption]
- div [FORM.inputGroup]
- div [FORM.inputActionGroup]
  - div [FORM.inputActionRow]
    - div [FORM.inputActionFill]
    - Button [FORM.inputActionButton]
- div [FORM.inputPairGrid]
- div [FORM.blockStackTight]
  - div [FORM.blockRowBetween]
    - span [TEXT_ROLE.labelDense]
  - div [FORM.daySelectorList]
    - Button [FORM.daySelectorButton, FORM.daySelectorSelected, FORM.daySelectorUnselected]
- Select [FORM.selectClassNames]
- div [FORM.buttonRow]
- div [FORM.languageRow]
  - div
    - span [FORM.interfaceRowTitle]
    - p [TEXT_ROLE.caption]
- div [FORM.blockStackTight]
  - div [FORM.rawConfigHeader]
    - div
      - span [FORM.rawConfigTitle]
      - p [FORM.rawConfigDescription]
  - div [FORM.rawConfigFeedback]
    - p [FORM.rawConfigStatusSuccess]
    - p [FORM.rawConfigStatusDanger]
  - div [FORM.rawConfigPanel]
    - textarea [FORM.rawConfigCode, FORM.rawConfigTextarea]
- Divider [FORM.divider]

### src/modules/settings/components/SettingsFormBuilder.tsx (component)

- Fragment
  - SettingsSection
    - div [FORM.sectionContentOffsetStack]

### src/modules/settings/components/SettingsModalView.tsx (view)

- div [MODAL.sidebar, MODAL.sidebarHidden, MODAL.sidebarVisible]
  - div [MODAL.sidebarHeader]
    - h2 [MODAL.headingFont, TEXT_ROLE.headingLarge]
    - Button [MODAL.sidebarCloseButton]
      - X [MODAL.iconMd]
  - div [MODAL.sidebarBody]
    - button [MODAL.tabButtonActive, MODAL.tabButtonBase, MODAL.tabButtonInactive]
      - tab.icon [MODAL.tabIcon, MODAL.tabIconActive, MODAL.tabIconInactive]
      - motion.div [MODAL.tabIndicator]
  - div [MODAL.versionWrapper]
    - div [MODAL.versionText]
- div [MODAL.header]
  - div [MODAL.headerLead]
    - Button [MODAL.headerMobileBack]
      - ChevronLeft [MODAL.iconMd]
    - div [MODAL.headerTitleWrap]
      - h1 [MODAL.headingFont, TEXT_ROLE.headingLarge]
      - span [MODAL.headerUnsaved]
  - ToolbarIconButton [MODAL.desktopClose]
- Section [MODAL.scrollContent]
  - AlertPanel [MODAL.alert]
  - AlertPanel [MODAL.alert]
  - AnimatePresence
    - motion.div [MODAL.contentStack]
      - AlertPanel [MODAL.inlineAlert]
      - SettingsFormProvider
        - SettingsSection
          - div [MODAL.connectionStack]
- div [MODAL.footer]
  - div [MODAL.footerConfirmContent]
    - div [MODAL.footerTextWrap]
      - span [MODAL.footerWarningTitle]
      - span [TEXT_ROLE.caption]
    - div [MODAL.footerActions]
- div [MODAL.footer]
  - Button [MODAL.footerResetButton]
  - div [MODAL.footerButtonRow]
    - Button [MODAL.footerSaveButton]
- Modal [MODAL.builder.settingsModalClassNames]
  - ModalContent [MODAL.contentWrapper]
    - div [MODAL.layout]
      - div [MODAL.mainPane]

### src/modules/settings/components/SettingsSection.tsx (component)

- Card [FORM.sectionCard]
  - h3 [FORM.sectionTitle]
  - p [FORM.sectionDescription]

### src/modules/settings/components/tabs/connection/ConnectionManager.tsx (component)

- div [FORM.connection.localRoot]
  - div [FORM.connection.localHeader]
    - div [FORM.connection.localHeaderInfo]
      - h3 [FORM.connection.profileTitle]
      - p [FORM.connection.profileEndpoint]
    - div [FORM.connection.localHeaderActions]
  - p [TEXT_ROLE.caption]
- div [FORM.connection.root]
  - div [FORM.connection.topRow]
    - div [FORM.connection.topRowInfo]
      - h3 [FORM.connection.profileTitle]
      - p [FORM.connection.profileEndpoint]
    - div [FORM.connection.topRowActions]
      - div [FORM.connection.statusRow]
        - CheckCircle [FORM.connection.iconSmall]
        - XCircle [FORM.connection.iconSmall]
        - div [FORM.connection.statusMeta]
          - p [TEXT_ROLE.label]
          - p [TEXT_ROLE.headingSection]
          - p [TEXT_ROLE.caption]
      - RefreshCw [FORM.connection.iconSmall]
  - div [FORM.connection.fieldsStack]
    - p [FORM.connection.offlineWarning]
    - p [FORM.connection.insecureAuthWarning]
    - div [FORM.connection.fieldsPairGrid]
      - Input [FORM.connection.inputHeight]
      - Input [FORM.connection.inputHeight]
    - Fragment
      - p [FORM.connection.detectingSignin]
      - div [FORM.connection.fieldsPairGrid]
    - p [FORM.connection.localModeHint]

### src/modules/settings/components/tabs/system/SystemTabContent.tsx (component)

- div [FORM.sectionCardEmphasized]
  - h3 [FORM.sectionTitle]
  - p [FORM.sectionDescription]
  - div [FORM.sectionContentStack]
- div [FORM.systemRow]
  - div [FORM.systemRowHeader]
    - span [FORM.systemRowLabel]
    - div [FORM.systemRowControl]
  - p [FORM.systemRowHelper]
- Chip [FORM.systemStatusChip]
- SettingsSection
  - div [FORM.systemNoticeStack]
    - p [FORM.systemNoticeBody]
    - p [TEXT_ROLE.caption]
- div [FORM.systemRootStack]

### src/modules/torrent-add/components/AddMagnetModal.tsx (modal)

- Modal [MODAL.baseClassNames]
  - ModalContent
    - Fragment
      - div [MODAL.header]
        - div [MODAL.headerLead]
          - StatusIcon [MODAL.headerLeadPrimaryIcon]
          - span [TEXT_ROLE.labelPrimary]
        - ToolbarIconButton [MODAL.desktopClose]
      - ModalBody [FORM.bodyStackPanel]
        - Textarea [INPUT.codeTextareaClassNames]
        - p [MODAL.hintText]
      - ModalFooter [MODAL.footerActionsPadded]

### src/modules/torrent-add/components/AddTorrentDestinationGatePanel.tsx (component)

- GlassPanel [FORM.workflow.gatePanel]
  - Tooltip
    - div [FORM.workflow.gatePromptRow]
      - HardDrive [FORM.workflow.gatePromptIcon]
  - div [FORM.workflow.destinationRow]
    - motion.div [FORM.workflow.destinationInputWrap]
      - Input [INPUT.monoEmphasized]
    - Tooltip
      - Button [SURFACE.atom.iconButton]
        - FolderOpen [FORM.workflow.actionIcon]
  - div [FORM.builder.statusToneClass, FORM.workflow.status]
    - AlertTriangle [FORM.workflow.statusIcon]
    - CheckCircle2 [FORM.workflow.statusSuccessIcon]
    - Info [FORM.workflow.statusInfoIcon]
    - span [FORM.workflow.statusMessage]
  - div [FORM.workflow.gateActionsRow]
    - Button [FORM.workflow.gateConfirmButton]

### src/modules/torrent-add/components/AddTorrentFileTable.tsx (component)

- div [MODAL.workflow.fileTableShell]

### src/modules/torrent-add/components/AddTorrentModal.tsx (modal)

- Modal [MODAL.builder.addTorrentModalClassNames]
  - ModalContent
    - AddTorrentModalContextProvider
      - div [MODAL.workflow.gateRoot]
        - ModalHeader [MODAL.workflow.header]
          - div [MODAL.workflow.titleStack]
            - h2 [TEXT_ROLE_EXTENDED.modalTitle]
            - span [MODAL.workflow.sourceLabelCaption]
          - ToolbarIconButton [MODAL.workflow.headerIconButton]
        - ModalBody [MODAL.workflow.gateBody]
          - div [MODAL.workflow.gateContent]
      - form [MODAL.workflow.formRoot]
        - div [MODAL.workflow.submitOverlay]
          - Fragment
            - p [TEXT_ROLE.codeCaption]
            - p [MODAL.workflow]
          - Fragment
            - StatusIcon [MODAL.workflow.warningTone]
            - p [MODAL.workflow]
            - p [MODAL.workflow]
            - div [MODAL.workflow.submitActions]
        - ModalHeader [MODAL.workflow.header]
          - div [MODAL.workflow.titleStack]
            - h2 [TEXT_ROLE_EXTENDED.modalTitle]
            - span [MODAL.workflow.sourceMutedLabel]
          - div [MODAL.workflow.headerActions]
            - Chip [MODAL.workflow]
            - div [MODAL.workflow.headerDivider]
            - Tooltip
              - ToolbarIconButton [MODAL.workflow.headerIconButton]
            - ToolbarIconButton [MODAL.workflow.headerIconButton]
        - ModalBody [MODAL.workflow.body]
          - div [MODAL.workflow.dropOverlay]
            - div [MODAL.workflow.dropOverlayChip]
              - FolderOpen [MODAL.workflow.iconLgPrimary]
              - span [TEXT_ROLE.heading]
          - LayoutGroup
            - motion.div [MODAL.builder.bodyPanelsClass]
              - PanelGroup [MODAL.workflow.panelGroup]
                - Panel [MODAL.builder.settingsPanelClass]
                - PanelResizeHandle [MODAL.builder.paneHandleClass]
                  - div [MODAL.workflow]
                    - div [MODAL.builder.resizeHandleBarClass]
                - Panel [MODAL.workflow.filePanel]
                  - div [MODAL.workflow]
                    - div [MODAL.workflow]
                      - div [MODAL.workflow]
        - ModalFooter [MODAL.workflow.footer]
          - div [MODAL.workflow.footerAlerts]
            - AlertPanel [MODAL.workflow.footerAlert]
              - AlertTriangle [MODAL.workflow.iconAlert]
              - span [MODAL.workflow]
            - AlertPanel [MODAL.workflow.footerAlert]
              - AlertTriangle [MODAL.workflow.iconAlert]
              - span [MODAL.workflow]
            - AlertPanel [MODAL.workflow.footerInfoAlert]
              - AlertTriangle [MODAL.workflow]
              - span [MODAL.workflow]
          - div [MODAL.workflow.footerActionsStack]
            - div [MODAL.workflow.footerActionsRow]
              - Tooltip
                - div [MODAL.workflow]
                  - Button [MODAL.workflow]
              - div [MODAL.workflow.inlineBlock]
                - Button [MODAL.workflow]
              - ButtonGroup
                - Button [MODAL.workflow.primaryButton]
                - Dropdown
                  - DropdownTrigger
                    - Button
                      - ChevronDown [MODAL.workflow]

### src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx (component)

- div [FORM.workflow.root]
  - div [FORM.workflow.group]
    - div [FORM.switchBlock]
      - Tooltip
        - label [FORM.workflow.label]
          - HardDrive [FORM.workflow.labelIcon]
    - div [FORM.workflow.destinationRow]
      - motion.div [FORM.workflow.destinationInputWrap]
        - Input [INPUT.mono]
      - Tooltip
        - Button [SURFACE.atom.iconButton]
          - FolderOpen [FORM.workflow.actionIcon]
      - Dropdown
        - DropdownTrigger
          - Button [SURFACE.atom.iconButton]
            - ChevronDown [FORM.workflow.actionIcon]
        - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.surface]
          - HardDrive [FORM.workflow.labelIcon]
    - div [FORM.builder.statusToneClass, FORM.workflow.status]
      - AlertTriangle [FORM.workflow.statusIcon]
      - CheckCircle2 [FORM.workflow.statusSuccessIcon]
      - Info [FORM.workflow.statusInfoIcon]
      - Tooltip
        - span [FORM.workflow.statusMessage]
      - span [FORM.workflow.statusMessage]
  - Fragment
    - Divider [FORM.workflow.flagsDivider]
    - div [FORM.workflow.flagsGroup]
      - label [FORM.workflow.label]
        - Hash [FORM.workflow.labelIcon]
      - div [FORM.workflow.flagsCheckboxes]
        - Checkbox [FORM_CONTROL.checkboxLabelBodySmallClassNames]
          - span [FORM.workflow.flagsItemLabel]
            - ListOrdered [FORM.workflow.flagsIcon]
        - Divider [FORM.workflow.flagsItemDivider]
        - Checkbox [FORM_CONTROL.checkboxLabelBodySmallClassNames]
          - span [FORM.workflow.flagsItemLabel]
            - CheckCircle2 [FORM.workflow.flagsIcon]

### src/modules/torrent-remove/components/RemoveConfirmationModal.tsx (modal)

- Modal [MODAL.compactClassNames]
  - ModalContent
    - ModalHeader [MODAL.headerPassive]
    - ModalBody
      - div [FORM.stackTools]
        - Checkbox [FORM_CONTROL.checkboxLabelBodySmallClassNames]
    - ModalFooter [MODAL.footerEnd]

### src/shared/ui/components/SmoothProgressBar.tsx (component)

- div [METRIC_CHART.progressBar.track]
  - div [METRIC_CHART.progressBar.indicator]

### src/shared/ui/components/TinyTorrentIcon.tsx (component)

- img [SURFACE.atom.objectContain]

### src/shared/ui/controls/LanguageMenu.tsx (component)

- Globe [SURFACE.atom.textCurrent]
- Dropdown
  - DropdownMenu [SURFACE.menu.dirPickerSurface]
    - DropdownItem [SURFACE.menu.itemSelectedPrimary]

### src/shared/ui/graphs/NetworkGraph.tsx (component)

- svg
  - line [METRIC_CHART.baselineMuted]
  - line [METRIC_CHART.baselineActive]
  - motion.path [METRIC_CHART.areaMuted]

### src/shared/ui/layout/toolbar-button.tsx (component)

- Icon [SURFACE.atom.textCurrent]
- span [SURFACE.atom.textCurrent]

### src/shared/ui/layout/window-control-button.tsx (component)

- Button
  - Icon [SURFACE.atom.textCurrent]

### src/shared/ui/workspace/DiskSpaceGauge.tsx (component)

- div
  - div [METRIC_CHART.capacityGauge.header]
    - span [METRIC_CHART.capacityGauge.path]
  - div [METRIC_CHART.capacityGauge.progressWrap]
  - div [METRIC_CHART.capacityGauge.stats]
  - p [METRIC_CHART.capacityGauge.hint]
  - p [METRIC_CHART.capacityGauge.hint]
  - div [METRIC_CHART.capacityGauge.errorRow]
    - p [TEXT_ROLE.statusError]

### src/shared/ui/workspace/FileExplorerTree.tsx (component)

- GlassPanel [FILE_BROWSER.container]
  - div [FILE_BROWSER.toolbar]
    - Input [FILE_BROWSER.searchInputClassNames]
    - Dropdown
      - DropdownTrigger
        - Button [FILE_BROWSER.filterButton]
          - Filter [FILE_BROWSER.filterIcon]
      - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.surface]
    - div [FILE_BROWSER.toolsDivider]
    - ButtonGroup
      - Button [FILE_BROWSER.expandButton]
        - ArrowDown [FILE_BROWSER.iconSmall]
      - Button [FILE_BROWSER.expandButton]
        - ArrowUp [FILE_BROWSER.iconSmall]
    - div [FILE_BROWSER.toolbarSpacer]
    - div [FILE_BROWSER.builder.selectionActionsClass]
      - span [FILE_BROWSER.selectionActionsLabel]
      - Dropdown
        - DropdownTrigger
          - Button [FILE_BROWSER.priorityButton]
        - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.surface]
          - DropdownItem [FILE_BROWSER.priorityMenuDangerItem]
  - div [FILE_BROWSER.headerRow, TEXT_ROLE_EXTENDED.fileTreeHeader]
    - div [FILE_BROWSER.headerCheckboxWrap]
      - Checkbox [FORM_CONTROL.checkboxPrimaryClassNames]
    - div [FILE_BROWSER.headerPriority]
    - div [FILE_BROWSER.headerProgress]
    - div [FILE_BROWSER.headerSize]
  - div [FILE_BROWSER.scroll]
    - div [FILE_BROWSER.virtualCanvas]
      - div [FILE_BROWSER.virtualRow]
    - div [FILE_BROWSER.emptyOverlay]
      - Search [FILE_BROWSER.emptyIcon]
      - p [FILE_BROWSER.emptyText]

### src/shared/ui/workspace/FileExplorerTreeRow.tsx (component)

- FileVideo [FILE_BROWSER.iconVideo]
- FileAudio [FILE_BROWSER.iconAudio]
- FileImage [FILE_BROWSER.iconImage]
- FileText [FILE_BROWSER.iconText]
- FileIcon [FILE_BROWSER.iconDefault]
- div [FILE_BROWSER.row, FILE_BROWSER.rowDimmed]
  - div [FILE_BROWSER.rowCheckboxWrap]
    - Checkbox [FORM_CONTROL.checkboxPrimaryClassNames]
  - div [FILE_BROWSER.rowNameCell]
    - button [FILE_BROWSER.chevronButton]
      - ChevronDown [FILE_BROWSER.iconSmall]
      - ChevronRight [FILE_BROWSER.iconSmall]
    - div [FILE_BROWSER.rowIndentSpacer]
    - div [FILE_BROWSER.rowIconWrap]
      - Folder [FILE_BROWSER.rowFolderIcon]
    - span [FILE_BROWSER.rowNameBase, FILE_BROWSER.rowNameFile, FILE_BROWSER.rowNameFolder]
  - div [FILE_BROWSER.rowPriorityWrap]
    - Dropdown
      - DropdownTrigger
        - Chip [FILE_BROWSER.priorityChip, FORM_CONTROL.priorityChipClassNames]
      - DropdownMenu [SURFACE.menu.listClassNames, SURFACE.menu.surface]
        - ArrowUp [FILE_BROWSER.priorityMenuHighIcon]
        - Minus [FILE_BROWSER.priorityMenuNormalIcon]
        - ArrowDown [FILE_BROWSER.priorityMenuLowIcon]
        - DropdownItem [FILE_BROWSER.priorityMenuDangerItem]
  - div [FILE_BROWSER.rowProgressWrap]
    - Progress [FILE_BROWSER.progressClassNames]
  - div [FILE_BROWSER.rowSizeText]


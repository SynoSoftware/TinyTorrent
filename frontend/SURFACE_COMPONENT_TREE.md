# Surface Component Tree

Generated: 2026-02-13

Scope: all TSX importers of glass-surface.ts

Files analyzed: 51

## Common Token Usage

- TEXT_ROLE.caption: 24
- TEXT_ROLE.bodySmall: 13
- TEXT_ROLE.label: 10
- TABLE_VIEW_CLASS.emptyBar: 8
- STANDARD_SURFACE_CLASS.menu.listClassNames: 6
- STANDARD_SURFACE_CLASS.menu.surface: 6
- TEXT_ROLE.body: 5
- SPLIT_VIEW_CLASS.mapStatColumn: 5
- APP_MODAL_CLASS.workflow.iconMd: 5
- DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell: 4
- DIAGNOSTIC_VIEW_CLASS.verifyCell: 4
- FORM_UI_CLASS.interfaceRowTitle: 4
- FILE_BROWSER_CLASS.iconSmall: 4
- DIAGNOSTIC_VIEW_CLASS.stepHeader: 3
- DIAGNOSTIC_VIEW_CLASS.stack: 3
- DIAGNOSTIC_VIEW_CLASS.topbar: 3
- APP_NAV_CLASS.tabTitle: 3
- APP_NAV_CLASS.tabIcon: 3
- APP_NAV_CLASS.tabLabel: 3
- APP_STATUS_CLASS.iconCurrent: 3
- TEXT_ROLE.labelPrimary: 3
- DETAIL_VIEW_CLASS.generalButtonIcon: 3
- STANDARD_SURFACE_CLASS.tooltip: 3
- TEXT_ROLE.code: 3
- SPLIT_VIEW_CLASS.mapLegendItem: 3
- SPLIT_VIEW_CLASS.mapLegendSwatch: 3
- TEXT_ROLE.bodyMuted: 3
- METRIC_CHART_CLASS.panel: 3
- METRIC_CHART_CLASS.panelSeries: 3
- DETAIL_TABLE_CLASS.tableHeadCell: 3
- TEXT_ROLE_EXTENDED.modalTitle: 3
- TABLE_VIEW_CLASS.emptyHintRow: 3
- FORM_CONTROL_CLASS.statusChipContainer: 3
- FORM_CONTROL_CLASS.statusChipClassNames: 3
- FORM_CONTROL_CLASS.statusChipContent: 3
- FORM_UI_CLASS.sectionMarginTop: 3
- FORM_UI_CLASS.blockStackTight: 3
- FORM_UI_CLASS.connection.iconSmall: 3
- STANDARD_SURFACE_CLASS.atom.iconButton: 3
- FORM_UI_CLASS.workflow.actionIcon: 3

## Common Element + Token Patterns

- div > div > div > span :: TEXT_ROLE.label: 6
- div > div > div :: SPLIT_VIEW_CLASS.mapStatColumn: 5
- Section > div > div > div > GlassPanel > div > div > div > table > thead > tr > th :: DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell: 4
- Section > div > div > div > GlassPanel > div > div > div > table > tbody > tr > td :: DIAGNOSTIC_VIEW_CLASS.verifyCell: 4
- div > div > div > div > span :: TABLE_VIEW_CLASS.emptyBar: 4
- div > div > div > span :: TABLE_VIEW_CLASS.emptyBar: 4
- Section > div > div > div > GlassPanel > div > div > p :: TEXT_ROLE.bodySmall: 3
- header > div > div > div > div > Tabs > div :: APP_NAV_CLASS.tabTitle: 3
- header > div > div > div > div > Tabs > div > StatusIcon :: APP_NAV_CLASS.tabIcon: 3
- header > div > div > div > div > Tabs > div > span :: APP_NAV_CLASS.tabLabel: 3
- div > div > div > span :: TEXT_ROLE.code: 3
- div > div > span :: SPLIT_VIEW_CLASS.mapLegendItem: 3
- div > div > span > span :: SPLIT_VIEW_CLASS.mapLegendSwatch: 3
- div > div > span > span :: TEXT_ROLE.bodyMuted: 3
- table > thead > tr > th :: DETAIL_TABLE_CLASS.tableHeadCell: 3
- div :: FORM_CONTROL_CLASS.statusChipContainer: 3
- Fragment > SettingsSection :: FORM_UI_CLASS.sectionMarginTop: 3
- div :: FORM_UI_CLASS.blockStackTight: 3
- Modal > ModalContent > AddTorrentModalContextProvider > form > ModalFooter > div > AlertPanel > span :: APP_MODAL_CLASS.workflow.footerAlertText: 3
- Section > div > div > GlassPanel > div > DevWorkflowStep > div :: DIAGNOSTIC_VIEW_CLASS.optionsStack: 2
- Section > div > div > div > GlassPanel > div > div > div :: DIAGNOSTIC_VIEW_CLASS.topbar: 2
- Section > div > div > div > GlassPanel > div > div > div > table > tbody > tr > td :: TEXT_ROLE_EXTENDED.tableCell: 2
- Section > div > div > div > GlassPanel > div > div > div > div > div > div :: DIAGNOSTIC_VIEW_CLASS.systemStatusPair: 2
- Section > div > div > div > div > span :: TEXT_ROLE.bodySmall: 2
- Section > div > div > div > div > span :: TEXT_ROLE.caption: 2
- header > div > div :: APP_NAV_CLASS.workbenchShell: 2
- header > div > div > div > div :: APP_NAV_CLASS.selectionSeparator: 2
- footer > div > div > div > div > div > div :: APP_STATUS_CLASS.speedCompactColumn: 2
- footer > div > div > div > div > div > div > span :: APP_STATUS_CLASS.srOnly: 2
- footer > div > div > div > div > div > div > span :: APP_STATUS_CLASS.speedCompactValue: 2
- div :: TABLE_VIEW_CLASS.detailsContentRoot: 2
- div > GlassPanel > div > div > div :: TEXT_ROLE.caption: 2
- div > PanelGroup > Panel > GlassPanel > div > span :: SPLIT_VIEW_CLASS.headerSpeedCol: 2
- div > PanelGroup > Panel > GlassPanel > div > div > button :: CONTEXT_MENU_CLASS.actionButton: 2
- PanelGroup > Panel :: SPLIT_VIEW_CLASS.panel: 2
- PanelGroup > Panel > GlassPanel :: SPLIT_VIEW_CLASS.surfacePanel: 2
- PanelGroup > Panel > GlassPanel > div :: SPLIT_VIEW_CLASS.sectionHeader: 2
- PanelGroup > Panel > GlassPanel > div > span :: TEXT_ROLE.label: 2
- motion.div > div > div > span :: HEATMAP_VIEW_CLASS.legendItem: 2
- motion.div > div > div > span > span :: HEATMAP_VIEW_CLASS.legendDot: 2

## Component Trees

### src/app/components/CommandPalette.tsx (component)

- motion.div [COMMAND_PALETTE_CLASS.overlay]
  - motion.div [COMMAND_PALETTE_CLASS.backdrop]
  - Section [COMMAND_PALETTE_CLASS.section]
    - motion.div [COMMAND_PALETTE_CLASS.panel]
      - Command
        - Command.Input [COMMAND_PALETTE_CLASS.input]
        - Command.List [COMMAND_PALETTE_CLASS.list]
          - div [COMMAND_PALETTE_CLASS.groupWrap]
            - div [TEXT_ROLE_EXTENDED.commandSection]
            - Command.Group
              - Command.Item [COMMAND_PALETTE_CLASS.item]
                - div [COMMAND_PALETTE_CLASS.itemRow]
                  - div [COMMAND_PALETTE_CLASS.shortcutWrap]
                    - span [COMMAND_PALETTE_CLASS.shortcutKey]
                - p [COMMAND_PALETTE_CLASS.description]
          - Command.Empty [COMMAND_PALETTE_CLASS.empty]
        - div [COMMAND_PALETTE_CLASS.outcome]

### src/app/components/DevTest.tsx (component)

- div [DIAGNOSTIC_VIEW_CLASS.stepCard]
  - div [DIAGNOSTIC_VIEW_CLASS.stepHeader]
- Chip [DIAGNOSTIC_VIEW_CLASS.statusChipClassNames]
- Section [DIAGNOSTIC_VIEW_CLASS.root]
  - div [DIAGNOSTIC_VIEW_CLASS.stack]
    - div [DIAGNOSTIC_VIEW_CLASS.topbar]
      - div [DIAGNOSTIC_VIEW_CLASS.topbarText]
        - h1 [TEXT_ROLE.heading]
        - p [TEXT_ROLE.bodySmall]
    - div [DIAGNOSTIC_VIEW_CLASS.grid]
      - GlassPanel [DIAGNOSTIC_VIEW_CLASS.panelPrimary]
        - div [DIAGNOSTIC_VIEW_CLASS.stack]
          - div [DIAGNOSTIC_VIEW_CLASS.stepHeader]
            - h2 [DIAGNOSTIC_VIEW_CLASS.sectionTitle]
          - DevWorkflowStep
            - div [DIAGNOSTIC_VIEW_CLASS.optionsStack]
              - Button [DIAGNOSTIC_VIEW_CLASS.optionButtonFull]
                - span [TEXT_ROLE.body]
          - DevWorkflowStep
            - div [DIAGNOSTIC_VIEW_CLASS.optionsWrap]
          - DevWorkflowStep
            - div [DIAGNOSTIC_VIEW_CLASS.optionsStack]
              - div [DIAGNOSTIC_VIEW_CLASS.optionsGridResponsive]
                - Button [DIAGNOSTIC_VIEW_CLASS.optionButtonLeft]
                  - span [DIAGNOSTIC_VIEW_CLASS.optionLabelStrong, TEXT_ROLE.body]
          - DevWorkflowStep
            - div [DIAGNOSTIC_VIEW_CLASS.executeRow]
              - div [DIAGNOSTIC_VIEW_CLASS.executeActions]
            - div [DIAGNOSTIC_VIEW_CLASS.stateRow, TEXT_ROLE.bodySmall]
              - span [DIAGNOSTIC_VIEW_CLASS.statePill]
                - span [DIAGNOSTIC_VIEW_CLASS.statePillValue]
      - div [DIAGNOSTIC_VIEW_CLASS.panelSecondaryWrap]
        - GlassPanel [DIAGNOSTIC_VIEW_CLASS.panelSecondary]
          - div [DIAGNOSTIC_VIEW_CLASS.stack]
            - div [DIAGNOSTIC_VIEW_CLASS.stepHeader]
              - h2 [DIAGNOSTIC_VIEW_CLASS.sectionTitle]
            - div [DIAGNOSTIC_VIEW_CLASS.smokeCard]
              - div [DIAGNOSTIC_VIEW_CLASS.topbar]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC_VIEW_CLASS.smokeRows]
                - div [DIAGNOSTIC_VIEW_CLASS.smokeRow]
                  - span [TEXT_ROLE.body]
            - div [DIAGNOSTIC_VIEW_CLASS.verifyCard]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC_VIEW_CLASS.verifyTableWrap]
                - table [DIAGNOSTIC_VIEW_CLASS.verifyTable]
                  - thead [DIAGNOSTIC_VIEW_CLASS.verifyHead]
                    - tr [DIAGNOSTIC_VIEW_CLASS.verifyHeadRow]
                      - th [DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell]
                      - th [DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell]
                      - th [DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell]
                      - th [DIAGNOSTIC_VIEW_CLASS.verifyHeaderCell]
                  - tbody
                    - tr [DIAGNOSTIC_VIEW_CLASS.verifyRow]
                      - td [DIAGNOSTIC_VIEW_CLASS.verifyCell]
                        - div [DIAGNOSTIC_VIEW_CLASS.verifyLabelWrap]
                          - span [TEXT_ROLE.body]
                          - span [TEXT_ROLE.caption]
                      - td [DIAGNOSTIC_VIEW_CLASS.verifyCell, TEXT_ROLE_EXTENDED.tableCell]
                      - td [DIAGNOSTIC_VIEW_CLASS.verifyCell, TEXT_ROLE_EXTENDED.tableCell]
                      - td [DIAGNOSTIC_VIEW_CLASS.verifyCell]
            - div [DIAGNOSTIC_VIEW_CLASS.systemCard]
              - div [DIAGNOSTIC_VIEW_CLASS.topbar]
              - p [TEXT_ROLE.bodySmall]
              - div [DIAGNOSTIC_VIEW_CLASS.systemRows]
                - div [DIAGNOSTIC_VIEW_CLASS.systemRowCard]
                  - div [DIAGNOSTIC_VIEW_CLASS.systemRowHead]
                    - span [DIAGNOSTIC_VIEW_CLASS.optionLabelStrong, TEXT_ROLE.body]
                    - span [TEXT_ROLE.caption]
                  - div [DIAGNOSTIC_VIEW_CLASS.systemStatusRow]
                    - div [DIAGNOSTIC_VIEW_CLASS.systemStatusPair]
                    - div [DIAGNOSTIC_VIEW_CLASS.systemStatusPair]
                  - div [DIAGNOSTIC_VIEW_CLASS.systemMeta, TEXT_ROLE.bodySmall]
                  - span [TEXT_ROLE.caption]
  - div [DIAGNOSTIC_VIEW_CLASS.footer]
    - div [DIAGNOSTIC_VIEW_CLASS.footerStack]
      - div [DIAGNOSTIC_VIEW_CLASS.footerRow]
        - div [DIAGNOSTIC_VIEW_CLASS.footerLeft]
          - span [DIAGNOSTIC_VIEW_CLASS.footerScenarioLabel, TEXT_ROLE.bodySmall]
          - span [DIAGNOSTIC_VIEW_CLASS.footerScenario, TEXT_ROLE.bodySmall]
          - span [DIAGNOSTIC_VIEW_CLASS.footerSummary, DIAGNOSTIC_VIEW_CLASS.footerSummaryMuted, TEXT_ROLE.caption]
        - div [DIAGNOSTIC_VIEW_CLASS.footerRight]
          - span [TEXT_ROLE.caption]
      - pre [DIAGNOSTIC_VIEW_CLASS.footerExpected, DIAGNOSTIC_VIEW_CLASS.footerExpectedTone, TEXT_ROLE.codeMuted]

### src/app/components/layout/Navbar.tsx (layout)

- header [APP_NAV_CLASS.root, APP_NAV_CLASS.workbenchSurface]
  - div [APP_NAV_CLASS.titlebar]
    - div [APP_NAV_CLASS.main, APP_NAV_CLASS.workbenchShell]
      - div [APP_NAV_CLASS.left]
        - div [APP_NAV_CLASS.brandGroup]
          - div [APP_NAV_CLASS.brandIconWrap]
          - div [APP_NAV_CLASS.brandTextWrap]
            - span [APP_NAV_CLASS.brandName]
            - span [APP_NAV_CLASS.brandVersion]
        - div [APP_NAV_CLASS.primarySeparator]
        - div [APP_NAV_CLASS.tabsWrap]
          - Tabs [APP_NAV_CLASS.filterTabsClassNames]
            - div [APP_NAV_CLASS.tabTitle]
              - StatusIcon [APP_NAV_CLASS.tabIcon]
              - span [APP_NAV_CLASS.tabLabel]
            - div [APP_NAV_CLASS.tabTitle]
              - StatusIcon [APP_NAV_CLASS.tabIcon]
              - span [APP_NAV_CLASS.tabLabel]
            - div [APP_NAV_CLASS.tabTitle]
              - StatusIcon [APP_NAV_CLASS.tabIcon]
              - span [APP_NAV_CLASS.tabLabel]
        - div [APP_NAV_CLASS.searchWrap]
          - Input [APP_NAV_CLASS.searchInputClassNames]
      - div [APP_NAV_CLASS.actions]
        - div [APP_NAV_CLASS.primaryActions]
          - ToolbarIconButton [APP_NAV_CLASS.primaryActionEmphasis]
        - div [APP_NAV_CLASS.selectionSeparator]
        - div
          - ToolbarIconButton [APP_NAV_CLASS.selectionPauseEmphasis]
          - div [APP_NAV_CLASS.selectionExtraActions]
            - ToolbarIconButton [APP_NAV_CLASS.selectionRecheckEmphasis]
        - div [APP_NAV_CLASS.selectionSeparator]
        - ToolbarIconButton [APP_NAV_CLASS.ghostAction, APP_NAV_CLASS.ghostActionOverflow]
        - div [APP_NAV_CLASS.themeMobileWrap]
          - ToolbarIconButton [APP_NAV_CLASS.ghostAction, APP_NAV_CLASS.ghostActionOverflow]
      - div [APP_NAV_CLASS.rehashWrap]
        - div [APP_NAV_CLASS.rehashTooltipWrap]
          - div [APP_NAV_CLASS.rehashTooltip]
    - div [APP_NAV_CLASS.windowControls, APP_NAV_CLASS.workbenchShell]

### src/app/components/layout/StatusBar.tsx (layout)

- div [APP_STATUS_CLASS.statGroup, APP_STATUS_CLASS.statGroupEnd, APP_STATUS_CLASS.statGroupStart]
  - span [TEXT_ROLE_EXTENDED.statusBarLabel]
  - div [APP_STATUS_CLASS.statValueRow]
    - span [APP_STATUS_CLASS.statValueText]
    - StatusIcon [APP_STATUS_CLASS.statIcon]
- span [APP_STATUS_CLASS.telemetryIconWrap]
  - StatusIcon [APP_STATUS_CLASS.iconCurrent]
- Fragment
  - div [APP_STATUS_CLASS.speedModule]
    - div [APP_STATUS_CLASS.speedModuleGraphWrap]
      - div [APP_STATUS_CLASS.speedModuleGraph]
        - NetworkGraph [APP_STATUS_CLASS.speedModuleGraphCanvas]
        - div [APP_STATUS_CLASS.speedModuleOverlay]
          - div [APP_STATUS_CLASS.speedModuleOverlayRow]
            - div [APP_STATUS_CLASS.speedModuleIconWrap]
              - StatusIcon [APP_STATUS_CLASS.iconCurrent]
            - div [APP_STATUS_CLASS.speedModuleTextWrap]
              - span [APP_STATUS_CLASS.speedModuleLabel]
              - span [APP_STATUS_CLASS.speedModuleValue]
  - div [APP_STATUS_CLASS.speedSeparator]
- div [APP_STATUS_CLASS.telemetryGrid]
- StatusIcon [APP_STATUS_CLASS.iconMuted]
- StatusIcon [APP_STATUS_CLASS.iconCurrent]
- button [APP_STATUS_CLASS.engineButton]
  - span [APP_STATUS_CLASS.engineConnectedWrap]
    - motion.span [APP_STATUS_CLASS.engineConnectedPulse]
    - span [APP_STATUS_CLASS.engineConnectedDot]
- footer [APP_STATUS_CLASS.footer, APP_STATUS_CLASS.workbenchSurface]
  - div [APP_STATUS_CLASS.main]
    - StatGroup [APP_STATUS_CLASS.statGroupDesktop]
    - div [APP_STATUS_CLASS.speedFull]
    - div [APP_STATUS_CLASS.speedCompact]
      - div [APP_STATUS_CLASS.speedCompactGraphWrap]
        - div [APP_STATUS_CLASS.speedCompactLayer]
          - div [APP_STATUS_CLASS.speedCompactLayer]
            - NetworkGraph [APP_STATUS_CLASS.speedCompactDownGraph]
          - div [APP_STATUS_CLASS.speedCompactUpLayer]
            - NetworkGraph [APP_STATUS_CLASS.speedCompactUpGraph]
        - div [APP_STATUS_CLASS.speedCompactOverlay]
          - div [APP_STATUS_CLASS.speedCompactOverlayRow]
            - div [APP_STATUS_CLASS.speedCompactColumn]
              - ArrowDown [APP_STATUS_CLASS.speedCompactDownIcon]
              - span [APP_STATUS_CLASS.srOnly]
              - span [APP_STATUS_CLASS.speedCompactValue]
            - div [APP_STATUS_CLASS.speedCompactDivider]
            - div [APP_STATUS_CLASS.speedCompactColumn]
              - ArrowUp [APP_STATUS_CLASS.speedCompactUpIcon]
              - span [APP_STATUS_CLASS.srOnly]
              - span [APP_STATUS_CLASS.speedCompactValue]
    - div [APP_STATUS_CLASS.right]

### src/app/components/WorkspaceShell.tsx (shell)

- div [WORKBENCH_CLASS.root]
  - div [WORKBENCH_CLASS.immersiveBackgroundRoot]
    - div [WORKBENCH_CLASS.immersiveBackgroundBase]
    - div [WORKBENCH_CLASS.immersiveBackgroundPrimaryBlend]
    - div [WORKBENCH_CLASS.immersiveBackgroundSecondaryBlend]
    - div [WORKBENCH_CLASS.immersiveBackgroundNoise]
    - div [WORKBENCH_CLASS.immersiveBackgroundAccentBottom]
    - div [WORKBENCH_CLASS.immersiveBackgroundAccentTop]
  - AnimatePresence
    - motion.div [WORKBENCH_CLASS.reconnectToast]
  - div [WORKBENCH_CLASS.content]
    - Section [WORKBENCH_CLASS.nativeShellBody, WORKBENCH_CLASS.section, WORKBENCH_CLASS.sectionGapClassic, WORKBENCH_CLASS.sectionGapImmersive]
      - div [WORKBENCH_CLASS.immersiveNavbarWrap]
      - Fragment
        - div [WORKBENCH_CLASS.immersiveMainWrap, WORKBENCH_CLASS.nativeShellInner]
          - main [WORKBENCH_CLASS.immersiveMain, WORKBENCH_CLASS.nativeShellMain]
        - section [WORKBENCH_CLASS.immersiveHudSection]
          - AnimatePresence
            - motion.div [WORKBENCH_CLASS.immersiveHudCard]
              - button [WORKBENCH_CLASS.immersiveHudDismissButton]
                - StatusIcon [WORKBENCH_CLASS.iconCurrent]
              - div [WORKBENCH_CLASS.immersiveHudCardContent]
                - div [WORKBENCH_CLASS.immersiveHudIconWrap]
                  - StatusIcon [WORKBENCH_CLASS.iconCurrent]
                - div [WORKBENCH_CLASS.immersiveHudTextWrap]
                  - p [TEXT_ROLE.caption]
                  - p [WORKBENCH_CLASS.immersiveHudTextLabel]
                  - p [WORKBENCH_CLASS.immersiveHudTextDescription]
        - div [WORKBENCH_CLASS.immersiveStatusWrap]
      - div [WORKBENCH_CLASS.classicStack]
        - div [WORKBENCH_CLASS.classicMainWrap]
        - div [WORKBENCH_CLASS.classicStatusWrap]

### src/modules/dashboard/components/Dashboard_Layout.tsx (layout)

- AnimatePresence
  - motion.div [DASHBOARD_LAYOUT_CLASS.dropOverlay]
    - motion.div [DASHBOARD_LAYOUT_CLASS.dropOverlayAccent]
    - div [DASHBOARD_LAYOUT_CLASS.dropOverlayIconWrap]
      - StatusIcon [DASHBOARD_LAYOUT_CLASS.dropOverlayIconTone]
- PanelGroup [DASHBOARD_LAYOUT_CLASS.panelGroup]
  - Panel [DASHBOARD_LAYOUT_CLASS.mainPanel]
    - div
      - div
        - div [DASHBOARD_LAYOUT_CLASS.tableHost]
          - div [DASHBOARD_LAYOUT_CLASS.tableWatermark]
          - div [DASHBOARD_LAYOUT_CLASS.tableContent]
  - PanelResizeHandle
    - div [DASHBOARD_LAYOUT_CLASS.resizeHandleInner]
      - div [DASHBOARD_LAYOUT_CLASS.resizeHandleBar]
  - Panel
    - div
      - div
        - div [DASHBOARD_LAYOUT_CLASS.inspectorContent]
          - motion.div [DASHBOARD_LAYOUT_CLASS.inspectorContent]
- Section [DASHBOARD_LAYOUT_CLASS.section]
  - AnimatePresence
    - motion.div [DASHBOARD_LAYOUT_CLASS.fullscreenOverlay]
      - Section [DASHBOARD_LAYOUT_CLASS.fullscreenSection]
        - div [DASHBOARD_LAYOUT_CLASS.fullscreenBackdrop]
        - motion.div [DASHBOARD_LAYOUT_CLASS.fullscreenPanel]

### src/modules/dashboard/components/SetLocationEditor.tsx (component)

- div [FORM_UI_CLASS.locationEditorRoot]
  - div [FORM_UI_CLASS.locationEditorCaption]
  - div [FORM_UI_CLASS.locationEditorRow]
    - div [FORM_UI_CLASS.locationEditorIconWrap]
      - HardDrive [FORM_UI_CLASS.locationEditorIcon]
    - div [FORM_UI_CLASS.locationEditorField]
      - label [TEXT_ROLE.caption]
      - Input [TEXT_ROLE.codeMuted]
  - p [TEXT_ROLE.bodySmall]
  - div [TEXT_ROLE.bodySmall]
  - div [FORM_UI_CLASS.locationEditorActions]
  - div [FORM_UI_CLASS.locationEditorError]

### src/modules/dashboard/components/TorrentDetails_Content.tsx (component)

- div [TABLE_VIEW_CLASS.detailsContentRoot]
  - AlertPanel [TABLE_VIEW_CLASS.detailsContentWarning]
    - div [TEXT_ROLE.statusWarning]
    - div [TABLE_VIEW_CLASS.detailsContentRecoveryNote]
- div [TABLE_VIEW_CLASS.detailsContentRoot]
  - GlassPanel [TABLE_VIEW_CLASS.detailsContentHeaderShell]
    - div [TABLE_VIEW_CLASS.detailsContentHeaderRow]
      - div [TABLE_VIEW_CLASS.detailsContentHeaderMeta]
        - span [TABLE_VIEW_CLASS.detailsContentHeaderTitle]
        - p [TEXT_ROLE.caption]
      - span [TEXT_ROLE.labelPrimary]
  - div [TABLE_VIEW_CLASS.detailsContentHeaderShell]
    - div [TABLE_VIEW_CLASS.detailsContentHeaderRow]
      - div [TABLE_VIEW_CLASS.detailsContentHeaderMeta]
        - span [TABLE_VIEW_CLASS.detailsContentHeaderTitle]
        - p [TEXT_ROLE.caption]
      - span [TEXT_ROLE.labelPrimary]
  - GlassPanel [TABLE_VIEW_CLASS.detailsContentPanel]
    - div [TABLE_VIEW_CLASS.detailsContentSectionHeader]
    - div [TABLE_VIEW_CLASS.detailsContentListHost]
      - div [TABLE_VIEW_CLASS.detailsContentListScroll]

### src/modules/dashboard/components/TorrentDetails_General.tsx (component)

- div [DETAIL_VIEW_CLASS.generalRoot]
  - GlassPanel [DETAIL_VIEW_CLASS.generalCard]
    - div [DETAIL_VIEW_CLASS.generalHeaderRow]
      - div [DETAIL_VIEW_CLASS.generalPrimaryCol]
        - div [TEXT_ROLE.caption]
        - code [DETAIL_VIEW_CLASS.generalPathCode]
      - div [DETAIL_VIEW_CLASS.generalVerifyCol]
        - div [TEXT_ROLE.caption]
        - div [DETAIL_VIEW_CLASS.generalVerifyWrap]
  - AlertPanel
    - div [DETAIL_VIEW_CLASS.generalWarningStack]
      - span [TEXT_ROLE.statusWarning]
      - div [DETAIL_VIEW_CLASS.generalProbeStack]
      - div [TEXT_ROLE.bodySmall]
      - div [DETAIL_VIEW_CLASS.generalRecoveryHint]
  - div [DETAIL_VIEW_CLASS.generalControlsGrid]
    - div [DETAIL_VIEW_CLASS.generalControlsSpan]
      - GlassPanel [DETAIL_VIEW_CLASS.generalCard]
        - div [DETAIL_VIEW_CLASS.generalHeaderRow]
          - div
            - div [TEXT_ROLE.caption]
            - div [DETAIL_VIEW_CLASS.generalControlsDescription]
          - div [DETAIL_VIEW_CLASS.generalControlsMeta]
            - div [DETAIL_VIEW_CLASS.generalControlsActions]
              - Button
                - Fragment
                  - ToggleIcon [DETAIL_VIEW_CLASS.generalButtonIcon]
              - Button
                - Fragment
                  - Folder [DETAIL_VIEW_CLASS.generalButtonIcon]
              - Button
                - Fragment
                  - Trash2 [DETAIL_VIEW_CLASS.generalButtonIcon]

### src/modules/dashboard/components/TorrentDetails_Header.tsx (component)

- div
  - div [DETAIL_VIEW_CLASS.headerLeft]
    - Info [DETAIL_VIEW_CLASS.headerInfoIcon]
    - span [DETAIL_VIEW_CLASS.headerTitle]
      - span [DETAIL_VIEW_CLASS.headerStatus]
        - em [DETAIL_VIEW_CLASS.headerPrimaryHint]
  - div [DETAIL_VIEW_CLASS.headerCenter]
    - div [DETAIL_VIEW_CLASS.headerTabs]
  - div [DETAIL_VIEW_CLASS.headerRight]

### src/modules/dashboard/components/TorrentDetails_Peers_Map.tsx (component)

- div [SPLIT_VIEW_CLASS.peerMapRoot]
  - div [SPLIT_VIEW_CLASS.peerMapHud]
    - div [SPLIT_VIEW_CLASS.peerMapHudMeta]
      - span [TEXT_ROLE_EXTENDED.chartLabelMuted]
      - div [SPLIT_VIEW_CLASS.peerMapHudStats]
        - span [SPLIT_VIEW_CLASS.peerMapNodeCount]
    - AnimatePresence
      - motion.div [SPLIT_VIEW_CLASS.peerMapInstrumentInfo]
        - span [SPLIT_VIEW_CLASS.peerMapAperture]
        - StatusIcon [SPLIT_VIEW_CLASS.peerMapCompassIcon]
  - div [SPLIT_VIEW_CLASS.peerMapCanvasWrap]
    - svg [SPLIT_VIEW_CLASS.peerMapSvg]
      - circle [SPLIT_VIEW_CLASS.peerMapRing]
      - AnimatePresence
        - motion.g [SPLIT_VIEW_CLASS.peerMapGuides]
          - circle [SPLIT_VIEW_CLASS.peerMapGuideCircle]
          - line [SPLIT_VIEW_CLASS.peerMapGuideAxis]
      - g
        - Tooltip [STANDARD_SURFACE_CLASS.tooltip]

### src/modules/dashboard/components/TorrentDetails_Peers.tsx (component)

- p [SPLIT_VIEW_CLASS.emptyText]
- GlassPanel [SPLIT_VIEW_CLASS.emptyPanel]
- div [SPLIT_VIEW_CLASS.root]
  - PanelGroup
    - Panel
      - GlassPanel [SPLIT_VIEW_CLASS.mapPanel]
        - div [SPLIT_VIEW_CLASS.hudRow]
          - div [SPLIT_VIEW_CLASS.hudLabel]
        - div [SPLIT_VIEW_CLASS.mapCanvas]
    - PanelResizeHandle
      - div [SPLIT_VIEW_CLASS.resizeHandle]
        - div [SPLIT_VIEW_CLASS.resizeBar]
    - Panel
      - GlassPanel [SPLIT_VIEW_CLASS.listSurface]
        - div [SPLIT_VIEW_CLASS.header]
          - span [SPLIT_VIEW_CLASS.headerFlagCol]
          - span [SPLIT_VIEW_CLASS.headerEndpointCol]
          - span [SPLIT_VIEW_CLASS.headerClientCol]
          - span [SPLIT_VIEW_CLASS.headerSpeedCol]
          - span [SPLIT_VIEW_CLASS.headerSpeedCol]
        - div [SPLIT_VIEW_CLASS.listScroll]
          - div
            - div
              - div [SPLIT_VIEW_CLASS.flagsCol]
                - div [SPLIT_VIEW_CLASS.flagsWrap]
                  - Tooltip [STANDARD_SURFACE_CLASS.tooltip]
                    - span [SPLIT_VIEW_CLASS.flagToken]
              - div [SPLIT_VIEW_CLASS.endpointCol]
                - StatusIcon [SPLIT_VIEW_CLASS.encryptedIcon]
                - StatusIcon [SPLIT_VIEW_CLASS.utpIcon]
              - div [SPLIT_VIEW_CLASS.clientCol]
              - div [SPLIT_VIEW_CLASS.downRateCol]
              - div [SPLIT_VIEW_CLASS.upRateCol]
          - div [CONTEXT_MENU_CLASS.panel]
            - div [CONTEXT_MENU_CLASS.header]
              - StatusIcon [CONTEXT_MENU_CLASS.headerIcon]
              - span [CONTEXT_MENU_CLASS.headerText]
            - button [CONTEXT_MENU_CLASS.actionButton]
            - button [CONTEXT_MENU_CLASS.actionButton]
            - button [CONTEXT_MENU_CLASS.dangerActionButton]

### src/modules/dashboard/components/TorrentDetails_Pieces_Heatmap.tsx (component)

- div [HEATMAP_VIEW_CLASS.empty, HEATMAP_VIEW_CLASS.emptyMuted]
- motion.div [HEATMAP_VIEW_CLASS.root]
  - div [HEATMAP_VIEW_CLASS.header]
    - span [TEXT_ROLE.label]
    - div [HEATMAP_VIEW_CLASS.legend, HEATMAP_VIEW_CLASS.legendMuted]
      - span [HEATMAP_VIEW_CLASS.legendItem]
        - span [HEATMAP_VIEW_CLASS.legendDot, HEATMAP_VIEW_CLASS.legendDotRare]
      - span [HEATMAP_VIEW_CLASS.legendItem]
        - span [HEATMAP_VIEW_CLASS.legendDot, HEATMAP_VIEW_CLASS.legendDotCommon]
    - div [HEATMAP_VIEW_CLASS.controls]
      - Button [HEATMAP_VIEW_CLASS.zoomButton]
        - StatusIcon [HEATMAP_VIEW_CLASS.zoomIcon]
      - span [HEATMAP_VIEW_CLASS.zoomValue]
      - Button [HEATMAP_VIEW_CLASS.zoomButton]
        - StatusIcon [HEATMAP_VIEW_CLASS.zoomIcon]
  - div
    - Tooltip [STANDARD_SURFACE_CLASS.tooltip]
      - canvas [HEATMAP_VIEW_CLASS.canvas]

### src/modules/dashboard/components/TorrentDetails_Pieces_Map.tsx (component)

- div [SPLIT_VIEW_CLASS.contentStack]
  - div [SPLIT_VIEW_CLASS.mapStatsRow]
    - div [SPLIT_VIEW_CLASS.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT_VIEW_CLASS.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT_VIEW_CLASS.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [TEXT_ROLE.code]
    - div [SPLIT_VIEW_CLASS.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [SPLIT_VIEW_CLASS.mapStatWarningCount]
    - div [SPLIT_VIEW_CLASS.mapStatColumn]
      - span [TEXT_ROLE.label]
      - span [SPLIT_VIEW_CLASS.mapStatDangerCount]
  - div [SPLIT_VIEW_CLASS.mapNote]
  - div [SPLIT_VIEW_CLASS.mapFrame]
    - div [SPLIT_VIEW_CLASS.mapFrameInner]
      - canvas [SPLIT_VIEW_CLASS.mapCanvasLayer]
      - canvas [SPLIT_VIEW_CLASS.mapCanvasOverlayLayer]
      - div [SPLIT_VIEW_CLASS.mapTooltip]
        - span [SPLIT_VIEW_CLASS.mapTooltipPrimaryLine, SPLIT_VIEW_CLASS.mapTooltipSecondaryLine]
      - div [SPLIT_VIEW_CLASS.mapHintWrap]
        - div [SPLIT_VIEW_CLASS.mapHintChip]
  - div [SPLIT_VIEW_CLASS.mapLegendRow]
    - span [SPLIT_VIEW_CLASS.mapLegendItem]
      - span [SPLIT_VIEW_CLASS.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]
    - span [SPLIT_VIEW_CLASS.mapLegendItem]
      - span [SPLIT_VIEW_CLASS.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]
    - span [SPLIT_VIEW_CLASS.mapLegendItem]
      - span [SPLIT_VIEW_CLASS.mapLegendSwatch]
      - span [TEXT_ROLE.bodyMuted]

### src/modules/dashboard/components/TorrentDetails_Pieces.tsx (component)

- PanelGroup [SPLIT_VIEW_CLASS.panelGroup]
  - Panel [SPLIT_VIEW_CLASS.panel]
    - GlassPanel [SPLIT_VIEW_CLASS.surfacePanel]
      - div [SPLIT_VIEW_CLASS.sectionHeader]
        - span [TEXT_ROLE.label]
        - span [SPLIT_VIEW_CLASS.sectionHeaderMeta]
      - div [SPLIT_VIEW_CLASS.surfacePanelBody]
        - div [SPLIT_VIEW_CLASS.surfacePanelFill]
  - PanelResizeHandle
    - div [SPLIT_VIEW_CLASS.resizeHandle]
      - div [SPLIT_VIEW_CLASS.resizeBar]
  - Panel [SPLIT_VIEW_CLASS.panel]
    - GlassPanel [SPLIT_VIEW_CLASS.surfacePanel]
      - div [SPLIT_VIEW_CLASS.sectionHeader]
        - span [TEXT_ROLE.label]
        - span [SPLIT_VIEW_CLASS.sectionHeaderCaption]

### src/modules/dashboard/components/TorrentDetails_Speed_Chart.tsx (component)

- div [METRIC_CHART_CLASS.canvasWrap]
  - canvas [METRIC_CHART_CLASS.canvas]
- div [METRIC_CHART_CLASS.canvasWrap]
  - canvas [METRIC_CHART_CLASS.canvas]
- div [METRIC_CHART_CLASS.root]
  - div [METRIC_CHART_CLASS.header]
    - div [METRIC_CHART_CLASS.metrics]
      - span [METRIC_CHART_CLASS.downMetric]
      - span [METRIC_CHART_CLASS.upMetric]
    - div [METRIC_CHART_CLASS.controls]
      - ButtonGroup [METRIC_CHART_CLASS.layoutGroup]
      - div [METRIC_CHART_CLASS.windowGroup]
  - div [METRIC_CHART_CLASS.content]
    - Fragment
      - div [METRIC_CHART_CLASS.panel]
        - span [METRIC_CHART_CLASS.panelLabelWrap, TEXT_ROLE_EXTENDED.chartLabelSuccess]
        - SeriesChart [METRIC_CHART_CLASS.panelSeries]
      - div [METRIC_CHART_CLASS.panel]
        - span [METRIC_CHART_CLASS.panelLabelWrap, TEXT_ROLE_EXTENDED.chartLabelPrimary]
        - SeriesChart [METRIC_CHART_CLASS.panelSeries]
    - div [METRIC_CHART_CLASS.panel]
      - CombinedChart [METRIC_CHART_CLASS.panelSeries]

### src/modules/dashboard/components/TorrentDetails_Speed.tsx (component)

- Fragment
  - AlertPanel [DETAIL_VIEW_CLASS.speedCheckingAlert]
  - div [DETAIL_VIEW_CLASS.speedCollectingPanel]
  - div [DETAIL_VIEW_CLASS.speedChartHost]
- div [DETAIL_VIEW_CLASS.speedRoot]
  - GlassPanel [DETAIL_VIEW_CLASS.speedStandaloneSurface]
  - div [DETAIL_VIEW_CLASS.speedEmbeddedSurface]

### src/modules/dashboard/components/TorrentDetails_Trackers.tsx (component)

- p [DETAIL_TABLE_CLASS.emptyText]
- GlassPanel [DETAIL_TABLE_CLASS.emptyPanel]
- table [DETAIL_TABLE_CLASS.table]
  - thead [STANDARD_SURFACE_CLASS.chrome.sticky]
    - tr [DETAIL_TABLE_CLASS.tableHeadRow]
      - th [DETAIL_TABLE_CLASS.tableHeadCellIcon]
        - StatusIcon [DETAIL_TABLE_CLASS.tableHeadIconMuted]
      - th [DETAIL_TABLE_CLASS.tableHeadCell]
      - th [DETAIL_TABLE_CLASS.tableHeadCell]
      - th [DETAIL_TABLE_CLASS.tableHeadCell]
      - th [DETAIL_TABLE_CLASS.tableHeadCellStatus]
  - tbody [DETAIL_TABLE_CLASS.tableBody]
    - tr [DETAIL_TABLE_CLASS.tableRow]
      - td [DETAIL_TABLE_CLASS.cellIcon]
      - td [DETAIL_TABLE_CLASS.cellHost]
      - td [DETAIL_TABLE_CLASS.cellAnnounce]
        - div [DETAIL_TABLE_CLASS.announceRow]
      - td [DETAIL_TABLE_CLASS.cellPeers]
        - div [DETAIL_TABLE_CLASS.peerRow]
      - td [DETAIL_TABLE_CLASS.cellStatus]
        - span [DETAIL_TABLE_CLASS.statusTone.pending]
        - span [DETAIL_TABLE_CLASS.statusTone.online]
        - span [DETAIL_TABLE_CLASS.statusTone.partial]
- div [DETAIL_TABLE_CLASS.root]
  - div [DETAIL_TABLE_CLASS.toolbar]
    - div [DETAIL_TABLE_CLASS.toolbarGroup]
      - StatusIcon [DETAIL_TABLE_CLASS.toolbarIconPrimary]
      - span [TEXT_ROLE.label]
    - div [DETAIL_TABLE_CLASS.toolbarGroup]
  - div [DETAIL_TABLE_CLASS.body]
    - GlassPanel [DETAIL_TABLE_CLASS.panel]
      - div [DETAIL_TABLE_CLASS.scroll]
    - div [DETAIL_TABLE_CLASS.scroll]
    - GlassPanel [DETAIL_TABLE_CLASS.overlay]
      - div [DETAIL_TABLE_CLASS.overlayHeader]
        - span [DETAIL_TABLE_CLASS.overlayTitle]
      - div [DETAIL_TABLE_CLASS.overlayBody]
        - Textarea [DETAIL_TABLE_CLASS.inputClassNames]
      - div [DETAIL_TABLE_CLASS.overlayFooter]

### src/modules/dashboard/components/TorrentDetails.tsx (component)

- div [DETAIL_VIEW_CLASS.root, DETAIL_VIEW_CLASS.rootStandalone]
  - div [DETAIL_VIEW_CLASS.body]

### src/modules/dashboard/components/TorrentRecoveryModal.tsx (modal)

- Modal [STANDARD_SURFACE_CLASS.modal.compactClassNames]
  - ModalContent
    - Fragment
      - ModalHeader [APP_MODAL_CLASS.dialogHeader]
        - div [APP_MODAL_CLASS.dialogHeaderLead]
          - div [APP_MODAL_CLASS.dialogHeaderIconWrap]
            - AlertTriangle [APP_MODAL_CLASS.dialogHeaderWarningIcon]
          - h2 [TEXT_ROLE_EXTENDED.modalTitle]
      - ModalBody [APP_MODAL_CLASS.dialogBody]
        - div [APP_MODAL_CLASS.dialogSectionStack]
          - p [TEXT_ROLE.bodyStrong]
          - p [TEXT_ROLE.bodySmall]
        - div [APP_MODAL_CLASS.dialogLocationRow]
          - HardDrive [APP_MODAL_CLASS.dialogLocationIcon]
          - span [APP_MODAL_CLASS.dialogLocationLabel]
        - div [TEXT_ROLE.caption]
        - div [APP_MODAL_CLASS.dialogOutcomePanel]
        - div [APP_MODAL_CLASS.dialogInsetPanel]
          - div [APP_MODAL_CLASS.dialogInsetStack]
            - p [APP_MODAL_CLASS.dialogInsetTitle]
            - p [TEXT_ROLE.bodySmall]
            - div [APP_MODAL_CLASS.dialogInsetStack]
              - div [APP_MODAL_CLASS.dialogInsetItem]
                - p [APP_MODAL_CLASS.dialogInsetLabel]
                - p [APP_MODAL_CLASS.dialogInsetDescription]
            - p [TEXT_ROLE.caption]
      - ModalFooter [APP_MODAL_CLASS.dialogFooter]
        - div [APP_MODAL_CLASS.dialogFooterGroup]
          - Button [APP_MODAL_CLASS.dialogSecondaryAction]
        - div [APP_MODAL_CLASS.dialogFooterGroup]
          - Button [APP_MODAL_CLASS.dialogSecondaryAction]
          - Button [APP_MODAL_CLASS.dialogPrimaryAction]

### src/modules/dashboard/components/TorrentTable_Body.tsx (component)

- div [TABLE_VIEW_CLASS.bodyScroll]
  - div [TABLE_VIEW_CLASS.loadingRoot]
    - div [TABLE_VIEW_CLASS.loadingRow]
      - div [TABLE_VIEW_CLASS.loadingSkeletonWrap]
        - Skeleton [TABLE_VIEW_CLASS.loadingSkeleton]
  - div [TABLE_VIEW_CLASS.emptyRoot]
    - div [TABLE_VIEW_CLASS.emptyHintRow]
      - StatusIcon [TABLE_VIEW_CLASS.emptyIcon]
    - p [TABLE_VIEW_CLASS.emptySubtext]
    - div [TABLE_VIEW_CLASS.emptyPreview]
      - div [TABLE_VIEW_CLASS.emptyHintRow]
        - span [TABLE_VIEW_CLASS.emptyBar]
      - div [TABLE_VIEW_CLASS.emptyPreviewRow]
        - span [TABLE_VIEW_CLASS.emptyBar]
        - span [TABLE_VIEW_CLASS.emptyBar]
        - span [TABLE_VIEW_CLASS.emptyBar]
  - div [TABLE_VIEW_CLASS.noResults]
  - DndContext
    - SortableContext
      - div [TABLE_VIEW_CLASS.bodyCanvas]
    - DragOverlay
      - div [TABLE_VIEW_CLASS.dragOverlay]
        - div [TABLE_VIEW_CLASS.dragOverlayContent]
  - div [TABLE_VIEW_CLASS.marquee]

### src/modules/dashboard/components/TorrentTable_ColumnDefs.tsx (component)

- div [TABLE_VIEW_CLASS.columnDefs.nameCell]
  - span [TABLE_VIEW_CLASS.columnDefs.nameLabel, TABLE_VIEW_CLASS.columnDefs.nameLabelPaused]
- div [TABLE_VIEW_CLASS.columnDefs.progressCell]
  - div [TABLE_VIEW_CLASS.columnDefs.progressMetricsRow]
    - span [TABLE_VIEW_CLASS.columnDefs.progressSecondary]
  - SmoothProgressBar [TABLE_VIEW_CLASS.columnDefs.progressBar]
- span [TABLE_VIEW_CLASS.columnDefs.numericMuted]
- span [TABLE_VIEW_CLASS.columnDefs.numericSoft]
- span [TABLE_VIEW_CLASS.columnDefs.numericSoft]
- div [TABLE_VIEW_CLASS.columnDefs.peersRow]
  - StatusIcon [TABLE_VIEW_CLASS.columnDefs.peersIcon]
  - span [TABLE_VIEW_CLASS.columnDefs.peersDivider]
  - span [TABLE_VIEW_CLASS.columnDefs.peersSeedCount]
- span [TABLE_VIEW_CLASS.columnDefs.numericDim]
- span [TABLE_VIEW_CLASS.columnDefs.numericMuted]
- span [TABLE_VIEW_CLASS.columnDefs.numericDim]

### src/modules/dashboard/components/TorrentTable_ColumnSettingsModal.tsx (modal)

- Modal [STANDARD_SURFACE_CLASS.modal.baseClassNames]
  - ModalContent
    - Fragment
      - ModalBody
        - div [TABLE_VIEW_CLASS.columnSettingsRow]

### src/modules/dashboard/components/TorrentTable_EmptyState.tsx (component)

- div [TABLE_VIEW_CLASS.loadingRoot]
  - div [TABLE_VIEW_CLASS.loadingRow]
    - div [TABLE_VIEW_CLASS.loadingSkeletonWrap]
      - Skeleton [TABLE_VIEW_CLASS.loadingSkeleton]
- div [TABLE_VIEW_CLASS.emptyRoot]
  - div [TABLE_VIEW_CLASS.emptyHintRow]
    - StatusIcon [TABLE_VIEW_CLASS.emptyIcon]
  - p [TABLE_VIEW_CLASS.emptySubtext]
  - div [TABLE_VIEW_CLASS.emptyPreview]
    - div
      - span [TABLE_VIEW_CLASS.emptyBar]
    - div [TABLE_VIEW_CLASS.emptyPreviewRow]
      - span [TABLE_VIEW_CLASS.emptyBar]
      - span [TABLE_VIEW_CLASS.emptyBar]
      - span [TABLE_VIEW_CLASS.emptyBar]

### src/modules/dashboard/components/TorrentTable_Header.tsx (component)

- motion.div
  - div [TORRENT_HEADER_CLASS.resizeHandle]

### src/modules/dashboard/components/TorrentTable_HeaderMenu.tsx (component)

- AnimatePresence
  - Dropdown
    - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.minWidthSurface, STANDARD_SURFACE_CLASS.menu.surface]
      - DropdownItem [STANDARD_SURFACE_CLASS.menu.itemStrong]
      - DropdownItem [STANDARD_SURFACE_CLASS.menu.itemStrong]
      - DropdownSection
        - DropdownItem [STANDARD_SURFACE_CLASS.menu.itemNested, STANDARD_SURFACE_CLASS.menu.itemPinned]

### src/modules/dashboard/components/TorrentTable_Headers.tsx (component)

- div [TABLE_VIEW_CLASS.headerPreviewPadding]
- div
  - SortableContext
    - div [TABLE_VIEW_CLASS.headerGroupRow]

### src/modules/dashboard/components/TorrentTable_MissingFilesStatusCell.tsx (component)

- div [FORM_CONTROL_CLASS.statusChipContainer]
  - Chip [FORM_CONTROL_CLASS.statusChipClassNames]
    - div [FORM_CONTROL_CLASS.statusChipContent]
      - AlertTriangle [FORM_CONTROL_CLASS.statusChipWarningIcon]
- div [FORM_CONTROL_CLASS.statusChipContainer]
  - button
    - Chip [FORM_CONTROL_CLASS.statusChipClassNames]
      - div [FORM_CONTROL_CLASS.statusChipContent]
        - AlertTriangle [FORM_CONTROL_CLASS.statusChipWarningIcon]
        - span [FORM_CONTROL_CLASS.statusChipLabel]

### src/modules/dashboard/components/TorrentTable_RowMenu.tsx (component)

- DropdownItem [CONTEXT_MENU_CLASS.sectionHeading, STANDARD_SURFACE_CLASS.menu.sectionHeading]
- DropdownItem [CONTEXT_MENU_CLASS.sectionNestedItem]
- DropdownItem [CONTEXT_MENU_CLASS.sectionHeadingStrong, STANDARD_SURFACE_CLASS.menu.sectionHeading]
- DropdownItem [CONTEXT_MENU_CLASS.editorItem]
  - div [CONTEXT_MENU_CLASS.editorWrap]
- Dropdown
  - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.surface]

### src/modules/dashboard/components/TorrentTable_SpeedColumnCell.tsx (component)

- div [TABLE_VIEW_CLASS.speedCell.root]
  - svg [TABLE_VIEW_CLASS.speedCell.sparkline]
  - div [TABLE_VIEW_CLASS.speedCell.valueRow]
    - span [TABLE_VIEW_CLASS.speedCell.valueText]

### src/modules/dashboard/components/TorrentTable_StatusColumnCell.tsx (component)

- div [FORM_CONTROL_CLASS.statusChipContainer]
  - Chip [FORM_CONTROL_CLASS.statusChipClassNames]
    - div [FORM_CONTROL_CLASS.statusChipContent]
      - StatusIcon [FORM_CONTROL_CLASS.statusChipCurrentIcon]
      - span [FORM_CONTROL_CLASS.statusChipLabel]

### src/modules/dashboard/components/TorrentTable.tsx (component)

- Fragment
  - div [TABLE_VIEW_CLASS.hostRoot, TABLE_VIEW_CLASS.workbenchShell, TABLE_VIEW_CLASS.workbenchSurface]

### src/modules/dashboard/hooks/useTorrentTableColumns.tsx (component)

- div [TABLE_VIEW_CLASS.columnHeaderLabel]
  - HeaderIcon [TABLE_VIEW_CLASS.columnHeaderPulseIcon]

### src/modules/settings/components/InterfaceTabContent.tsx (component)

- Fragment
  - SettingsSection
    - div [FORM_UI_CLASS.interfaceStack]
      - div [FORM_UI_CLASS.interfaceRow]
        - div [FORM_UI_CLASS.interfaceRowInfo]
          - p [FORM_UI_CLASS.interfaceRowTitle]
          - p [TEXT_ROLE.caption]
        - div [FORM_UI_CLASS.interfaceRowActions]
      - div [FORM_UI_CLASS.interfaceRow]
        - div [FORM_UI_CLASS.interfaceRowInfo]
          - p [FORM_UI_CLASS.interfaceRowTitle]
          - p [TEXT_ROLE.caption]
  - SettingsSection [FORM_UI_CLASS.sectionMarginTop]
    - div [FORM_UI_CLASS.switchRow]
      - span [FORM_UI_CLASS.systemRowLabel]
  - SettingsSection [FORM_UI_CLASS.sectionMarginTop]
    - div [FORM_UI_CLASS.languageRow]
      - div
        - span [FORM_UI_CLASS.interfaceRowTitle]
        - p [TEXT_ROLE.caption]
  - SettingsSection [FORM_UI_CLASS.sectionMarginTop]

### src/modules/settings/components/SettingsBlockRenderers.tsx (component)

- div [FORM_UI_CLASS.blockStackTight]
  - div [FORM_UI_CLASS.blockRowBetween]
    - Switch
      - span [FORM_UI_CLASS.switchSliderLabel]
    - div [FORM_UI_CLASS.sliderValueBadge, FORM_UI_CLASS.sliderValueText]
  - Slider [FORM_UI_CLASS.slider, FORM_UI_CLASS.sliderClassNames]
- div [FORM_UI_CLASS.switchBlock]
  - div [FORM_UI_CLASS.switchRow]
    - span [FORM_UI_CLASS.switchLabel]
  - p [TEXT_ROLE.caption]
- block.endIcon [FORM_UI_CLASS.inputEndIcon]
- p [TEXT_ROLE.caption]
- div [FORM_UI_CLASS.inputGroup]
- div [FORM_UI_CLASS.inputActionGroup]
  - div [FORM_UI_CLASS.inputActionRow]
    - div [FORM_UI_CLASS.inputActionFill]
    - Button [FORM_UI_CLASS.inputActionButton]
- div [FORM_UI_CLASS.inputPairGrid]
- div [FORM_UI_CLASS.blockStackTight]
  - div [FORM_UI_CLASS.blockRowBetween]
    - span [TEXT_ROLE.labelDense]
  - div [FORM_UI_CLASS.daySelectorList]
    - Button [FORM_UI_CLASS.daySelectorButton, FORM_UI_CLASS.daySelectorSelected, FORM_UI_CLASS.daySelectorUnselected]
- Select [FORM_UI_CLASS.selectClassNames]
- div [FORM_UI_CLASS.buttonRow]
- div [FORM_UI_CLASS.languageRow]
  - div
    - span [FORM_UI_CLASS.interfaceRowTitle]
    - p [TEXT_ROLE.caption]
- div [FORM_UI_CLASS.blockStackTight]
  - div [FORM_UI_CLASS.rawConfigHeader]
    - div
      - span [FORM_UI_CLASS.rawConfigTitle]
      - p [FORM_UI_CLASS.rawConfigDescription]
  - div [FORM_UI_CLASS.rawConfigFeedback]
    - p [FORM_UI_CLASS.rawConfigStatusSuccess]
    - p [FORM_UI_CLASS.rawConfigStatusDanger]
  - div [FORM_UI_CLASS.rawConfigPanel]
    - textarea [FORM_UI_CLASS.rawConfigCode, FORM_UI_CLASS.rawConfigTextarea]
- Divider [FORM_UI_CLASS.divider]

### src/modules/settings/components/SettingsFormBuilder.tsx (component)

- Fragment
  - SettingsSection
    - div [FORM_UI_CLASS.sectionContentOffsetStack]

### src/modules/settings/components/SettingsModalView.tsx (view)

- div [APP_MODAL_CLASS.sidebar, APP_MODAL_CLASS.sidebarHidden, APP_MODAL_CLASS.sidebarVisible]
  - div [APP_MODAL_CLASS.sidebarHeader]
    - h2 [APP_MODAL_CLASS.headingFont, TEXT_ROLE.headingLarge]
    - Button [APP_MODAL_CLASS.sidebarCloseButton]
      - X [APP_MODAL_CLASS.iconMd]
  - div [APP_MODAL_CLASS.sidebarBody]
    - button [APP_MODAL_CLASS.tabButtonActive, APP_MODAL_CLASS.tabButtonBase, APP_MODAL_CLASS.tabButtonInactive]
      - tab.icon [APP_MODAL_CLASS.tabIcon, APP_MODAL_CLASS.tabIconActive, APP_MODAL_CLASS.tabIconInactive]
      - motion.div [APP_MODAL_CLASS.tabIndicator]
  - div [APP_MODAL_CLASS.versionWrapper]
    - div [APP_MODAL_CLASS.versionText]
- div [APP_MODAL_CLASS.header]
  - div [APP_MODAL_CLASS.headerLead]
    - Button [APP_MODAL_CLASS.headerMobileBack]
      - ChevronLeft [APP_MODAL_CLASS.iconMd]
    - div [APP_MODAL_CLASS.headerTitleWrap]
      - h1 [APP_MODAL_CLASS.headingFont, TEXT_ROLE.headingLarge]
      - span [APP_MODAL_CLASS.headerUnsaved]
  - ToolbarIconButton [APP_MODAL_CLASS.desktopClose]
- Section [APP_MODAL_CLASS.scrollContent]
  - AlertPanel [APP_MODAL_CLASS.alert]
  - AlertPanel [APP_MODAL_CLASS.alert]
  - AnimatePresence
    - motion.div [APP_MODAL_CLASS.contentStack]
      - AlertPanel [APP_MODAL_CLASS.inlineAlert]
      - SettingsFormProvider
        - SettingsSection
          - div [APP_MODAL_CLASS.connectionStack]
- div [APP_MODAL_CLASS.footer]
  - div [APP_MODAL_CLASS.footerConfirmContent]
    - div [APP_MODAL_CLASS.footerTextWrap]
      - span [APP_MODAL_CLASS.footerWarningTitle]
      - span [TEXT_ROLE.caption]
    - div [APP_MODAL_CLASS.footerActions]
- div [APP_MODAL_CLASS.footer]
  - Button [APP_MODAL_CLASS.footerResetButton]
  - div [APP_MODAL_CLASS.footerButtonRow]
    - Button [APP_MODAL_CLASS.footerSaveButton]
- Modal [APP_MODAL_CLASS.settingsModalBaseFull, APP_MODAL_CLASS.settingsModalBaseRpc, APP_MODAL_CLASS.settingsModalWrapper]
  - ModalContent [APP_MODAL_CLASS.contentWrapper]
    - div [APP_MODAL_CLASS.layout]
      - div [APP_MODAL_CLASS.mainPane]

### src/modules/settings/components/SettingsSection.tsx (component)

- Card [FORM_UI_CLASS.sectionCard]
  - h3 [FORM_UI_CLASS.sectionTitle]
  - p [FORM_UI_CLASS.sectionDescription]

### src/modules/settings/components/tabs/connection/ConnectionManager.tsx (component)

- div [FORM_UI_CLASS.connection.localRoot]
  - div [FORM_UI_CLASS.connection.localHeader]
    - div [FORM_UI_CLASS.connection.localHeaderInfo]
      - h3 [FORM_UI_CLASS.connection.profileTitle]
      - p [FORM_UI_CLASS.connection.profileEndpoint]
    - div [FORM_UI_CLASS.connection.localHeaderActions]
  - p [TEXT_ROLE.caption]
- div [FORM_UI_CLASS.connection.root]
  - div [FORM_UI_CLASS.connection.topRow]
    - div [FORM_UI_CLASS.connection.topRowInfo]
      - h3 [FORM_UI_CLASS.connection.profileTitle]
      - p [FORM_UI_CLASS.connection.profileEndpoint]
    - div [FORM_UI_CLASS.connection.topRowActions]
      - div [FORM_UI_CLASS.connection.statusRow]
        - CheckCircle [FORM_UI_CLASS.connection.iconSmall]
        - XCircle [FORM_UI_CLASS.connection.iconSmall]
        - div [FORM_UI_CLASS.connection.statusMeta]
          - p [TEXT_ROLE.label]
          - p [TEXT_ROLE.headingSection]
          - p [TEXT_ROLE.caption]
      - RefreshCw [FORM_UI_CLASS.connection.iconSmall]
  - div [FORM_UI_CLASS.connection.fieldsStack]
    - p [FORM_UI_CLASS.connection.offlineWarning]
    - p [FORM_UI_CLASS.connection.insecureAuthWarning]
    - div [FORM_UI_CLASS.connection.fieldsPairGrid]
      - Input [FORM_UI_CLASS.connection.inputHeight]
      - Input [FORM_UI_CLASS.connection.inputHeight]
    - Fragment
      - p [FORM_UI_CLASS.connection.detectingSignin]
      - div [FORM_UI_CLASS.connection.fieldsPairGrid]
    - p [FORM_UI_CLASS.connection.localModeHint]

### src/modules/settings/components/tabs/system/SystemTabContent.tsx (component)

- div [FORM_UI_CLASS.sectionCardEmphasized]
  - h3 [FORM_UI_CLASS.sectionTitle]
  - p [FORM_UI_CLASS.sectionDescription]
  - div [FORM_UI_CLASS.sectionContentStack]
- div [FORM_UI_CLASS.systemRow]
  - div [FORM_UI_CLASS.systemRowHeader]
    - span [FORM_UI_CLASS.systemRowLabel]
    - div [FORM_UI_CLASS.systemRowControl]
  - p [FORM_UI_CLASS.systemRowHelper]
- Chip [FORM_UI_CLASS.systemStatusChip]
- SettingsSection
  - div [FORM_UI_CLASS.systemNoticeStack]
    - p [FORM_UI_CLASS.systemNoticeBody]
    - p [TEXT_ROLE.caption]
- div [FORM_UI_CLASS.systemRootStack]

### src/modules/torrent-add/components/AddMagnetModal.tsx (modal)

- Modal [STANDARD_SURFACE_CLASS.modal.baseClassNames]
  - ModalContent
    - Fragment
      - div [APP_MODAL_CLASS.header]
        - div [APP_MODAL_CLASS.headerLead]
          - StatusIcon [APP_MODAL_CLASS.headerLeadPrimaryIcon]
          - span [TEXT_ROLE.labelPrimary]
        - ToolbarIconButton [APP_MODAL_CLASS.desktopClose]
      - ModalBody [FORM_UI_CLASS.bodyStackPanel]
        - Textarea [INPUT_SURFACE_CLASS.codeTextareaClassNames]
        - p [APP_MODAL_CLASS.hintText]
      - ModalFooter [APP_MODAL_CLASS.footerActionsPadded]

### src/modules/torrent-add/components/AddTorrentDestinationGatePanel.tsx (component)

- GlassPanel [FORM_UI_CLASS.workflow.gatePanel]
  - Tooltip
    - div [FORM_UI_CLASS.workflow.gatePromptRow]
      - HardDrive [FORM_UI_CLASS.workflow.gatePromptIcon]
  - div [FORM_UI_CLASS.workflow.destinationRow]
    - motion.div [FORM_UI_CLASS.workflow.destinationInputWrap]
      - Input [INPUT_SURFACE_CLASS.monoEmphasized]
    - Tooltip
      - Button [STANDARD_SURFACE_CLASS.atom.iconButton]
        - FolderOpen [FORM_UI_CLASS.workflow.actionIcon]
  - div [FORM_UI_CLASS.workflow.status]
    - AlertTriangle [FORM_UI_CLASS.workflow.statusIcon]
    - CheckCircle2 [FORM_UI_CLASS.workflow.statusSuccessIcon]
    - Info [FORM_UI_CLASS.workflow.statusInfoIcon]
    - span [FORM_UI_CLASS.workflow.statusMessage]
  - div [FORM_UI_CLASS.workflow.gateActionsRow]
    - Button [FORM_UI_CLASS.workflow.gateConfirmButton]

### src/modules/torrent-add/components/AddTorrentFileTable.tsx (component)

- div [APP_MODAL_CLASS.workflow.fileTableShell]

### src/modules/torrent-add/components/AddTorrentModal.tsx (modal)

- Modal [APP_MODAL_CLASS.addTorrentModalBase, APP_MODAL_CLASS.addTorrentModalChromeClassNames, APP_MODAL_CLASS.addTorrentModalHeightDefault, APP_MODAL_CLASS.addTorrentModalHeightFull]
  - ModalContent
    - AddTorrentModalContextProvider
      - div [APP_MODAL_CLASS.workflow.gateRoot]
        - ModalHeader [APP_MODAL_CLASS.workflow.header]
          - div [APP_MODAL_CLASS.workflow.titleStack]
            - h2 [TEXT_ROLE_EXTENDED.modalTitle]
            - span [APP_MODAL_CLASS.workflow.sourceLabelCaption]
          - ToolbarIconButton [APP_MODAL_CLASS.workflow.headerIconButton]
        - ModalBody [APP_MODAL_CLASS.workflow.gateBody]
          - div [APP_MODAL_CLASS.workflow.gateContent]
      - form [APP_MODAL_CLASS.workflow.formRoot]
        - div [APP_MODAL_CLASS.workflow.submitOverlay]
          - Fragment
            - p [TEXT_ROLE.codeCaption]
            - p [APP_MODAL_CLASS.workflow.submitHintMuted]
          - Fragment
            - StatusIcon [APP_MODAL_CLASS.workflow.warningTone]
            - p [APP_MODAL_CLASS.workflow.submitWarningTitleCaption]
            - p [APP_MODAL_CLASS.workflow.submitHintMuted]
            - div [APP_MODAL_CLASS.workflow.submitActions]
        - ModalHeader [APP_MODAL_CLASS.workflow.header]
          - div [APP_MODAL_CLASS.workflow.titleStack]
            - h2 [TEXT_ROLE_EXTENDED.modalTitle]
            - span [APP_MODAL_CLASS.workflow.sourceMutedLabel]
          - div [APP_MODAL_CLASS.workflow.headerActions]
            - Chip [APP_MODAL_CLASS.workflow.fileCountChipClassNames]
            - div [APP_MODAL_CLASS.workflow.headerDivider]
            - Tooltip
              - ToolbarIconButton [APP_MODAL_CLASS.workflow.headerIconButton]
            - ToolbarIconButton [APP_MODAL_CLASS.workflow.headerIconButton]
        - ModalBody [APP_MODAL_CLASS.workflow.body]
          - div [APP_MODAL_CLASS.workflow.dropOverlay]
            - div [APP_MODAL_CLASS.workflow.dropOverlayChip]
              - FolderOpen [APP_MODAL_CLASS.workflow.iconLgPrimary]
              - span [TEXT_ROLE.heading]
          - LayoutGroup
            - motion.div
              - PanelGroup [APP_MODAL_CLASS.workflow.panelGroup]
                - PanelResizeHandle
                  - div [APP_MODAL_CLASS.workflow.resizeHandleBarWrap]
                - Panel [APP_MODAL_CLASS.workflow.filePanel]
                  - div [APP_MODAL_CLASS.workflow.filePanelContent]
                    - div [APP_MODAL_CLASS.workflow.filePanelToolbar]
                      - Tooltip
                        - Button [FORM_UI_CLASS.workflow.settingsToggleButton]
                          - SidebarOpen [APP_MODAL_CLASS.workflow.iconMd]
                          - SidebarClose [APP_MODAL_CLASS.workflow.iconMd]
                      - div [APP_MODAL_CLASS.workflow.filesTitle]
                      - Dropdown
                        - DropdownTrigger
                          - Button [APP_MODAL_CLASS.workflow.smartSelectButton]
                            - Sparkles [APP_MODAL_CLASS.workflow.iconMdPrimary]
                        - DropdownMenu
                          - FileVideo [APP_MODAL_CLASS.workflow.iconMd]
                          - ArrowDown [APP_MODAL_CLASS.workflow.iconMd]
                          - DropdownItem [APP_MODAL_CLASS.workflow.dropdownDangerItem]
        - ModalFooter [APP_MODAL_CLASS.workflow.footer]
          - div [APP_MODAL_CLASS.workflow.footerAlerts]
            - AlertPanel [APP_MODAL_CLASS.workflow.footerAlert]
              - AlertTriangle [APP_MODAL_CLASS.workflow.iconAlert]
              - span [APP_MODAL_CLASS.workflow.footerAlertText]
            - AlertPanel [APP_MODAL_CLASS.workflow.footerAlert]
              - AlertTriangle [APP_MODAL_CLASS.workflow.iconAlert]
              - span [APP_MODAL_CLASS.workflow.footerAlertText]
            - AlertPanel [APP_MODAL_CLASS.workflow.footerInfoAlert]
              - AlertTriangle [APP_MODAL_CLASS.workflow.iconAlertMuted]
              - span [APP_MODAL_CLASS.workflow.footerAlertText]
          - div [APP_MODAL_CLASS.workflow.footerActionsStack]
            - div [APP_MODAL_CLASS.workflow.footerActionsRow]
              - Tooltip
                - div [APP_MODAL_CLASS.workflow.inlineBlock]
                  - Button [APP_MODAL_CLASS.workflow.cancelButton]
              - div [APP_MODAL_CLASS.workflow.inlineBlock]
                - Button [APP_MODAL_CLASS.workflow.cancelButton]
              - ButtonGroup
                - Button [APP_MODAL_CLASS.workflow.primaryButton]
                - Dropdown
                  - DropdownTrigger
                    - Button
                      - ChevronDown [APP_MODAL_CLASS.workflow.iconMd]
                  - DropdownMenu
                    - PlayCircle [APP_MODAL_CLASS.workflow.iconMdSuccess]
                    - PauseCircle [APP_MODAL_CLASS.workflow.iconMdWarning]

### src/modules/torrent-add/components/AddTorrentSettingsPanel.tsx (component)

- div [FORM_UI_CLASS.workflow.root]
  - div [FORM_UI_CLASS.workflow.group]
    - div [FORM_UI_CLASS.switchBlock]
      - Tooltip
        - label [FORM_UI_CLASS.workflow.label]
          - HardDrive [FORM_UI_CLASS.workflow.labelIcon]
    - div [FORM_UI_CLASS.workflow.destinationRow]
      - motion.div [FORM_UI_CLASS.workflow.destinationInputWrap]
        - Input [INPUT_SURFACE_CLASS.mono]
      - Tooltip
        - Button [STANDARD_SURFACE_CLASS.atom.iconButton]
          - FolderOpen [FORM_UI_CLASS.workflow.actionIcon]
      - Dropdown
        - DropdownTrigger
          - Button [STANDARD_SURFACE_CLASS.atom.iconButton]
            - ChevronDown [FORM_UI_CLASS.workflow.actionIcon]
        - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.surface]
          - HardDrive [FORM_UI_CLASS.workflow.labelIcon]
    - div [FORM_UI_CLASS.workflow.status]
      - AlertTriangle [FORM_UI_CLASS.workflow.statusIcon]
      - CheckCircle2 [FORM_UI_CLASS.workflow.statusSuccessIcon]
      - Info [FORM_UI_CLASS.workflow.statusInfoIcon]
      - Tooltip
        - span [FORM_UI_CLASS.workflow.statusMessage]
      - span [FORM_UI_CLASS.workflow.statusMessage]
  - Fragment
    - Divider [FORM_UI_CLASS.workflow.flagsDivider]
    - div [FORM_UI_CLASS.workflow.flagsGroup]
      - label [FORM_UI_CLASS.workflow.label]
        - Hash [FORM_UI_CLASS.workflow.labelIcon]
      - div [FORM_UI_CLASS.workflow.flagsCheckboxes]
        - Checkbox [FORM_CONTROL_CLASS.checkboxLabelBodySmallClassNames]
          - span [FORM_UI_CLASS.workflow.flagsItemLabel]
            - ListOrdered [FORM_UI_CLASS.workflow.flagsIcon]
        - Divider [FORM_UI_CLASS.workflow.flagsItemDivider]
        - Checkbox [FORM_CONTROL_CLASS.checkboxLabelBodySmallClassNames]
          - span [FORM_UI_CLASS.workflow.flagsItemLabel]
            - CheckCircle2 [FORM_UI_CLASS.workflow.flagsIcon]

### src/modules/torrent-remove/components/RemoveConfirmationModal.tsx (modal)

- Modal [STANDARD_SURFACE_CLASS.modal.compactClassNames]
  - ModalContent
    - ModalHeader [APP_MODAL_CLASS.headerPassive]
    - ModalBody
      - div [FORM_UI_CLASS.stackTools]
        - Checkbox [FORM_CONTROL_CLASS.checkboxLabelBodySmallClassNames]
    - ModalFooter [APP_MODAL_CLASS.footerEnd]

### src/shared/ui/components/SmoothProgressBar.tsx (component)

- div [METRIC_CHART_CLASS.progressBar.track]
  - div [METRIC_CHART_CLASS.progressBar.indicator]

### src/shared/ui/controls/LanguageMenu.tsx (component)

- Dropdown
  - DropdownMenu [STANDARD_SURFACE_CLASS.menu.dirPickerSurface]
    - DropdownItem [STANDARD_SURFACE_CLASS.menu.itemSelectedPrimary]

### src/shared/ui/workspace/DiskSpaceGauge.tsx (component)

- div
  - div [METRIC_CHART_CLASS.capacityGauge.header]
    - span [METRIC_CHART_CLASS.capacityGauge.path]
  - div [METRIC_CHART_CLASS.capacityGauge.progressWrap]
  - div [METRIC_CHART_CLASS.capacityGauge.stats]
  - p [METRIC_CHART_CLASS.capacityGauge.hint]
  - p [METRIC_CHART_CLASS.capacityGauge.hint]
  - div [METRIC_CHART_CLASS.capacityGauge.errorRow]
    - p [TEXT_ROLE.statusError]

### src/shared/ui/workspace/FileExplorerTree.tsx (component)

- GlassPanel [FILE_BROWSER_CLASS.container]
  - div [FILE_BROWSER_CLASS.toolbar]
    - Input [FILE_BROWSER_CLASS.searchInputClassNames]
    - Dropdown
      - DropdownTrigger
        - Button [FILE_BROWSER_CLASS.filterButton]
          - Filter [FILE_BROWSER_CLASS.filterIcon]
      - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.surface]
    - div [FILE_BROWSER_CLASS.toolsDivider]
    - ButtonGroup
      - Button [FILE_BROWSER_CLASS.expandButton]
        - ArrowDown [FILE_BROWSER_CLASS.iconSmall]
      - Button [FILE_BROWSER_CLASS.expandButton]
        - ArrowUp [FILE_BROWSER_CLASS.iconSmall]
    - div [FILE_BROWSER_CLASS.toolbarSpacer]
    - div
      - span [FILE_BROWSER_CLASS.selectionActionsLabel]
      - Dropdown
        - DropdownTrigger
          - Button [FILE_BROWSER_CLASS.priorityButton]
        - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.surface]
          - DropdownItem [FILE_BROWSER_CLASS.priorityMenuDangerItem]
  - div [FILE_BROWSER_CLASS.headerRow, TEXT_ROLE_EXTENDED.fileTreeHeader]
    - div [FILE_BROWSER_CLASS.headerCheckboxWrap]
      - Checkbox [FORM_CONTROL_CLASS.checkboxPrimaryClassNames]
    - div [FILE_BROWSER_CLASS.headerPriority]
    - div [FILE_BROWSER_CLASS.headerProgress]
    - div [FILE_BROWSER_CLASS.headerSize]
  - div [FILE_BROWSER_CLASS.scroll]
    - div [FILE_BROWSER_CLASS.virtualCanvas]
      - div [FILE_BROWSER_CLASS.virtualRow]
    - div [FILE_BROWSER_CLASS.emptyOverlay]
      - Search [FILE_BROWSER_CLASS.emptyIcon]
      - p [FILE_BROWSER_CLASS.emptyText]

### src/shared/ui/workspace/FileExplorerTreeRow.tsx (component)

- FileVideo [FILE_BROWSER_CLASS.iconVideo]
- FileAudio [FILE_BROWSER_CLASS.iconAudio]
- FileImage [FILE_BROWSER_CLASS.iconImage]
- FileText [FILE_BROWSER_CLASS.iconText]
- FileIcon [FILE_BROWSER_CLASS.iconDefault]
- div [FILE_BROWSER_CLASS.row, FILE_BROWSER_CLASS.rowDimmed]
  - div [FILE_BROWSER_CLASS.rowCheckboxWrap]
    - Checkbox [FORM_CONTROL_CLASS.checkboxPrimaryClassNames]
  - div [FILE_BROWSER_CLASS.rowNameCell]
    - button [FILE_BROWSER_CLASS.chevronButton]
      - ChevronDown [FILE_BROWSER_CLASS.iconSmall]
      - ChevronRight [FILE_BROWSER_CLASS.iconSmall]
    - div [FILE_BROWSER_CLASS.rowIndentSpacer]
    - div [FILE_BROWSER_CLASS.rowIconWrap]
      - Folder [FILE_BROWSER_CLASS.rowFolderIcon]
    - span [FILE_BROWSER_CLASS.rowNameBase, FILE_BROWSER_CLASS.rowNameFile, FILE_BROWSER_CLASS.rowNameFolder]
  - div [FILE_BROWSER_CLASS.rowPriorityWrap]
    - Dropdown
      - DropdownTrigger
        - Chip [FILE_BROWSER_CLASS.priorityChip, FORM_CONTROL_CLASS.priorityChipClassNames]
      - DropdownMenu [STANDARD_SURFACE_CLASS.menu.listClassNames, STANDARD_SURFACE_CLASS.menu.surface]
        - ArrowUp [FILE_BROWSER_CLASS.priorityMenuHighIcon]
        - Minus [FILE_BROWSER_CLASS.priorityMenuNormalIcon]
        - ArrowDown [FILE_BROWSER_CLASS.priorityMenuLowIcon]
        - DropdownItem [FILE_BROWSER_CLASS.priorityMenuDangerItem]
  - div [FILE_BROWSER_CLASS.rowProgressWrap]
    - Progress [FILE_BROWSER_CLASS.progressClassNames]
  - div [FILE_BROWSER_CLASS.rowSizeText]


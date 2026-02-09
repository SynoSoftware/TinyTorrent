# Rename Candidates (Convention-Aware)

This list is optimized for maintainability, not just length reduction.

## Renaming Logic (Rules)

Use these rules when proposing or accepting renames:

1. **Preserve semantic qualifiers that disambiguate behavior.**
   - If a name contains a qualifier like `Status`, `Header`, `ContextMenu`, `Inline`, it stays unless it is *provably redundant* in the current module.
   - Example: `*StatusCell` is meaningfully different from a generic `*Cell`.

2. **Don’t collapse architecture roles.**
   - `ViewModel` is not “just a model”; in MVVM it encodes responsibility and layering.
   - Only remove/replace `ViewModel` if the code is being re-architected away from MVVM (not part of this task).

3. **Hooks keep `use*`.**
   - Never remove `use` from hook identifiers or hook filenames.

4. **Prefer “more precise” over “shorter”.**
   - Renames are valid if they reduce ambiguity or redundancy, even if the string is longer.
   - Avoid “compression” renames that trade clarity for brevity.

5. **Avoid leaking implementation detail.**
   - Names should describe intent and domain, not transient mechanisms (unless the mechanism is part of the contract).

6. **Avoid unclear abbreviations for public/exported APIs.**
   - `VM`, `DnD`, etc. are acceptable only for tight local scope; prefer full words for exported types/components.

## Identifier Candidates (Best Suggestions)

Sorted by occurrences (highest first).

| Occurrences | Current Name | Proposed Name | Why |
| ---: | --- | --- | --- |
| 18 | `setActiveConnectionProfileId` | `setActiveProfileId` | “Connection” is redundant with “Profile” in this domain. |
| 17 | `getRecoverySessionForKey` | `getRecoverySessionByKey` | Standardizes lookup phrasing (`ByKey` keeps intent). |
| 12 | `runMissingFilesRecoverySequence` | `runMissingFilesRecovery` | “Sequence” adds no extra meaning. |
| 9 | `patchInlineSetLocationState` | `patchInlineLocationState` | “Set” is redundant: this is already the inline set-location state. |
| 9 | `setInlineSetLocationState` | `setInlineLocationState` | Same redundancy as above. |
| 8 | `resetRecoveryRuntimeSessionState` | `resetRecoverySessionRuntimeState` | Keeps “runtime” (important) while improving flow. |
| 6 | `mapTorrentCommandOutcomeToCommandPaletteOutcome` | `toCommandPaletteOutcome` | The input/output types already constrain meaning; “map X to Y” is unnecessary ceremony. |
| 3 | `readTorrentFileAsMetainfoBase64` | `readTorrentFileAsBase64` | “Metainfo” is implied by the input (torrent file) and call site; keep “file” and “base64”. |
| 3 | `zTransmissionTorrentAddResponseEntry` | `zTransmissionAddTorrentResponseEntry` | Uses the RPC method term (“add torrent”) instead of mixing “torrent add”. |
| 2 | `zTransmissionTorrentDetailWithPieces` | `zTransmissionTorrentDetailWithPiecesSchema` | Makes the schema role explicit; avoids the name reading like a value object. |
| 2 | `shouldUseRecoveryGateForResume` | `shouldGateResumeWithRecovery` | Keeps exact behavior but reads more directly. |
| 2 | `UseAddTorrentFileSelectionViewModelParams` | `UseAddTorrentFileSelectionParams` | Removes redundant “ViewModel” from helper types while preserving the `Use*` family grouping. |
| 2 | `UseAddTorrentFileSelectionViewModelResult` | `UseAddTorrentFileSelectionResult` | Same. |
| 2 | `UseTorrentTableViewModelParams` | `UseTorrentTableParams` | Same pattern: reduce suffix churn in helper types. |
| 2 | `UseTorrentTableViewModelResult` | `UseTorrentTableResult` | Same. |

## File Name Candidates (Best Suggestions)

These keep hook `use*` prefixes and preserve module identity (avoid dropping `TorrentTable_` / `TorrentDetails_` unless the module already guarantees uniqueness).

| Current File | Proposed File | Why |
| --- | --- | --- |
| `frontend/src/modules/dashboard/components/TorrentTable_SpeedColumnCell.tsx` | `frontend/src/modules/dashboard/components/TorrentTable_SpeedCell.tsx` | Drops “Column” (redundant), keeps `TorrentTable_` identity. |
| `frontend/src/modules/dashboard/components/TorrentTable_StatusColumnCell.tsx` | `frontend/src/modules/dashboard/components/TorrentTable_StatusCell.tsx` | Same. |
| `frontend/src/modules/dashboard/components/TorrentTable_ColumnSettingsModal.tsx` | `frontend/src/modules/dashboard/components/TorrentTable_ColumnsModal.tsx` | “Settings” is redundant in a modal dedicated to columns. |
| `frontend/src/modules/dashboard/hooks/useTorrentTableContextActions.ts` | `frontend/src/modules/dashboard/hooks/useTorrentTableContextMenuActions.ts` | Current name is ambiguous (“context” vs “context menu”); prefer precision. |



## Inventory: 4+ Capitalized-Word Names (Exhaustive)

Criteria: identifiers and filenames with **more than 3 capitalized words** (4+ words by Camel/PascalCase boundaries, plus underscores for filenames) that are **not already listed above**.
If there is no clearly better name without more architectural context, `Suggested` is `no better`.

### Identifiers (576)

| Occurrences | Kind | Name | Suggested | Defined At | What It Does |
| ---: | --- | --- | --- | --- | --- |
| 43 | `interface` | `InlineSetLocationState` | `no better` | `frontend/src\app\context\RecoveryContext.tsx:55` | Type definition for Inline Set Location State (app). |
| 20 | `const` | `isAnyColumnResizing` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:129` | Predicate/flag for Any Column Resizing (module:dashboard). |
| 20 | `const` | `openAddTorrentPicker` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:119` | Value for open Add Torrent Picker (app). |
| 20 | `const` | `refreshSessionStatsData` | `no better` | `frontend/src\app\hooks\useSessionStats.ts:37` | Value for refresh Session Stats Data (app). |
| 19 | `const` | `AppShellStateContext` | `no better` | `frontend/src\app\context\AppShellStateContext.tsx:38` | Context value for App Shell State Context (app). |
| 18 | `const` | `getContextMenuShortcut` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:98` | Value for Context Menu Shortcut (module:dashboard). |
| 18 | `const` | `releaseInlineSetLocation` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1265` | Value for release Inline Set Location (module:dashboard). |
| 18 | `const` | `rowMenuViewModel` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:864` | Value for row Menu View Model (module:dashboard). |
| 18 | `const` | `statusBarViewModel` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:609` | Value for status Bar View Model (app). |
| 17 | `const` | `headerMenuActiveColumn` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:80` | Value for header Menu Active Column (module:dashboard). |
| 17 | `type` | `SpeedChartLayoutMode` | `no better` | `frontend/src\app\types\dashboard\speedChart.ts:1` | Type definition for Speed Chart Layout Mode (app). |
| 17 | `function` | `useAppViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:207` | React hook for App View Model (app). |
| 16 | `type` | `AddTorrentCommitMode` | `no better` | `frontend/src\modules\torrent-add\types.ts:3` | Type definition for Add Torrent Commit Mode (module:torrent-add). |
| 16 | `type` | `NativeShellRequestOptions` | `no better` | `frontend/src\app\agents\shell-agent.ts:3` | Type definition for Native Shell Request Options (app). |
| 16 | `class` | `SessionSpeedHistoryStore` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:25` | Class implementing Session Speed History Store (shared). |
| 15 | `let` | `activeDownloadRequiredBytes` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:61` | Value for active Download Required Bytes (module:dashboard). |
| 15 | `const` | `handleFileSelectionChange` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailControls.ts:24` | Event handler for File Selection Change (module:dashboard). |
| 15 | `const` | `handleRowDragCancel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts:115` | Event handler for Row Drag Cancel (module:dashboard). |
| 15 | `const` | `handleRowDragEnd` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts:57` | Event handler for Row Drag End (module:dashboard). |
| 15 | `const` | `handleRowDragStart` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts:46` | Event handler for Row Drag Start (module:dashboard). |
| 15 | `const` | `isMarqueeDraggingRef` | `no better` | `frontend/src\modules\dashboard\hooks\useMarqueeSelection.ts:39` | Ref for Marquee Dragging Ref (module:dashboard). |
| 15 | `const` | `pendingDeletionHashesRef` | `no better` | `frontend/src\app\orchestrators\useTorrentOrchestrator.ts:41` | Ref for pending Deletion Hashes Ref (app). |
| 14 | `type` | `ColumnSizingInfoState` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:8` | Type definition for Column Sizing Info State (module:dashboard). |
| 14 | `const` | `getMeasuredColumnMinWidth` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:108` | Value for Measured Column Min Width (module:dashboard). |
| 14 | `const` | `inlineSetLocationStateRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1046` | Ref for inline Set Location State Ref (module:dashboard). |
| 14 | `const` | `isDestinationDraftValid` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:331` | Predicate/flag for Destination Draft Valid (module:torrent-add). |
| 14 | `const` | `isDetailRecoveryBlocked` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1459` | Predicate/flag for Detail Recovery Blocked (module:dashboard). |
| 13 | `type` | `AddTorrentCommandOutcome` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:27` | Result/outcome type for Add Torrent Command Outcome (app). |
| 13 | `const` | `columnResizeRafRef` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:41` | Ref for column Resize Raf Ref (module:dashboard). |
| 13 | `interface` | `DashboardDetailViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:46` | Type definition for Dashboard Detail View Model (app). |
| 13 | `const` | `handleContextMenuAction` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableContextActions.ts:107` | Event handler for Context Menu Action (module:dashboard). |
| 13 | `const` | `marqueeClickBlockRef` | `no better` | `frontend/src\modules\dashboard\hooks\useMarqueeSelection.ts:38` | Ref for marquee Click Block Ref (module:dashboard). |
| 13 | `const` | `setAddTorrentDefaults` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:637` | Value for Add Torrent Defaults (app). |
| 13 | `function` | `useResolvedRecoveryClassification` | `no better` | `frontend/src\modules\dashboard\hooks\useResolvedRecoveryClassification.ts:17` | React hook for Resolved Recovery Classification (module:dashboard). |
| 13 | `function` | `useSettingsFormState` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:65` | React hook for Settings Form State (module:settings). |
| 12 | `function` | `useRequiredTorrentActions` | `no better` | `frontend/src\app\context\AppCommandContext.tsx:70` | React hook for Required Torrent Actions (app). |
| 11 | `type` | `AddTorrentDestinationStatusKind` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:4` | Type definition for Add Torrent Destination Status Kind (module:torrent-add). |
| 11 | `const` | `addTorrentModalProps` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:804` | Value for add Torrent Modal Props (app). |
| 11 | `const` | `autoFitAllColumns` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:194` | Value for auto Fit All Columns (module:dashboard). |
| 11 | `const` | `getTableTotalWidthCss` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Shared.tsx:32` | Value for Table Total Width Css (module:dashboard). |
| 11 | `const` | `handleColumnResizeStart` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:145` | Event handler for Column Resize Start (module:dashboard). |
| 11 | `const` | `handleMenuActionPress` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:239` | Event handler for Menu Action Press (module:dashboard). |
| 11 | `const` | `isRpcCommandError` | `no better` | `frontend/src\services\rpc\errors.ts:11` | Predicate/flag for Rpc Command Error (services). |
| 11 | `type` | `MissingFilesProbeResult` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:58` | Result/outcome type for Missing Files Probe Result (services). |
| 11 | `type` | `SettingsFormActionOutcome` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:6` | Result/outcome type for Settings Form Action Outcome (module:settings). |
| 11 | `const` | `settingsModalViewModel` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:653` | Value for settings Modal View Model (app). |
| 11 | `function` | `useSettingsFormActions` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:76` | React hook for Settings Form Actions (module:settings). |
| 10 | `const` | `addMagnetModalProps` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:797` | Value for add Magnet Modal Props (app). |
| 10 | `function` | `classifyMissingFilesState` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:201` | Function for classify Missing Files State (services). |
| 10 | `const` | `confirmInlineSetLocation` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1187` | Value for confirm Inline Set Location (module:dashboard). |
| 10 | `interface` | `ContextMenuVirtualElement` | `no better` | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts:15` | Type definition for Context Menu Virtual Element (shared). |
| 10 | `type` | `FileExplorerToggleOutcome` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:15` | Result/outcome type for File Explorer Toggle Outcome (shared). |
| 10 | `function` | `formatMissingFileDetails` | `no better` | `frontend/src\modules\dashboard\utils\missingFiles.ts:5` | Function for format Missing File Details (module:dashboard). |
| 10 | `const` | `handleHeaderContextMenu` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:57` | Event handler for Header Context Menu (module:dashboard). |
| 10 | `const` | `handleHeaderMenuAction` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:85` | Event handler for Header Menu Action (module:dashboard). |
| 10 | `const` | `handleInlineLocationChange` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1251` | Event handler for Inline Location Change (module:dashboard). |
| 10 | `const` | `handleSettingsPanelExpand` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentViewportViewModel.ts:40` | Event handler for Settings Panel Expand (module:torrent-add). |
| 10 | `const` | `normalizeColumnSizingState` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:15` | Value for normalize Column Sizing State (module:dashboard). |
| 10 | `const` | `setAddTorrentHistory` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:644` | Value for Add Torrent History (app). |
| 10 | `function` | `SetLocationInlineEditor` | `no better` | `frontend/src\modules\dashboard\components\SetLocationInlineEditor.tsx:17` | Function for Location Inline Editor (module:dashboard). |
| 10 | `const` | `setTorrentTableState` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:623` | Value for Torrent Table State (app). |
| 10 | `const` | `useTableAnimationGuard` | `no better` | `frontend/src\modules\dashboard\hooks\useTableAnimationGuard.ts:14` | Value for Table Animation Guard (module:dashboard). |
| 9 | `const` | `AddTorrentModalContext` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:75` | Context value for Add Torrent Modal Context (module:torrent-add). |
| 9 | `const` | `cancelInlineSetLocation` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1182` | Predicate/flag for cancel Inline Set Location (module:dashboard). |
| 9 | `const` | `clearDraftForTorrent` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1107` | Value for clear Draft For Torrent (module:dashboard). |
| 9 | `const` | `closeAddTorrentWindow` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:190` | Value for close Add Torrent Window (app). |
| 9 | `type` | `FileExplorerContextAction` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:8` | Type definition for File Explorer Context Action (shared). |
| 9 | `type` | `FileExplorerToggleCommand` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:23` | Type definition for File Explorer Toggle Command (shared). |
| 9 | `const` | `formatPrimaryActionHintFromClassification` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:258` | Value for format Primary Action Hint From Classification (shared). |
| 9 | `const` | `formatRecoveryStatusFromClassification` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:225` | Value for format Recovery Status From Classification (shared). |
| 9 | `const` | `handleColumnAutoFitRequest` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:214` | Event handler for Column Auto Fit Request (module:dashboard). |
| 9 | `const` | `hasBinaryPieceStates` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:104` | Predicate/flag for Binary Piece States (module:dashboard). |
| 9 | `const` | `headerMenuTriggerRect` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:701` | Value for header Menu Trigger Rect (module:dashboard). |
| 9 | `function` | `isValidDestinationForPolicy` | `no better` | `frontend/src\modules\torrent-add\utils\destination.ts:7` | Function for Valid Destination For Policy (module:torrent-add). |
| 9 | `const` | `marqueeBlockResetRef` | `no better` | `frontend/src\modules\dashboard\hooks\useMarqueeSelection.ts:40` | Ref for marquee Block Reset Ref (module:dashboard). |
| 9 | `type` | `MissingFilesStateKind` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:182` | Type definition for Missing Files State Kind (shared). |
| 9 | `const` | `probeMissingFilesIfStale` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:353` | Value for probe Missing Files If Stale (module:dashboard). |
| 9 | `const` | `recoveryModalViewModel` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:783` | Value for recovery Modal View Model (app). |
| 9 | `function` | `useAddTorrentController` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:67` | React hook for Add Torrent Controller (app). |
| 9 | `function` | `useAppShellState` | `no better` | `frontend/src\app\context\AppShellStateContext.tsx:104` | React hook for App Shell State (app). |
| 9 | `function` | `useEngineHeartbeatDomain` | `no better` | `frontend/src\app\providers\engineDomains.ts:144` | React hook for Engine Heartbeat Domain (app). |
| 9 | `function` | `useEngineSessionDomain` | `no better` | `frontend/src\app\providers\engineDomains.ts:62` | React hook for Engine Session Domain (app). |
| 9 | `function` | `useSpeedHistoryDomain` | `no better` | `frontend/src\shared\hooks\useSpeedHistoryDomain.ts:37` | React hook for Speed History Domain (shared). |
| 9 | `function` | `useUiModeCapabilities` | `no better` | `frontend/src\app\context\SessionContext.tsx:236` | React hook for Ui Mode Capabilities (app). |
| 9 | `interface` | `WorkspaceShellViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:138` | Type definition for Workspace Shell View Model (app). |
| 8 | `const` | `applyUserPreferencesPatch` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:354` | Value for apply User Preferences Patch (app). |
| 8 | `type` | `ComponentPropsWithoutRef` | `no better` | `frontend/src\shared\ui\layout\window-control-button.tsx:2` | Type definition for Component Props Without Ref (shared). |
| 8 | `type` | `EngineTestPortOutcome` | `no better` | `frontend/src\app\providers\engineDomains.ts:27` | Result/outcome type for Engine Test Port Outcome (app). |
| 8 | `type` | `FileExplorerFilterMode` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:38` | Type definition for File Explorer Filter Mode (shared). |
| 8 | `const` | `handleDestinationGateContinue` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:411` | Event handler for Destination Gate Continue (module:torrent-add). |
| 8 | `const` | `handleHeaderContainerContextMenu` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:71` | Event handler for Header Container Context Menu (module:dashboard). |
| 8 | `const` | `handleSettingsPanelCollapse` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentViewportViewModel.ts:36` | Event handler for Settings Panel Collapse (module:torrent-add). |
| 8 | `const` | `headerMenuHideLabel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:95` | Value for header Menu Hide Label (module:dashboard). |
| 8 | `const` | `isHeaderMenuHideEnabled` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:104` | Predicate/flag for Header Menu Hide Enabled (module:dashboard). |
| 8 | `const` | `recoveryAbortControllerRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:246` | Ref for recovery Abort Controller Ref (module:dashboard). |
| 8 | `interface` | `RecoveryInlineEditorControls` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:482` | Type definition for Recovery Inline Editor Controls (app). |
| 8 | `const` | `setColumnWidthVar` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:77` | Value for Column Width Var (module:dashboard). |
| 8 | `const` | `setTableTotalWidthVar` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:84` | Value for Table Total Width Var (module:dashboard). |
| 8 | `interface` | `TorrentTablePersistenceState` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:40` | Type definition for Torrent Table Persistence State (app). |
| 8 | `function` | `useAddTorrentModalContext` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:94` | React hook for Add Torrent Modal Context (module:torrent-add). |
| 8 | `function` | `useAppCommandContext` | `no better` | `frontend/src\app\context\AppCommandContext.tsx:55` | React hook for App Command Context (app). |
| 7 | `type` | `AddTorrentBrowseOutcome` | `no better` | `frontend/src\modules\torrent-add\types.ts:5` | Result/outcome type for Add Torrent Browse Outcome (module:torrent-add). |
| 7 | `interface` | `AppCommandContextValue` | `no better` | `frontend/src\app\context\AppCommandContext.tsx:34` | Type definition for App Command Context Value (app). |
| 7 | `function` | `buildUniqueTorrentOrder` | `no better` | `frontend/src\modules\dashboard\hooks\utils\torrent-order.ts:3` | Function for build Unique Torrent Order (module:dashboard). |
| 7 | `function` | `clearVerifyGuardEntry` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:155` | Function for clear Verify Guard Entry (services). |
| 7 | `const` | `dismissedHudCardSet` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:514` | Value for dismissed Hud Card Set (app). |
| 7 | `const` | `getColumnWidthCss` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Shared.tsx:27` | Value for Column Width Css (module:dashboard). |
| 7 | `const` | `getSurfaceCaptionKey` | `no better` | `frontend/src\app\utils\setLocation.ts:9` | Value for Surface Caption Key (app). |
| 7 | `type` | `HeartbeatClientWithTelemetry` | `no better` | `frontend/src\services\rpc\heartbeat.ts:57` | Type definition for Heartbeat Client With Telemetry (services). |
| 7 | `type` | `InlineSetLocationOutcome` | `no better` | `frontend/src\app\context\RecoveryContext.tsx:47` | Result/outcome type for Inline Set Location Outcome (app). |
| 7 | `const` | `isActionableRecoveryErrorClass` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:101` | Predicate/flag for Actionable Recovery Error Class (module:dashboard). |
| 7 | `const` | `isDestinationGateInvalidError` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:338` | Predicate/flag for Destination Gate Invalid Error (module:torrent-add). |
| 7 | `const` | `isDestinationGateRequiredError` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:336` | Predicate/flag for Destination Gate Required Error (module:torrent-add). |
| 7 | `const` | `isOpenFolderSuccess` | `no better` | `frontend/src\app\types\openFolder.ts:9` | Predicate/flag for Open Folder Success (app). |
| 7 | `const` | `pendingColumnResizeRef` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:36` | Ref for pending Column Resize Ref (module:dashboard). |
| 7 | `type` | `ReportReadErrorFn` | `no better` | `frontend/src\shared\types\rpc.ts:22` | Type definition for Report Read Error Fn (shared). |
| 7 | `const` | `setSpeedChartLayoutMode` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:630` | Value for Speed Chart Layout Mode (app). |
| 7 | `interface` | `UseAddTorrentControllerResult` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:48` | Result/outcome type for Use Add Torrent Controller Result (app). |
| 7 | `const` | `useContextMenuPosition` | `no better` | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts:26` | Value for Context Menu Position (shared). |
| 6 | `interface` | `AddTorrentDefaultsState` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:35` | Type definition for Add Torrent Defaults State (app). |
| 6 | `interface` | `AddTorrentModalContextValue` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:68` | Type definition for Add Torrent Modal Context Value (module:torrent-add). |
| 6 | `function` | `applySmartSelectCommand` | `no better` | `frontend/src\modules\torrent-add\services\fileSelection.ts:94` | Function for apply Smart Select Command (module:torrent-add). |
| 6 | `function` | `AppShellStateProvider` | `no better` | `frontend/src\app\context\AppShellStateContext.tsx:42` | Function for App Shell State Provider (app). |
| 6 | `const` | `buildRpcServerUrl` | `no better` | `frontend/src\app\context\connection\endpointAuthority.ts:71` | Value for build Rpc Server Url (app). |
| 6 | `type` | `ColumnDragCommitOutcome` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:39` | Result/outcome type for Column Drag Commit Outcome (module:dashboard). |
| 6 | `const` | `createGlobalHotkeyBindingsMock` | `no better` | `frontend/src\app\components\__tests__\GlobalHotkeysHost.test.ts:12` | Value for create Global Hotkey Bindings Mock (app). |
| 6 | `interface` | `FileExplorerTreeViewModel` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:28` | Type definition for File Explorer Tree View Model (shared). |
| 6 | `const` | `handleTorrentWindowConfirm` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:194` | Event handler for Torrent Window Confirm (app). |
| 6 | `const` | `isDiskSpaceCritical` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:369` | Predicate/flag for Disk Space Critical (module:torrent-add). |
| 6 | `const` | `isValidCommitMode` | `no better` | `frontend/src\app\hooks\useAddTorrentDefaults.ts:5` | Predicate/flag for Valid Commit Mode (app). |
| 6 | `const` | `jsonCopyTimerRef` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:159` | Ref for json Copy Timer Ref (module:settings). |
| 6 | `const` | `lastDownloadStartedAt` | `no better` | `frontend/src\services\rpc\normalizers.ts:194` | Value for last Download Started At (services). |
| 6 | `type` | `NativeShellRequestOutcome` | `no better` | `frontend/src\app\agents\shell-agent.ts:4` | Result/outcome type for Native Shell Request Outcome (app). |
| 6 | `let` | `nextGraceExpiryDelayMs` | `no better` | `frontend/src\app\hooks\useOptimisticStatuses.ts:147` | Value for next Grace Expiry Delay Ms (app). |
| 6 | `type` | `OptimisticToggleCommitOutcome` | `no better` | `frontend/src\shared\hooks\useOptimisticToggle.ts:3` | Result/outcome type for Optimistic Toggle Commit Outcome (shared). |
| 6 | `const` | `pendingRecoveryQueueRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:247` | Ref for pending Recovery Queue Ref (module:dashboard). |
| 6 | `const` | `resetColumnResizeState` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:169` | Value for reset Column Resize State (module:dashboard). |
| 6 | `const` | `resumeTorrentWithRecovery` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:779` | Value for resume Torrent With Recovery (module:dashboard). |
| 6 | `const` | `setMeasureLayerRef` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:719` | Ref for Measure Layer Ref (module:dashboard). |
| 6 | `const` | `setTableContainerRef` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:716` | Ref for Table Container Ref (module:dashboard). |
| 6 | `interface` | `SettingsFormActionsContextValue` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:23` | Type definition for Settings Form Actions Context Value (module:settings). |
| 6 | `interface` | `SettingsFormStateContextValue` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:12` | Type definition for Settings Form State Context Value (module:settings). |
| 6 | `type` | `StatusBarTransportStatus` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:181` | Type definition for Status Bar Transport Status (app). |
| 6 | `const` | `storedAddTorrentDefaults` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:335` | Value for stored Add Torrent Defaults (app). |
| 6 | `interface` | `TorrentTableBodyViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:106` | Type definition for Torrent Table Body View Model (module:dashboard). |
| 6 | `interface` | `TorrentTableHeaderMenuViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:158` | Type definition for Torrent Table Header Menu View Model (module:dashboard). |
| 6 | `interface` | `TorrentTableHeadersViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:81` | Type definition for Torrent Table Headers View Model (module:dashboard). |
| 6 | `interface` | `TorrentTableRowMenuViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:150` | Type definition for Torrent Table Row Menu View Model (module:dashboard). |
| 6 | `interface` | `TorrentTableViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:33` | Type definition for Torrent Table View Model (app). |
| 6 | `const` | `useTorrentTableInteractions` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableInteractions.ts:64` | Value for Torrent Table Interactions (module:dashboard). |
| 6 | `const` | `zTransmissionSessionSettings` | `no better` | `frontend/src\services\rpc\schemas.ts:392` | Schema for z Transmission Session Settings (services). |
| 5 | `function` | `AddTorrentDestinationGatePanel` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentDestinationGatePanel.tsx:23` | Function for Add Torrent Destination Gate Panel (module:torrent-add). |
| 5 | `type` | `AddTorrentFromFile` | `no better` | `frontend/src\app\intents\torrentIntents.ts:103` | Type definition for Add Torrent From File (app). |
| 5 | `function` | `AddTorrentModalContextProvider` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:79` | Function for Add Torrent Modal Context Provider (module:torrent-add). |
| 5 | `const` | `applyPendingResizeCss` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:47` | Value for apply Pending Resize Css (module:dashboard). |
| 5 | `type` | `BufferedInputCommitOutcome` | `no better` | `frontend/src\modules\settings\components\SettingsBlockRenderers.tsx:21` | Result/outcome type for Buffered Input Commit Outcome (module:settings). |
| 5 | `const` | `commitColumnDragOrder` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:514` | Value for commit Column Drag Order (module:dashboard). |
| 5 | `interface` | `DeleteConfirmationContextValue` | `no better` | `frontend/src\modules\torrent-remove\context\DeleteConfirmationContext.tsx:10` | Type definition for Delete Confirmation Context Value (module:torrent-remove). |
| 5 | `type` | `DispatchIntentByType` | `no better` | `frontend/src\app\actions\torrentDispatch.ts:46` | Type definition for Dispatch Intent By Type (app). |
| 5 | `const` | `downMaxRefLocal` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx:376` | Value for down Max Ref Local (module:dashboard). |
| 5 | `const` | `FileExplorerTreeRow` | `no better` | `frontend/src\shared\ui\workspace\FileExplorerTreeRow.tsx:60` | Value for File Explorer Tree Row (shared). |
| 5 | `const` | `handleDestinationInputBlur` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:427` | Event handler for Destination Input Blur (module:torrent-add). |
| 5 | `const` | `handleDestinationInputKeyDown` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:444` | Event handler for Destination Input Key Down (module:torrent-add). |
| 5 | `const` | `handleFormKeyDown` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:543` | Event handler for Form Key Down (module:torrent-add). |
| 5 | `const` | `handleMagnetModalClose` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:132` | Event handler for Magnet Modal Close (app). |
| 5 | `const` | `handleSuperSeedingToggle` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailControls.ts:93` | Event handler for Super Seeding Toggle (module:dashboard). |
| 5 | `const` | `hasKnownFreeSpace` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:53` | Predicate/flag for Known Free Space (module:torrent-add). |
| 5 | `const` | `headerMenuViewModel` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:879` | Value for header Menu View Model (module:dashboard). |
| 5 | `type` | `InternalOptimisticStatusMap` | `no better` | `frontend/src\app\hooks\useOptimisticStatuses.ts:15` | Type definition for Internal Optimistic Status Map (app). |
| 5 | `const` | `isDetailFullscreenActive` | `no better` | `frontend/src\modules\dashboard\components\Dashboard_Layout.tsx:73` | Predicate/flag for Detail Fullscreen Active (module:dashboard). |
| 5 | `const` | `numericBaseMenuMargin` | `no better` | `frontend/src\shared\hooks\useLayoutMetrics.ts:52` | Value for numeric Base Menu Margin (shared). |
| 5 | `const` | `numericBaseMenuWidth` | `no better` | `frontend/src\shared\hooks\useLayoutMetrics.ts:48` | Value for numeric Base Menu Width (shared). |
| 5 | `const` | `onDiscardAndClose` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:735` | Value for on Discard And Close (module:settings). |
| 5 | `const` | `recentlyRemovedKeysRef` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:112` | Ref for recently Removed Keys Ref (app). |
| 5 | `type` | `ReportCommandErrorFn` | `no better` | `frontend/src\shared\types\rpc.ts:21` | Type definition for Report Command Error Fn (shared). |
| 5 | `const` | `resolveRecheckRefreshOutcome` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:254` | Value for resolve Recheck Refresh Outcome (app). |
| 5 | `const` | `runActionsWithOptimism` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:207` | Value for run Actions With Optimism (app). |
| 5 | `const` | `runMissingFilesFlow` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:284` | Value for run Missing Files Flow (module:dashboard). |
| 5 | `const` | `saveDraftForTorrent` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1099` | Value for save Draft For Torrent (module:dashboard). |
| 5 | `function` | `SessionSpeedHistoryProvider` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:97` | Function for Session Speed History Provider (shared). |
| 5 | `const` | `setLocationAndRecover` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:962` | Value for Location And Recover (module:dashboard). |
| 5 | `const` | `setTableCssVar` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:68` | Value for Table Css Var (module:dashboard). |
| 5 | `function` | `SpeedHistoryDomainProvider` | `no better` | `frontend/src\shared\hooks\useSpeedHistoryDomain.ts:17` | Function for Speed History Domain Provider (shared). |
| 5 | `const` | `upMaxRefLocal` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx:377` | Value for up Max Ref Local (module:dashboard). |
| 5 | `function` | `useAddModalState` | `no better` | `frontend/src\app\hooks\useAddModalState.ts:19` | React hook for Add Modal State (app). |
| 5 | `function` | `useAddTorrentDefaults` | `no better` | `frontend/src\app\hooks\useAddTorrentDefaults.ts:13` | React hook for Add Torrent Defaults (app). |
| 5 | `const` | `useColumnSizingController` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:48` | Value for Column Sizing Controller (module:dashboard). |
| 5 | `function` | `useGlobalHotkeyContext` | `no better` | `frontend/src\app\context\GlobalHotkeyContext.tsx:29` | React hook for Global Hotkey Context (app). |
| 5 | `function` | `useMissingFilesClassification` | `no better` | `frontend/src\services\recovery\missingFilesStore.ts:67` | React hook for Missing Files Classification (services). |
| 5 | `function` | `useMissingFilesProbe` | `no better` | `frontend/src\services\recovery\missingFilesStore.ts:107` | React hook for Missing Files Probe (services). |
| 5 | `const` | `useQueueReorderController` | `no better` | `frontend/src\modules\dashboard\hooks\useQueueReorderController.ts:24` | Value for Queue Reorder Controller (module:dashboard). |
| 5 | `const` | `useRowSelectionController` | `no better` | `frontend/src\modules\dashboard\hooks\useRowSelectionController.ts:36` | Value for Row Selection Controller (module:dashboard). |
| 5 | `const` | `useSessionSpeedHistory` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:134` | Value for Session Speed History (shared). |
| 5 | `function` | `useSettingsModalController` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:116` | React hook for Settings Modal Controller (module:settings). |
| 5 | `const` | `useTorrentRowDrag` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts:28` | Value for Torrent Row Drag (module:dashboard). |
| 5 | `const` | `useTorrentTableContextActions` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableContextActions.ts:55` | Value for Torrent Table Context Actions (module:dashboard). |
| 5 | `const` | `useTorrentTableHeaderContext` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:44` | Context value for Torrent Table Header Context (module:dashboard). |
| 5 | `const` | `useTorrentTableKeyboard` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableKeyboard.ts:23` | Value for Torrent Table Keyboard (module:dashboard). |
| 5 | `const` | `useTorrentTablePersistence` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTablePersistence.ts:17` | Value for Torrent Table Persistence (module:dashboard). |
| 5 | `function` | `useTorrentTableViewModel` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:150` | React hook for Torrent Table View Model (module:dashboard). |
| 5 | `const` | `useTorrentTableVirtualization` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableVirtualization.ts:57` | Value for Torrent Table Virtualization (module:dashboard). |
| 5 | `const` | `volumeLossPollingRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:248` | Ref for volume Loss Polling Ref (module:dashboard). |
| 5 | `const` | `zSessionStatsTotals` | `no better` | `frontend/src\services\rpc\schemas.ts:296` | Schema for z Session Stats Totals (services). |
| 5 | `const` | `zTransmissionTorrentArray` | `no better` | `frontend/src\services\rpc\schemas.ts:528` | Schema for z Transmission Torrent Array (services). |
| 4 | `const` | `activeDetailIdRef` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetail.ts:40` | Ref for active Detail Id Ref (module:dashboard). |
| 4 | `const` | `AddTorrentFileTable` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentFileTable.tsx:24` | Value for Add Torrent File Table (module:torrent-add). |
| 4 | `function` | `AddTorrentSettingsPanel` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentSettingsPanel.tsx:35` | Function for Add Torrent Settings Panel (module:torrent-add). |
| 4 | `const` | `applyPreferencesToConfig` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:32` | Value for apply Preferences To Config (app). |
| 4 | `interface` | `AppShellStateContextValue` | `no better` | `frontend/src\app\context\AppShellStateContext.tsx:25` | Type definition for App Shell State Context Value (app). |
| 4 | `const` | `buildSplinePathFromPoints` | `no better` | `frontend/src\shared\utils\spline.ts:29` | Value for build Spline Path From Points (shared). |
| 4 | `const` | `canTriggerOpenFolder` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Content.tsx:77` | Predicate/flag for Trigger Open Folder (module:dashboard). |
| 4 | `const` | `clampContextMenuPosition` | `no better` | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts:31` | Value for clamp Context Menu Position (shared). |
| 4 | `const` | `classicHandleHitArea` | `no better` | `frontend/src\config\logic.ts:132` | Value for classic Handle Hit Area (frontend). |
| 4 | `const` | `clearClassificationOverrideIfPresent` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:117` | Value for clear Classification Override If Present (module:dashboard). |
| 4 | `function` | `createGlobalHotkeyBindings` | `no better` | `frontend/src\app\commandRegistry.ts:298` | Function for create Global Hotkey Bindings (app). |
| 4 | `const` | `createRecoveryQueueEntry` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:435` | Value for create Recovery Queue Entry (module:dashboard). |
| 4 | `interface` | `DetailOpenContextValue` | `no better` | `frontend/src\modules\dashboard\context\DetailOpenContext.tsx:11` | Type definition for Detail Open Context Value (module:dashboard). |
| 4 | `interface` | `FileExplorerViewModel` | `no better` | `frontend/src\modules\dashboard\viewModels\useFileExplorerViewModel.ts:12` | Type definition for File Explorer View Model (module:dashboard). |
| 4 | `const` | `findPieceAtPoint` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:175` | Value for find Piece At Point (module:dashboard). |
| 4 | `const` | `fitCanvasToContainer` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:49` | Value for fit Canvas To Container (module:dashboard). |
| 4 | `const` | `getColumnWidthVarName` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Shared.tsx:24` | Value for Column Width Var Name (module:dashboard). |
| 4 | `const` | `getEmphasisClassForAction` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:150` | Value for Emphasis Class For Action (shared). |
| 4 | `interface` | `GlobalHotkeyContextValue` | `no better` | `frontend/src\app\context\GlobalHotkeyContext.tsx:5` | Type definition for Global Hotkey Context Value (app). |
| 4 | `const` | `handleRecoveryAutoRetry` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:910` | Event handler for Recovery Auto Retry (module:dashboard). |
| 4 | `const` | `handleRecoveryRecreateFolder` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:917` | Event handler for Recovery Recreate Folder (module:dashboard). |
| 4 | `type` | `HeaderMenuActionOptions` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:26` | Type definition for Header Menu Action Options (module:dashboard). |
| 4 | `function` | `isClipboardWriteSupported` | `no better` | `frontend/src\shared\utils\clipboard.ts:1` | Function for Clipboard Write Supported (shared). |
| 4 | `type` | `NativeShellEventName` | `no better` | `frontend/src\app\runtime.ts:24` | Type definition for Native Shell Event Name (app). |
| 4 | `const` | `onToggleStartStop` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts:150` | Value for on Toggle Start Stop (module:dashboard). |
| 4 | `interface` | `PiecesMapViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:45` | Type definition for Pieces Map View Model (module:dashboard). |
| 4 | `function` | `resetRecoveryAutomationRuntimeState` | `no better` | `frontend/src\services\rpc\recoveryAutomation.ts:10` | Function for reset Recovery Automation Runtime State (services). |
| 4 | `function` | `resetTransportSessionRuntimeOwner` | `no better` | `frontend/src\services\transport.ts:49` | Function for reset Transport Session Runtime Owner (services). |
| 4 | `const` | `rpcCheckFreeSpace` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:149` | Value for rpc Check Free Space (app). |
| 4 | `const` | `runtimeIsNativeHost` | `no better` | `frontend/src\app\runtime.ts:305` | Value for runtime Is Native Host (app). |
| 4 | `const` | `SettingsFormActionsContext` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:41` | Context value for Settings Form Actions Context (module:settings). |
| 4 | `const` | `SettingsFormStateContext` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:39` | Context value for Settings Form State Context (module:settings). |
| 4 | `const` | `showMissingFilesError` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts:114` | Value for show Missing Files Error (module:dashboard). |
| 4 | `type` | `SystemIntegrationReadOutcome` | `no better` | `frontend/src\app\agents\shell-agent.ts:18` | Result/outcome type for System Integration Read Outcome (app). |
| 4 | `const` | `targetFocusRowRef` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:143` | Ref for target Focus Row Ref (module:dashboard). |
| 4 | `interface` | `TransmissionTorrentFileStat` | `no better` | `frontend/src\services\rpc\types.ts:38` | Type definition for Transmission Torrent File Stat (services). |
| 4 | `const` | `transportSessionRuntimeByKey` | `no better` | `frontend/src\services\transport.ts:35` | Value for transport Session Runtime By Key (services). |
| 4 | `function` | `useAddTorrentDestinationViewModel` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentDestinationViewModel.ts:36` | React hook for Add Torrent Destination View Model (module:torrent-add). |
| 4 | `function` | `useAddTorrentFileSelectionViewModel` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentFileSelectionViewModel.ts:38` | React hook for Add Torrent File Selection View Model (module:torrent-add). |
| 4 | `function` | `useAddTorrentModalViewModel` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:164` | React hook for Add Torrent Modal View Model (module:torrent-add). |
| 4 | `function` | `useAddTorrentViewportViewModel` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentViewportViewModel.ts:15` | React hook for Add Torrent Viewport View Model (module:torrent-add). |
| 4 | `function` | `useConnectionProfileStore` | `no better` | `frontend/src\app\context\connection\useConnectionProfileStore.ts:30` | React hook for Connection Profile Store (app). |
| 4 | `function` | `useDeleteConfirmationContextOptional` | `no better` | `frontend/src\modules\torrent-remove\context\DeleteConfirmationContext.tsx:37` | React hook for Delete Confirmation Context Optional (module:torrent-remove). |
| 4 | `const` | `useEngineSpeedHistory` | `no better` | `frontend/src\shared\hooks\useEngineSpeedHistory.ts:5` | Value for Engine Speed History (shared). |
| 4 | `const` | `useFileExplorerTreeState` | `no better` | `frontend/src\shared\ui\workspace\useFileExplorerTreeState.ts:13` | Value for File Explorer Tree State (shared). |
| 4 | `function` | `useFileExplorerViewModel` | `no better` | `frontend/src\modules\dashboard\viewModels\useFileExplorerViewModel.ts:18` | React hook for File Explorer View Model (module:dashboard). |
| 4 | `const` | `useFocusStateMock` | `no better` | `frontend/src\app\components\__tests__\GlobalHotkeysHost.test.ts:9` | Value for Focus State Mock (app). |
| 4 | `function` | `useFreeSpaceProbe` | `no better` | `frontend/src\modules\torrent-add\hooks\useFreeSpaceProbe.ts:10` | React hook for Free Space Probe (module:torrent-add). |
| 4 | `const` | `useGlobalHotkeyContextMock` | `no better` | `frontend/src\app\components\__tests__\GlobalHotkeysHost.test.ts:11` | Value for Global Hotkey Context Mock (app). |
| 4 | `function` | `useOpenTorrentFolder` | `no better` | `frontend/src\app\hooks\useOpenTorrentFolder.ts:35` | React hook for Open Torrent Folder (app). |
| 4 | `function` | `usePiecesMapViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:68` | React hook for Pieces Map View Model (module:dashboard). |
| 4 | `const` | `useSessionSpeedHistoryStore` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:112` | Value for Session Speed History Store (shared). |
| 4 | `const` | `useTorrentCommandsMock` | `no better` | `frontend/src\app\components\__tests__\GlobalHotkeysHost.test.ts:10` | Value for Torrent Commands Mock (app). |
| 4 | `function` | `useTorrentDetailHeaderStatus` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailHeaderStatus.ts:26` | React hook for Torrent Detail Header Status (module:dashboard). |
| 4 | `function` | `useTorrentDetailsGeneralViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts:58` | React hook for Torrent Details General View Model (module:dashboard). |
| 4 | `const` | `useTorrentDetailsPeersViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts:96` | Value for Torrent Details Peers View Model (module:dashboard). |
| 4 | `const` | `useTorrentDetailsTrackersViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsTrackersViewModel.ts:73` | Value for Torrent Details Trackers View Model (module:dashboard). |
| 4 | `const` | `useTorrentSpeedHistory` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentSpeedHistory.ts:8` | Value for Torrent Speed History (module:dashboard). |
| 4 | `function` | `useTorrentTableColumns` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableColumns.tsx:15` | React hook for Torrent Table Columns (module:dashboard). |
| 4 | `function` | `useWorkspaceShellViewModel` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:123` | React hook for Workspace Shell View Model (app). |
| 4 | `interface` | `WorkspaceCommandPaletteViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:133` | Type definition for Workspace Command Palette View Model (app). |
| 4 | `interface` | `WorkspaceDeletionViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:125` | Type definition for Workspace Deletion View Model (app). |
| 4 | `interface` | `WorkspaceDragAndDropViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:108` | Type definition for Workspace Drag And Drop View Model (app). |
| 4 | `interface` | `WorkspaceHudViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:119` | Type definition for Workspace Hud View Model (app). |
| 4 | `const` | `zSessionStatsRaw` | `no better` | `frontend/src\services\rpc\schemas.ts:306` | Schema for z Session Stats Raw (services). |
| 4 | `const` | `zTransmissionFreeSpace` | `no better` | `frontend/src\services\rpc\schemas.ts:437` | Schema for z Transmission Free Space (services). |
| 3 | `function` | `applyCssTokenBases` | `no better` | `frontend/src\config\logic.ts:388` | Function for apply Css Token Bases (frontend). |
| 3 | `const` | `applyNativeEndpointOverride` | `no better` | `frontend/src\app\context\connection\nativeProfileOverride.ts:71` | Value for apply Native Endpoint Override (app). |
| 3 | `type` | `BasePaletteCommandId` | `no better` | `frontend/src\app\commandCatalog.ts:83` | Type definition for Base Palette Command Id (app). |
| 3 | `function` | `buildCommandPaletteActions` | `no better` | `frontend/src\app\commandRegistry.ts:89` | Function for build Command Palette Actions (app). |
| 3 | `function` | `buildContextCommandActions` | `no better` | `frontend/src\app\commandRegistry.ts:135` | Function for build Context Command Actions (app). |
| 3 | `const` | `buildPieceGridRows` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:27` | Value for build Piece Grid Rows (module:dashboard). |
| 3 | `const` | `canFetchSessionSettings` | `no better` | `frontend/src\app\providers\engineDomains.ts:72` | Predicate/flag for Fetch Session Settings (app). |
| 3 | `const` | `canUpdateSessionSettings` | `no better` | `frontend/src\app\providers\engineDomains.ts:74` | Predicate/flag for Update Session Settings (app). |
| 3 | `interface` | `ClampContextMenuOptions` | `no better` | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts:4` | Type definition for Clamp Context Menu Options (shared). |
| 3 | `const` | `clearAllGhostTimers` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:272` | Value for clear All Ghost Timers (module:dashboard). |
| 3 | `const` | `computeBucketsFromWidth` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx:167` | Value for compute Buckets From Width (module:dashboard). |
| 3 | `const` | `computePieceMapGeometry` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:99` | Value for compute Piece Map Geometry (module:dashboard). |
| 3 | `const` | `configKeyInputTypes` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:181` | Value for config Key Input Types (module:settings). |
| 3 | `const` | `createCommandContextValue` | `no better` | `frontend/src\app\context\__tests__\AppCommandContext.test.ts:19` | Context value for create Command Context Value (app). |
| 3 | `const` | `createSessionSpeedHistoryStore` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:91` | Value for create Session Speed History Store (shared). |
| 3 | `const` | `createSpeedHistoryStore` | `no better` | `frontend/src\shared\hooks\speedHistoryStore.ts:144` | Value for create Speed History Store (shared). |
| 3 | `const` | `deriveMissingFilesStateKind` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:188` | Value for derive Missing Files State Kind (shared). |
| 3 | `function` | `deriveReasonFromFsError` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:874` | Function for derive Reason From Fs Error (services). |
| 3 | `const` | `detectNativeEndpointOverride` | `no better` | `frontend/src\app\context\connection\nativeProfileOverride.ts:18` | Value for detect Native Endpoint Override (app). |
| 3 | `function` | `dispatchTorrentSelectionAction` | `no better` | `frontend/src\app\utils\torrentActionDispatcher.ts:128` | Function for dispatch Torrent Selection Action (app). |
| 3 | `const` | `dragStartFocusRef` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:147` | Ref for drag Start Focus Ref (module:dashboard). |
| 3 | `type` | `EnsureTorrentAtLocation` | `no better` | `frontend/src\app\intents\torrentIntents.ts:33` | Type definition for Ensure Torrent At Location (app). |
| 3 | `type` | `EnsureTorrentDataPresent` | `no better` | `frontend/src\app\intents\torrentIntents.ts:40` | Type definition for Ensure Torrent Data Present (app). |
| 3 | `function` | `extractPathFromResponse` | `no better` | `frontend/src\app\runtime.ts:294` | Function for extract Path From Response (app). |
| 3 | `interface` | `FileNodeRowViewModel` | `no better` | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts:54` | Type definition for File Node Row View Model (shared). |
| 3 | `const` | `fileSizesByIndex` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentFileSelectionViewModel.ts:65` | Value for file Sizes By Index (module:torrent-add). |
| 3 | `const` | `formatPrimaryActionHint` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:139` | Value for format Primary Action Hint (shared). |
| 3 | `const` | `formatRecoveryTooltipFromClassification` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:251` | Value for format Recovery Tooltip From Classification (shared). |
| 3 | `type` | `FreeSpaceProbeState` | `no better` | `frontend/src\modules\torrent-add\hooks\useFreeSpaceProbe.ts:4` | Type definition for Free Space Probe State (module:torrent-add). |
| 3 | `function` | `getAddTorrentDestinationStatus` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:38` | Function for Add Torrent Destination Status (module:torrent-add). |
| 3 | `const` | `getDraftPathForTorrent` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1091` | Value for Draft Path For Torrent (module:dashboard). |
| 3 | `const` | `getOptimisticStateForAction` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:186` | Value for Optimistic State For Action (app). |
| 3 | `const` | `getPeerIdentitySeed` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Peers_Map.tsx:110` | Value for Peer Identity Seed (module:dashboard). |
| 3 | `function` | `getPrimaryTorrentForAction` | `no better` | `frontend/src\app\commandRegistry.ts:288` | Function for Primary Torrent For Action (app). |
| 3 | `const` | `getTorrentByKey` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1112` | Value for Torrent By Key (module:dashboard). |
| 3 | `interface` | `GlobalHotkeyStateSnapshot` | `no better` | `frontend/src\app\commandRegistry.ts:260` | Type definition for Global Hotkey State Snapshot (app). |
| 3 | `const` | `handleCopyConfigJson` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:242` | Event handler for Copy Config Json (module:settings). |
| 3 | `const` | `handleDropTargetChange` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:705` | Event handler for Drop Target Change (module:dashboard). |
| 3 | `const` | `handleEnsureSelectionActive` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:482` | Event handler for Ensure Selection Active (app). |
| 3 | `const` | `handleEnsureSelectionPaused` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:486` | Event handler for Ensure Selection Paused (app). |
| 3 | `const` | `handleEnsureSelectionRemoved` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:494` | Event handler for Ensure Selection Removed (app). |
| 3 | `const` | `handleEnsureSelectionValid` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:490` | Event handler for Ensure Selection Valid (app). |
| 3 | `const` | `handleFileContextAction` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentFileTable.tsx:80` | Event handler for File Context Action (module:torrent-add). |
| 3 | `const` | `handleRowDoubleClick` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:569` | Event handler for Row Double Click (module:dashboard). |
| 3 | `const` | `handleSetDownloadPath` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:253` | Event handler for Set Download Path (module:dashboard). |
| 3 | `const` | `handleTestPortAction` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:454` | Event handler for Test Port Action (module:settings). |
| 3 | `type` | `HeaderContextMenuState` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:8` | Type definition for Header Context Menu State (module:dashboard). |
| 3 | `const` | `inlineIntentCounterRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1048` | Ref for inline Intent Counter Ref (module:dashboard). |
| 3 | `const` | `isConnectionProfileValue` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:208` | Predicate/flag for Connection Profile Value (app). |
| 3 | `const` | `isDetailTabValue` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:190` | Predicate/flag for Detail Tab Value (app). |
| 3 | `function` | `isFileAccessError` | `no better` | `frontend/src\modules\torrent-add\services\add-torrent-errors.ts:20` | Function for File Access Error (module:torrent-add). |
| 3 | `const` | `isSpeedChartLayoutMode` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:198` | Predicate/flag for Speed Chart Layout Mode (app). |
| 3 | `function` | `isTerminalErrorState` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:632` | Function for Terminal Error State (services). |
| 3 | `const` | `lastActiveRowIdRef` | `no better` | `frontend/src\modules\dashboard\hooks\useRowSelectionController.ts:161` | Ref for last Active Row Id Ref (module:dashboard). |
| 3 | `const` | `lastHandledMagnetRef` | `no better` | `frontend/src\app\hooks\useAddModalState.ts:23` | Ref for last Handled Magnet Ref (app). |
| 3 | `type` | `LiveUserPreferencePatch` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:32` | Type definition for Live User Preference Patch (module:settings). |
| 3 | `const` | `minutesToTimeString` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:18` | Value for minutes To Time String (app). |
| 3 | `type` | `NativeShellEventMessage` | `no better` | `frontend/src\app\runtime.ts:26` | Type definition for Native Shell Event Message (app). |
| 3 | `type` | `NativeShellEventPayload` | `no better` | `frontend/src\app\runtime.ts:4` | Type definition for Native Shell Event Payload (app). |
| 3 | `type` | `NativeShellRequestMessage` | `no better` | `frontend/src\app\runtime.ts:9` | Type definition for Native Shell Request Message (app). |
| 3 | `type` | `NativeShellResponseMessage` | `no better` | `frontend/src\app\runtime.ts:16` | Type definition for Native Shell Response Message (app). |
| 3 | `function` | `normalizePathForComparison` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:287` | Function for normalize Path For Comparison (services). |
| 3 | `const` | `openInlineSetLocationState` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1145` | Value for open Inline Set Location State (module:dashboard). |
| 3 | `const` | `openManualEditorForTorrent` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1304` | Value for open Manual Editor For Torrent (module:dashboard). |
| 3 | `type` | `PeerContextMenuState` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts:17` | Type definition for Peer Context Menu State (module:dashboard). |
| 3 | `interface` | `PeerRowViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts:47` | Type definition for Peer Row View Model (module:dashboard). |
| 3 | `const` | `processNextRecoveryQueueEntry` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:428` | Value for process Next Recovery Queue Entry (module:dashboard). |
| 3 | `function` | `pruneMissingFilesStore` | `no better` | `frontend/src\services\recovery\missingFilesStore.ts:84` | Function for prune Missing Files Store (services). |
| 3 | `const` | `renderModeLayoutSection` | `no better` | `frontend/src\app\components\WorkspaceShell.tsx:76` | Value for render Mode Layout Section (app). |
| 3 | `const` | `renderStatusBarSection` | `no better` | `frontend/src\app\components\WorkspaceShell.tsx:80` | Value for render Status Bar Section (app). |
| 3 | `function` | `resetMissingFilesStore` | `no better` | `frontend/src\services\recovery\missingFilesStore.ts:78` | Function for reset Missing Files Store (services). |
| 3 | `function` | `resetNativeBridgePendingRequests` | `no better` | `frontend/src\app\runtime.ts:189` | Function for reset Native Bridge Pending Requests (app). |
| 3 | `function` | `resetNormalizerRuntimeState` | `no better` | `frontend/src\services\rpc\normalizers.ts:73` | Function for reset Normalizer Runtime State (services). |
| 3 | `function` | `resetRecoveryControllerState` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:179` | Function for reset Recovery Controller State (services). |
| 3 | `const` | `resolvedDefaultDeleteData` | `no better` | `frontend/src\modules\torrent-remove\components\RemoveConfirmationModal.tsx:50` | Value for resolved Default Delete Data (module:torrent-remove). |
| 3 | `const` | `resolveHostAndPort` | `no better` | `frontend/src\app\context\connection\endpointAuthority.ts:54` | Value for resolve Host And Port (app). |
| 3 | `const` | `scheduleResizeCssUpdate` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnResizing.ts:54` | Value for schedule Resize Css Update (module:dashboard). |
| 3 | `const` | `selectedTorrentIdsSet` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:98` | Value for selected Torrent Ids Set (app). |
| 3 | `function` | `sendBridgeRequestOutcome` | `no better` | `frontend/src\app\runtime.ts:200` | Function for send Bridge Request Outcome (app). |
| 3 | `const` | `SessionSpeedHistoryContext` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:94` | Context value for Session Speed History Context (shared). |
| 3 | `type` | `SetTorrentFilesWanted` | `no better` | `frontend/src\app\intents\torrentIntents.ts:77` | Type definition for Set Torrent Files Wanted (app). |
| 3 | `type` | `SetTorrentSequentialDownload` | `no better` | `frontend/src\app\intents\torrentIntents.ts:84` | Type definition for Set Torrent Sequential Download (app). |
| 3 | `type` | `SetTorrentSuperSeeding` | `no better` | `frontend/src\app\intents\torrentIntents.ts:90` | Type definition for Set Torrent Super Seeding (app). |
| 3 | `const` | `shouldApplyNativeEndpointOverride` | `no better` | `frontend/src\app\context\connection\nativeProfileOverride.ts:48` | Predicate/flag for Apply Native Endpoint Override (app). |
| 3 | `const` | `shouldShowInlineEditor` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:150` | Predicate/flag for Show Inline Editor (module:dashboard). |
| 3 | `const` | `shouldShowOpenFolder` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:139` | Predicate/flag for Show Open Folder (module:dashboard). |
| 3 | `const` | `SpeedHistoryDomainContext` | `no better` | `frontend/src\shared\hooks\useSpeedHistoryDomain.ts:15` | Context value for Speed History Domain Context (shared). |
| 3 | `const` | `timeStringToMinutes` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:24` | Value for time String To Minutes (app). |
| 3 | `const` | `tooSmallForDetail` | `no better` | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts:197` | Value for too Small For Detail (module:dashboard). |
| 3 | `interface` | `TorrentDetailTabSurfaces` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailTabs.ts:105` | Type definition for Torrent Detail Tab Surfaces (module:dashboard). |
| 3 | `interface` | `TorrentTableRowInteractionViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:48` | Type definition for Torrent Table Row Interaction View Model (module:dashboard). |
| 3 | `interface` | `TorrentTableRowProps` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:71` | Props type for Torrent Table Row Props (module:dashboard). |
| 3 | `interface` | `TorrentTableRowStateViewModel` | `no better` | `frontend/src\modules\dashboard\types\torrentTableSurfaces.ts:60` | Type definition for Torrent Table Row State View Model (module:dashboard). |
| 3 | `interface` | `TrackerRowViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsTrackersViewModel.ts:13` | Type definition for Tracker Row View Model (module:dashboard). |
| 3 | `interface` | `TransmissionBandwidthGroupOptions` | `no better` | `frontend/src\services\rpc\types.ts:154` | Type definition for Transmission Bandwidth Group Options (services). |
| 3 | `interface` | `TransmissionSessionStatsTotals` | `no better` | `frontend/src\services\rpc\types.ts:135` | Type definition for Transmission Session Stats Totals (services). |
| 3 | `interface` | `TransmissionTorrentRenameResult` | `no better` | `frontend/src\services\rpc\types.ts:163` | Result/outcome type for Transmission Torrent Rename Result (services). |
| 3 | `const` | `tryAcquireInlineOwner` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:1289` | Value for try Acquire Inline Owner (module:dashboard). |
| 3 | `function` | `useAddMagnetModalProps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:832` | React hook for Add Magnet Modal Props (app). |
| 3 | `function` | `useAddTorrentModalProps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:861` | React hook for Add Torrent Modal Props (app). |
| 3 | `function` | `useDashboardViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:79` | React hook for Dashboard View Model (app). |
| 3 | `function` | `useDeletionViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:393` | React hook for Deletion View Model (app). |
| 3 | `function` | `useDetailOpenContext` | `no better` | `frontend/src\modules\dashboard\context\DetailOpenContext.tsx:36` | React hook for Detail Open Context (module:dashboard). |
| 3 | `function` | `useHudViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:370` | React hook for Hud View Model (app). |
| 3 | `const` | `useMeasuredColumnWidths` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_ColumnMeasurement.tsx:22` | Value for Measured Column Widths (module:dashboard). |
| 3 | `function` | `useNavbarViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:234` | React hook for Navbar View Model (app). |
| 3 | `function` | `useRecoveryContextModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:512` | React hook for Recovery Context Model (app). |
| 3 | `function` | `useRecoveryModalViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:614` | React hook for Recovery Modal View Model (app). |
| 3 | `const` | `useSessionSpeedHistoryFeed` | `no better` | `frontend/src\shared\hooks\useSessionSpeedHistory.ts:122` | Value for Session Speed History Feed (shared). |
| 3 | `function` | `useSettingsModalViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:309` | React hook for Settings Modal View Model (app). |
| 3 | `function` | `useStatusBarViewModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:178` | React hook for Status Bar View Model (app). |
| 3 | `const` | `useTorrentDetailTabCoordinator` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailTabs.ts:163` | Value for Torrent Detail Tab Coordinator (module:dashboard). |
| 3 | `function` | `useWorkspaceShellModel` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:440` | React hook for Workspace Shell Model (app). |
| 3 | `const` | `waitForActiveState` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:757` | Value for wait For Active State (module:dashboard). |
| 3 | `const` | `wasOpenForResetRef` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:186` | Ref for was Open For Reset Ref (module:torrent-add). |
| 3 | `type` | `WindowControlButtonVariant` | `no better` | `frontend/src\shared\ui\layout\window-control-button.tsx:11` | Type definition for Window Control Button Variant (shared). |
| 3 | `const` | `zTorrentDetailResponse` | `no better` | `frontend/src\services\rpc\schemas.ts:289` | Schema for z Torrent Detail Response (services). |
| 3 | `const` | `zTorrentListResponse` | `no better` | `frontend/src\services\rpc\schemas.ts:282` | Schema for z Torrent List Response (services). |
| 3 | `const` | `zTransmissionAddTorrentResponse` | `no better` | `frontend/src\services\rpc\schemas.ts:241` | Schema for z Transmission Add Torrent Response (services). |
| 3 | `const` | `zTransmissionRecentlyActiveResponse` | `no better` | `frontend/src\services\rpc\schemas.ts:532` | Schema for z Transmission Recently Active Response (services). |
| 3 | `const` | `zTransmissionTorrentDetail` | `no better` | `frontend/src\services\rpc\schemas.ts:260` | Schema for z Transmission Torrent Detail (services). |
| 3 | `const` | `zTransmissionTorrentDetailSingle` | `no better` | `frontend/src\services\rpc\schemas.ts:543` | Schema for z Transmission Torrent Detail Single (services). |
| 3 | `const` | `zTransmissionTorrentRenameResult` | `no better` | `frontend/src\services\rpc\schemas.ts:556` | Schema for z Transmission Torrent Rename Result (services). |
| 2 | `interface` | `AddMagnetModalPropsDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:825` | Type definition for Add Magnet Modal Props Deps (app). |
| 2 | `const` | `addTorrentCheckFreeSpace` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:148` | Value for add Torrent Check Free Space (app). |
| 2 | `interface` | `AddTorrentDestinationGateState` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:25` | Type definition for Add Torrent Destination Gate State (module:torrent-add). |
| 2 | `interface` | `AddTorrentDestinationInputState` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:18` | Type definition for Add Torrent Destination Input State (module:torrent-add). |
| 2 | `interface` | `AddTorrentDestinationStatusParams` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:10` | Parameter type for Add Torrent Destination Status Params (module:torrent-add). |
| 2 | `interface` | `AddTorrentDestinationStatusResult` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:23` | Result/outcome type for Add Torrent Destination Status Result (module:torrent-add). |
| 2 | `interface` | `AddTorrentFileTableState` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:51` | Type definition for Add Torrent File Table State (module:torrent-add). |
| 2 | `interface` | `AddTorrentModalPropsDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:849` | Type definition for Add Torrent Modal Props Deps (app). |
| 2 | `interface` | `AddTorrentSettingsState` | `no better` | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx:35` | Type definition for Add Torrent Settings State (module:torrent-add). |
| 2 | `function` | `appendTrailingSlashForForce` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:292` | Function for append Trailing Slash For Force (services). |
| 2 | `type` | `AppShellLifecycleState` | `no better` | `frontend/src\app\context\AppShellStateContext.tsx:20` | Type definition for App Shell Lifecycle State (app). |
| 2 | `const` | `arePeerSummariesEqual` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:95` | Value for are Peer Summaries Equal (module:dashboard). |
| 2 | `type` | `AsyncToggleActionResult` | `no better` | `frontend/src\modules\settings\hooks\useAsyncToggle.ts:3` | Result/outcome type for Async Toggle Action Result (module:settings). |
| 2 | `interface` | `BasePaletteCommandDefinition` | `no better` | `frontend/src\app\commandCatalog.ts:25` | Type definition for Base Palette Command Definition (app). |
| 2 | `type` | `BrowseTargetConfigKey` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:93` | Type definition for Browse Target Config Key (module:settings). |
| 2 | `const` | `calledWithRemovedQuiet` | `no better` | `frontend/src\services\rpc\__tests__\heartbeat-removed-quiet.test.ts:119` | Value for called With Removed Quiet (services). |
| 2 | `type` | `ColumnSizingInfoUpdater` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:25` | Type definition for Column Sizing Info Updater (module:dashboard). |
| 2 | `interface` | `CommandPaletteBaseGroups` | `no better` | `frontend/src\app\commandRegistry.ts:49` | Type definition for Command Palette Base Groups (app). |
| 2 | `interface` | `CommandPaletteOverlayProps` | `no better` | `frontend/src\app\components\CommandPalette.tsx:55` | Props type for Command Palette Overlay Props (app). |
| 2 | `const` | `computeCanvasBackingScale` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:324` | Value for compute Canvas Backing Scale (module:dashboard). |
| 2 | `interface` | `ConnectionConfigContextValue` | `no better` | `frontend/src\app\context\ConnectionConfigContext.tsx:23` | Type definition for Connection Config Context Value (app). |
| 2 | `const` | `createColumnSizingInfoState` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_ColumnMeasurement.tsx:13` | Value for create Column Sizing Info State (module:dashboard). |
| 2 | `interface` | `CreateGlobalHotkeyBindingsParams` | `no better` | `frontend/src\app\commandRegistry.ts:281` | Parameter type for Create Global Hotkey Bindings Params (app). |
| 2 | `interface` | `CreateTorrentDispatchOptions` | `no better` | `frontend/src\app\actions\torrentDispatch.ts:16` | Type definition for Create Torrent Dispatch Options (app). |
| 2 | `interface` | `DashboardViewModelParams` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:53` | Parameter type for Dashboard View Model Params (app). |
| 2 | `interface` | `DeletionViewModelDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:385` | Type definition for Deletion View Model Deps (app). |
| 2 | `const` | `deriveTorrentRuntimeSummary` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:55` | Value for derive Torrent Runtime Summary (module:dashboard). |
| 2 | `type` | `DetailsAvailabilityHeatmapConfig` | `no better` | `frontend/src\config\logic.ts:661` | Type definition for Details Availability Heatmap Config (frontend). |
| 2 | `type` | `DetailsPeerMapConfig` | `no better` | `frontend/src\config\logic.ts:634` | Type definition for Details Peer Map Config (frontend). |
| 2 | `type` | `DetailsPieceMapConfig` | `no better` | `frontend/src\config\logic.ts:624` | Type definition for Details Piece Map Config (frontend). |
| 2 | `type` | `DetailsSpeedChartConfig` | `no better` | `frontend/src\config\logic.ts:669` | Type definition for Details Speed Chart Config (frontend). |
| 2 | `interface` | `DiskSpaceGaugeProps` | `no better` | `frontend/src\shared\ui\workspace\DiskSpaceGauge.tsx:6` | Props type for Disk Space Gauge Props (shared). |
| 2 | `interface` | `DispatchTorrentActionParams` | `no better` | `frontend/src\app\utils\torrentActionDispatcher.ts:12` | Parameter type for Dispatch Torrent Action Params (app). |
| 2 | `interface` | `DispatchTorrentSelectionActionParams` | `no better` | `frontend/src\app\utils\torrentActionDispatcher.ts:120` | Parameter type for Dispatch Torrent Selection Action Params (app). |
| 2 | `interface` | `DragOverlayIconConfig` | `no better` | `frontend/src\config\logic.ts:560` | Type definition for Drag Overlay Icon Config (frontend). |
| 2 | `interface` | `DragOverlayLayerConfig` | `no better` | `frontend/src\config\logic.ts:551` | Type definition for Drag Overlay Layer Config (frontend). |
| 2 | `interface` | `DragOverlayRootConfig` | `no better` | `frontend/src\config\logic.ts:536` | Type definition for Drag Overlay Root Config (frontend). |
| 2 | `const` | `droppedLooksLikeFile` | `no better` | `frontend/src\modules\torrent-add\hooks\useAddTorrentDestinationViewModel.ts:133` | Value for dropped Looks Like File (module:torrent-add). |
| 2 | `const` | `encryptionNumberToLabel` | `no better` | `frontend/src\services\rpc\schemas.ts:370` | Value for encryption Number To Label (services). |
| 2 | `function` | `ensureRuntimeTeardownListener` | `no better` | `frontend/src\app\runtime.ts:110` | Function for ensure Runtime Teardown Listener (app). |
| 2 | `const` | `executeBulkRemoveViaDispatch` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:402` | Value for execute Bulk Remove Via Dispatch (app). |
| 2 | `const` | `executeTorrentActionViaDispatch` | `no better` | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts:389` | Value for execute Torrent Action Via Dispatch (app). |
| 2 | `interface` | `FileExplorerTreeProps` | `no better` | `frontend/src\shared\ui\workspace\FileExplorerTree.tsx:34` | Props type for File Explorer Tree Props (shared). |
| 2 | `interface` | `FileExplorerTreeRowProps` | `no better` | `frontend/src\shared\ui\workspace\FileExplorerTreeRow.tsx:17` | Props type for File Explorer Tree Row Props (shared). |
| 2 | `const` | `getDestinationHintMessage` | `no better` | `frontend/src\modules\torrent-add\utils\destinationStatus.ts:30` | Value for Destination Hint Message (module:torrent-add). |
| 2 | `const` | `getTransportSessionRuntime` | `no better` | `frontend/src\services\transport.ts:37` | Value for Transport Session Runtime (services). |
| 2 | `const` | `handleAutorunValueChange` | `no better` | `frontend/src\modules\settings\components\tabs\system\SystemTabContent.tsx:218` | Event handler for Autorun Value Change (module:settings). |
| 2 | `const` | `handleColumnDragCommit` | `no better` | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts:534` | Event handler for Column Drag Commit (module:dashboard). |
| 2 | `const` | `handleFilterSelectionChange` | `no better` | `frontend/src\app\components\layout\Navbar.tsx:68` | Event handler for Filter Selection Change (app). |
| 2 | `const` | `handleRecoveryPickPath` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:940` | Event handler for Recovery Pick Path (module:dashboard). |
| 2 | `function` | `hasNativeHostFlag` | `no better` | `frontend/src\app\runtime.ts:78` | Function for Native Host Flag (app). |
| 2 | `const` | `hasPendingDraftEdits` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:274` | Predicate/flag for Pending Draft Edits (module:settings). |
| 2 | `const` | `hasRecentVerifyCompletion` | `no better` | `frontend/src\services\rpc\normalizers.ts:97` | Predicate/flag for Recent Verify Completion (services). |
| 2 | `interface` | `HudViewModelDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:364` | Type definition for Hud View Model Deps (app). |
| 2 | `const` | `iconographyStrokeWidthDense` | `no better` | `frontend/src\config\logic.ts:427` | Value for iconography Stroke Width Dense (frontend). |
| 2 | `const` | `immersiveHandleHitArea` | `no better` | `frontend/src\config\logic.ts:148` | Value for immersive Handle Hit Area (frontend). |
| 2 | `type` | `InternalOptimisticStatusEntry` | `no better` | `frontend/src\app\hooks\useOptimisticStatuses.ts:10` | Type definition for Internal Optimistic Status Entry (app). |
| 2 | `const` | `isAuthModeResolved` | `no better` | `frontend/src\modules\settings\components\tabs\connection\ConnectionManager.tsx:123` | Predicate/flag for Auth Mode Resolved (module:settings). |
| 2 | `const` | `isBrowseTargetConfigKey` | `no better` | `frontend/src\modules\settings\hooks\useSettingsModalController.ts:95` | Predicate/flag for Browse Target Config Key (module:settings). |
| 2 | `const` | `isCheckingStatusNum` | `no better` | `frontend/src\services\rpc\normalizers.ts:77` | Predicate/flag for Checking Status Num (services). |
| 2 | `const` | `isCloseEligibleOutcome` | `no better` | `frontend/src\modules\torrent-remove\components\RemoveConfirmationModal.tsx:79` | Predicate/flag for Close Eligible Outcome (module:torrent-remove). |
| 2 | `const` | `isInsecureBasicAuth` | `no better` | `frontend/src\modules\settings\components\tabs\connection\ConnectionManager.tsx:124` | Predicate/flag for Insecure Basic Auth (module:settings). |
| 2 | `const` | `isMissingFilesCell` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_StatusColumnCell.tsx:151` | Predicate/flag for Missing Files Cell (module:dashboard). |
| 2 | `const` | `isRecoveryActiveState` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:91` | Predicate/flag for Recovery Active State (module:dashboard). |
| 2 | `const` | `isTorrentTableState` | `no better` | `frontend/src\app\context\PreferencesContext.tsx:223` | Predicate/flag for Torrent Table State (app). |
| 2 | `const` | `isWithinStallGraceWindow` | `no better` | `frontend/src\services\rpc\normalizers.ts:121` | Predicate/flag for Within Stall Grace Window (services). |
| 2 | `const` | `legacyShellLooksClassic` | `no better` | `frontend/src\config\logic.ts:108` | Value for legacy Shell Looks Classic (frontend). |
| 2 | `const` | `mapConfigToSession` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:140` | Value for Config To Session (app). |
| 2 | `const` | `mapRecommendedActionToEmphasis` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:45` | Value for Recommended Action To Emphasis (module:dashboard). |
| 2 | `const` | `mapSessionToConfig` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:53` | Value for Session To Config (app). |
| 2 | `type` | `MissingFilesClassificationKind` | `no better` | `frontend/src\services\rpc\entities.ts:52` | Type definition for Missing Files Classification Kind (services). |
| 2 | `type` | `MissingFilesStatusCellProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_MissingFilesStatusCell.tsx:18` | Props type for Missing Files Status Cell Props (module:dashboard). |
| 2 | `type` | `NativeShellRequestFailureKind` | `no better` | `frontend/src\app\runtime.ts:63` | Type definition for Native Shell Request Failure Kind (app). |
| 2 | `interface` | `NavbarViewModelParams` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:219` | Parameter type for Navbar View Model Params (app). |
| 2 | `type` | `NonSuccessCommandActionOutcome` | `no better` | `frontend/src\app\components\CommandPalette.tsx:24` | Result/outcome type for Non Success Command Action Outcome (app). |
| 2 | `type` | `NonTableSubscriptionParams` | `no better` | `frontend/src\app\providers\engineDomains.ts:19` | Parameter type for Non Table Subscription Params (app). |
| 2 | `function` | `normalizeInfoHashCandidate` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:331` | Function for normalize Info Hash Candidate (app). |
| 2 | `type` | `PieceMapGeometryParams` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:89` | Parameter type for Piece Map Geometry Params (module:dashboard). |
| 2 | `function` | `readFileAsDataUrl` | `no better` | `frontend/src\modules\torrent-add\services\torrent-metainfo.ts:3` | Function for read File As Data Url (module:torrent-add). |
| 2 | `interface` | `RecoveryContextModelParams` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:503` | Parameter type for Recovery Context Model Params (app). |
| 2 | `interface` | `RecoveryControllerRefreshDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:142` | Type definition for Recovery Controller Refresh Deps (module:dashboard). |
| 2 | `interface` | `RecoveryModalPropsDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:550` | Type definition for Recovery Modal Props Deps (app). |
| 2 | `interface` | `RemoveConfirmationModalProps` | `no better` | `frontend/src\modules\torrent-remove\components\RemoveConfirmationModal.tsx:23` | Props type for Remove Confirmation Modal Props (module:torrent-remove). |
| 2 | `const` | `removedWillBeNoop` | `no better` | `frontend/src\services\rpc\heartbeat.ts:661` | Value for removed Will Be Noop (services). |
| 2 | `const` | `removeWithDataHandler` | `no better` | `frontend/src\app\commandRegistry.ts:364` | Value for remove With Data Handler (app). |
| 2 | `const` | `resolveRecoveryHintKey` | `no better` | `frontend/src\shared\utils\recoveryFormat.ts:31` | Value for resolve Recovery Hint Key (shared). |
| 2 | `function` | `resolveRootFromPath` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:252` | Function for resolve Root From Path (services). |
| 2 | `type` | `RowSelectionControllerDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useRowSelectionController.ts:14` | Type definition for Row Selection Controller Deps (module:dashboard). |
| 2 | `const` | `runAddTorrentFromFile` | `no better` | `frontend/src\app\actions\torrentDispatch.ts:113` | Value for run Add Torrent From File (app). |
| 2 | `const` | `runFinalizeExistingTorrent` | `no better` | `frontend/src\app\actions\torrentDispatch.ts:142` | Value for run Finalize Existing Torrent (app). |
| 2 | `interface` | `SessionTelemetryContextValue` | `no better` | `frontend/src\app\context\SessionContext.tsx:54` | Type definition for Session Telemetry Context Value (app). |
| 2 | `interface` | `SetLocationInlineEditorProps` | `no better` | `frontend/src\modules\dashboard\components\SetLocationInlineEditor.tsx:5` | Props type for Set Location Inline Editor Props (module:dashboard). |
| 2 | `interface` | `SettingsFormBuilderProps` | `no better` | `frontend/src\modules\settings\components\SettingsFormBuilder.tsx:22` | Props type for Settings Form Builder Props (module:settings). |
| 2 | `interface` | `SettingsFormProviderProps` | `no better` | `frontend/src\modules\settings\context\SettingsFormContext.tsx:44` | Props type for Settings Form Provider Props (module:settings). |
| 2 | `interface` | `SettingsModalViewModelParams` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:285` | Parameter type for Settings Modal View Model Params (app). |
| 2 | `interface` | `SettingsModalViewProps` | `no better` | `frontend/src\modules\settings\components\SettingsModalView.tsx:25` | Props type for Settings Modal View Props (module:settings). |
| 2 | `const` | `setTorrentLocationBound` | `no better` | `frontend/src\app\actions\torrentDispatch.ts:153` | Value for Torrent Location Bound (app). |
| 2 | `type` | `ShortcutKeyScopeMap` | `no better` | `frontend/src\config\logic.ts:795` | Type definition for Shortcut Key Scope Map (frontend). |
| 2 | `const` | `shouldKeepPendingChecking` | `no better` | `frontend/src\app\hooks\useOptimisticStatuses.ts:70` | Predicate/flag for Keep Pending Checking (app). |
| 2 | `const` | `shouldLogSessionGet` | `no better` | `frontend/src\services\rpc\rpc-base.ts:484` | Predicate/flag for Log Session Get (services). |
| 2 | `const` | `shouldResetNoTraffic` | `no better` | `frontend/src\services\rpc\normalizers.ts:216` | Predicate/flag for Reset No Traffic (services). |
| 2 | `const` | `shouldShowAuthControls` | `no better` | `frontend/src\modules\settings\components\tabs\connection\ConnectionManager.tsx:122` | Predicate/flag for Show Auth Controls (module:settings). |
| 2 | `const` | `showNoResultsState` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Body.tsx:61` | Value for show No Results State (module:dashboard). |
| 2 | `const` | `skipVerifyForEmpty` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:712` | Value for skip Verify For Empty (services). |
| 2 | `interface` | `SmoothProgressBarProps` | `no better` | `frontend/src\shared\ui\components\SmoothProgressBar.tsx:6` | Props type for Smooth Progress Bar Props (shared). |
| 2 | `type` | `StatusBarIconComponent` | `no better` | `frontend/src\app\components\layout\StatusBar.tsx:67` | Type definition for Status Bar Icon Component (app). |
| 2 | `interface` | `StatusBarViewModelDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:165` | Type definition for Status Bar View Model Deps (app). |
| 2 | `interface` | `SystemSectionCardProps` | `no better` | `frontend/src\modules\settings\components\tabs\system\SystemTabContent.tsx:30` | Props type for System Section Card Props (module:settings). |
| 2 | `interface` | `TinyTorrentIconProps` | `no better` | `frontend/src\shared\ui\components\TinyTorrentIcon.tsx:4` | Props type for Tiny Torrent Icon Props (shared). |
| 2 | `const` | `toCssVarSafeId` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Shared.tsx:21` | Value for Css Var Safe Id (module:dashboard). |
| 2 | `interface` | `ToolbarIconButtonProps` | `no better` | `frontend/src\shared\ui\layout\toolbar-button.tsx:33` | Props type for Toolbar Icon Button Props (shared). |
| 2 | `interface` | `TorrentDetailHeaderProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Header.tsx:30` | Props type for Torrent Detail Header Props (module:dashboard). |
| 2 | `interface` | `TorrentDetailHeaderStatus` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailHeaderStatus.ts:20` | Type definition for Torrent Detail Header Status (module:dashboard). |
| 2 | `interface` | `TorrentDetailsPeersViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts:62` | Type definition for Torrent Details Peers View Model (module:dashboard). |
| 2 | `interface` | `TorrentDetailsTrackersViewModel` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsTrackersViewModel.ts:23` | Type definition for Torrent Details Trackers View Model (module:dashboard). |
| 2 | `interface` | `TorrentRecoveryModalProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentRecoveryModal.tsx:53` | Props type for Torrent Recovery Modal Props (module:dashboard). |
| 2 | `interface` | `TorrentTableBodyProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Body.tsx:20` | Props type for Torrent Table Body Props (module:dashboard). |
| 2 | `interface` | `TorrentTableHeaderMenuProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_HeaderMenu.tsx:21` | Props type for Torrent Table Header Menu Props (module:dashboard). |
| 2 | `interface` | `TorrentTableHeadersProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_Headers.tsx:50` | Props type for Torrent Table Headers Props (module:dashboard). |
| 2 | `type` | `TorrentTableInteractionsDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableInteractions.ts:33` | Type definition for Torrent Table Interactions Deps (module:dashboard). |
| 2 | `type` | `TorrentTableKeyboardDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableKeyboard.ts:7` | Type definition for Torrent Table Keyboard Deps (module:dashboard). |
| 2 | `type` | `TorrentTablePersistentState` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTablePersistence.ts:10` | Type definition for Torrent Table Persistent State (module:dashboard). |
| 2 | `interface` | `TorrentTableRowMenuProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx:84` | Props type for Torrent Table Row Menu Props (module:dashboard). |
| 2 | `interface` | `TorrentTableSpeedColumnCellProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_SpeedColumnCell.tsx:20` | Props type for Torrent Table Speed Column Cell Props (module:dashboard). |
| 2 | `interface` | `TorrentTableStatusColumnCellProps` | `no better` | `frontend/src\modules\dashboard\components\TorrentTable_StatusColumnCell.tsx:131` | Props type for Torrent Table Status Column Cell Props (module:dashboard). |
| 2 | `interface` | `UseAddModalStateParams` | `no better` | `frontend/src\app\hooks\useAddModalState.ts:7` | Parameter type for Use Add Modal State Params (app). |
| 2 | `interface` | `UseAddTorrentControllerParams` | `no better` | `frontend/src\app\orchestrators\useAddTorrentController.ts:20` | Parameter type for Use Add Torrent Controller Params (app). |
| 2 | `interface` | `UseAddTorrentDestinationViewModelParams` | `UseAddTorrentDestinationParams` | `frontend/src\modules\torrent-add\hooks\useAddTorrentDestinationViewModel.ts:11` | Parameter type for Use Add Torrent Destination View Model Params (module:torrent-add). |
| 2 | `interface` | `UseAddTorrentDestinationViewModelResult` | `UseAddTorrentDestinationResult` | `frontend/src\modules\torrent-add\hooks\useAddTorrentDestinationViewModel.ts:18` | Result/outcome type for Use Add Torrent Destination View Model Result (module:torrent-add). |
| 2 | `interface` | `UseAddTorrentModalViewModelParams` | `UseAddTorrentModalParams` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:42` | Parameter type for Use Add Torrent Modal View Model Params (module:torrent-add). |
| 2 | `interface` | `UseAddTorrentModalViewModelResult` | `UseAddTorrentModalResult` | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts:56` | Result/outcome type for Use Add Torrent Modal View Model Result (module:torrent-add). |
| 2 | `interface` | `UseAddTorrentViewportViewModelResult` | `UseAddTorrentViewportResult` | `frontend/src\modules\torrent-add\hooks\useAddTorrentViewportViewModel.ts:4` | Result/outcome type for Use Add Torrent Viewport View Model Result (module:torrent-add). |
| 2 | `interface` | `UseAppViewModelParams` | `UseAppParams` | `frontend/src\app\viewModels\useAppViewModel.ts:202` | Parameter type for Use App View Model Params (app). |
| 2 | `type` | `UseColumnSizingControllerDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts:29` | Type definition for Use Column Sizing Controller Deps (module:dashboard). |
| 2 | `function` | `useConnectionManagerState` | `no better` | `frontend/src\modules\settings\components\tabs\connection\ConnectionManager.tsx:24` | React hook for Connection Manager State (module:settings). |
| 2 | `type` | `UseConnectionProfileStoreParams` | `no better` | `frontend/src\app\context\connection\useConnectionProfileStore.ts:10` | Parameter type for Use Connection Profile Store Params (app). |
| 2 | `interface` | `UseContextMenuPositionOptions` | `no better` | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts:9` | Type definition for Use Context Menu Position Options (shared). |
| 2 | `function` | `useDeleteConfirmationContext` | `no better` | `frontend/src\modules\torrent-remove\context\DeleteConfirmationContext.tsx:42` | React hook for Delete Confirmation Context (module:torrent-remove). |
| 2 | `interface` | `UseDetailControlsParams` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailControls.ts:7` | Parameter type for Use Detail Controls Params (module:dashboard). |
| 2 | `interface` | `UseDetailTabsParams` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailTabs.ts:29` | Parameter type for Use Detail Tabs Params (module:dashboard). |
| 2 | `interface` | `UseHudCardsParams` | `no better` | `frontend/src\app\hooks\useHudCards.ts:9` | Parameter type for Use Hud Cards Params (app). |
| 2 | `interface` | `UseRecoveryControllerParams` | `no better` | `frontend/src\modules\dashboard\hooks\useRecoveryController.ts:150` | Parameter type for Use Recovery Controller Params (module:dashboard). |
| 2 | `type` | `UseRpcConnectionResult` | `no better` | `frontend/src\app\hooks\useRpcConnection.ts:13` | Result/outcome type for Use Rpc Connection Result (app). |
| 2 | `interface` | `UseSessionStatsParams` | `no better` | `frontend/src\app\hooks\useSessionStats.ts:14` | Parameter type for Use Session Stats Params (app). |
| 2 | `interface` | `UseSettingsFlowParams` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:205` | Parameter type for Use Settings Flow Params (app). |
| 2 | `type` | `UseTorrentDataOptions` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:15` | Type definition for Use Torrent Data Options (module:dashboard). |
| 2 | `type` | `UseTorrentDataResult` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentData.ts:28` | Result/outcome type for Use Torrent Data Result (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailHeaderStatusParams` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetailHeaderStatus.ts:16` | Parameter type for Use Torrent Detail Header Status Params (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailParams` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetail.ts:14` | Parameter type for Use Torrent Detail Params (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailResult` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentDetail.ts:19` | Result/outcome type for Use Torrent Detail Result (module:dashboard). |
| 2 | `type` | `UseTorrentDetailsGeneralViewModelParams` | `UseTorrentDetailsGeneralParams` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts:18` | Parameter type for Use Torrent Details General View Model Params (module:dashboard). |
| 2 | `type` | `UseTorrentDetailsGeneralViewModelResult` | `UseTorrentDetailsGeneralResult` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts:25` | Result/outcome type for Use Torrent Details General View Model Result (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailsPeersViewModelParams` | `UseTorrentDetailsPeersParams` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts:36` | Parameter type for Use Torrent Details Peers View Model Params (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailsTrackersViewModelParams` | `UseTorrentDetailsTrackersParams` | `frontend/src\modules\dashboard\hooks\useTorrentDetailsTrackersViewModel.ts:5` | Parameter type for Use Torrent Details Trackers View Model Params (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailTabCoordinatorParams` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailTabs.ts:149` | Parameter type for Use Torrent Detail Tab Coordinator Params (module:dashboard). |
| 2 | `interface` | `UseTorrentDetailTabCoordinatorResult` | `no better` | `frontend/src\modules\dashboard\hooks\useDetailTabs.ts:155` | Result/outcome type for Use Torrent Detail Tab Coordinator Result (module:dashboard). |
| 2 | `interface` | `UseTorrentOrchestratorParams` | `no better` | `frontend/src\app\orchestrators\useTorrentOrchestrator.ts:13` | Parameter type for Use Torrent Orchestrator Params (app). |
| 2 | `interface` | `UseTorrentOrchestratorResult` | `no better` | `frontend/src\app\orchestrators\useTorrentOrchestrator.ts:25` | Result/outcome type for Use Torrent Orchestrator Result (app). |
| 2 | `type` | `UseTorrentRowDragDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts:15` | Type definition for Use Torrent Row Drag Deps (module:dashboard). |
| 2 | `type` | `UseTorrentTableContextParams` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableContextActions.ts:19` | Parameter type for Use Torrent Table Context Params (module:dashboard). |
| 2 | `type` | `UseTorrentTableHeaderContextParams` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts:23` | Parameter type for Use Torrent Table Header Context Params (module:dashboard). |
| 2 | `type` | `UseTorrentTableVirtualizationDeps` | `no better` | `frontend/src\modules\dashboard\hooks\useTorrentTableVirtualization.ts:17` | Type definition for Use Torrent Table Virtualization Deps (module:dashboard). |
| 2 | `interface` | `UseTorrentWorkflowParams` | `no better` | `frontend/src\app\hooks\useTorrentWorkflow.ts:25` | Parameter type for Use Torrent Workflow Params (app). |
| 2 | `type` | `UseTransmissionSessionResult` | `no better` | `frontend/src\app\hooks\useTransmissionSession.ts:15` | Result/outcome type for Use Transmission Session Result (app). |
| 2 | `const` | `wasPresentInPrev` | `no better` | `frontend/src\services\rpc\heartbeat.ts:729` | Value for was Present In Prev (services). |
| 2 | `type` | `WindowControlButtonProps` | `no better` | `frontend/src\shared\ui\layout\window-control-button.tsx:18` | Props type for Window Control Button Props (shared). |
| 2 | `interface` | `WorkspaceShellModelDeps` | `no better` | `frontend/src\app\viewModels\workspaceShellModels.ts:427` | Type definition for Workspace Shell Model Deps (app). |
| 2 | `interface` | `WorkspaceStyleViewModel` | `no better` | `frontend/src\app\viewModels\useAppViewModel.ts:114` | Type definition for Workspace Style View Model (app). |
| 2 | `const` | `yDownMaxRaw` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx:488` | Value for y Down Max Raw (module:dashboard). |
| 2 | `const` | `yUpMaxRaw` | `no better` | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx:491` | Value for y Up Max Raw (module:dashboard). |
| 2 | `const` | `zEncryptionLevelBase` | `no better` | `frontend/src\services\rpc\schemas.ts:378` | Schema for z Encryption Level Base (services). |
| 2 | `const` | `zRpcTorrentStatus` | `no better` | `frontend/src\services\rpc\schemas.ts:18` | Schema for z Rpc Torrent Status (services). |
| 2 | `const` | `zTransmissionTorrentDetailBase` | `no better` | `frontend/src\services\rpc\schemas.ts:248` | Schema for z Transmission Torrent Detail Base (services). |
| 2 | `const` | `zTransmissionTorrentFile` | `no better` | `frontend/src\services\rpc\schemas.ts:127` | Schema for z Transmission Torrent File (services). |
| 2 | `const` | `zTransmissionTorrentFileStat` | `no better` | `frontend/src\services\rpc\schemas.ts:135` | Schema for z Transmission Torrent File Stat (services). |
| 2 | `const` | `zTransmissionTorrentPeer` | `no better` | `frontend/src\services\rpc\schemas.ts:171` | Schema for z Transmission Torrent Peer (services). |
| 2 | `const` | `zTransmissionTorrentTracker` | `no better` | `frontend/src\services\rpc\schemas.ts:142` | Schema for z Transmission Torrent Tracker (services). |
| 1 | `const` | `findMagnetInString` | `no better` | `frontend/src\app\utils\magnet.ts:25` | Value for find Magnet In String (app). |
| 1 | `const` | `getLanguageStorageKey` | `no better` | `frontend/src\app\preferences\language.ts:46` | Value for Language Storage Key (app). |
| 1 | `type` | `ReportTransportErrorFn` | `no better` | `frontend/src\shared\types\rpc.ts:20` | Type definition for Report Transport Error Fn (shared). |
| 1 | `function` | `runPartialFilesRecovery` | `no better` | `frontend/src\services\recovery\recovery-controller.ts:1055` | Function for run Partial Files Recovery (services). |
| 1 | `const` | `setupCanvasBackingStore` | `no better` | `frontend/src\modules\dashboard\hooks\utils\canvasUtils.ts:330` | Value for setup Canvas Backing Store (module:dashboard). |
| 1 | `type` | `UseSettingsFlowResult` | `no better` | `frontend/src\app\hooks\useSettingsFlow.ts:211` | Result/outcome type for Use Settings Flow Result (app). |

### Filenames (61)

| Occurrences | File | Suggested | What It Does |
| ---: | --- | --- | --- |
| 1 | `frontend/src\app\context\AppShellStateContext.tsx` | `no better` | Context file for App Shell State Context. |
| 1 | `frontend/src\app\context\connection\useConnectionProfileStore.ts` | `no better` | Context file for Connection Profile Store. |
| 1 | `frontend/src\app\hooks\useAddModalState.ts` | `no better` | Hook file for Add Modal State. |
| 1 | `frontend/src\app\hooks\useAddTorrentDefaults.ts` | `no better` | Hook file for Add Torrent Defaults. |
| 1 | `frontend/src\app\hooks\useOpenTorrentFolder.ts` | `no better` | Hook file for Open Torrent Folder. |
| 1 | `frontend/src\app\orchestrators\useAddTorrentController.ts` | `no better` | Source file for Add Torrent Controller. |
| 1 | `frontend/src\app\viewModels\useAppViewModel.ts` | `no better` | ViewModel file for App View Model. |
| 1 | `frontend/src\app\viewModels\useWorkspaceShellViewModel.ts` | `no better` | ViewModel file for Workspace Shell View Model. |
| 1 | `frontend/src\modules\dashboard\components\SetLocationInlineEditor.tsx` | `no better` | Component file for Location Inline Editor. |
| 1 | `frontend/src\modules\dashboard\components\TorrentDetails_Peers_Map.tsx` | `no better` | Component file for Torrent Details Peers Map. |
| 1 | `frontend/src\modules\dashboard\components\TorrentDetails_Pieces_Heatmap.tsx` | `no better` | Component file for Torrent Details Pieces Heatmap. |
| 1 | `frontend/src\modules\dashboard\components\TorrentDetails_Pieces_Map.tsx` | `no better` | Component file for Torrent Details Pieces Map. |
| 1 | `frontend/src\modules\dashboard\components\TorrentDetails_Speed_Chart.tsx` | `no better` | Component file for Torrent Details Speed Chart. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_ColumnDefs.tsx` | `no better` | Component file for Torrent Table Column Defs. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_ColumnMeasurement.tsx` | `no better` | Component file for Torrent Table Column Measurement. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_ColumnSettingsModal.tsx` | `no better` | Component file for Torrent Table Column Settings Modal. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_EmptyState.tsx` | `no better` | Component file for Torrent Table Empty State. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_HeaderMenu.tsx` | `no better` | Component file for Torrent Table Header Menu. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_MissingFilesStatusCell.tsx` | `no better` | Component file for Torrent Table Missing Files Status Cell. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_RowMenu.tsx` | `no better` | Component file for Torrent Table Row Menu. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_SpeedColumnCell.tsx` | `no better` | Component file for Torrent Table Speed Column Cell. |
| 1 | `frontend/src\modules\dashboard\components\TorrentTable_StatusColumnCell.tsx` | `no better` | Component file for Torrent Table Status Column Cell. |
| 1 | `frontend/src\modules\dashboard\hooks\useColumnSizingController.ts` | `no better` | Hook file for Column Sizing Controller. |
| 1 | `frontend/src\modules\dashboard\hooks\usePiecesMapViewModel.ts` | `no better` | Hook file for Pieces Map View Model. |
| 1 | `frontend/src\modules\dashboard\hooks\useQueueReorderController.ts` | `no better` | Hook file for Queue Reorder Controller. |
| 1 | `frontend/src\modules\dashboard\hooks\useResolvedRecoveryClassification.ts` | `no better` | Hook file for Resolved Recovery Classification. |
| 1 | `frontend/src\modules\dashboard\hooks\useRowSelectionController.ts` | `no better` | Hook file for Row Selection Controller. |
| 1 | `frontend/src\modules\dashboard\hooks\useTableAnimationGuard.ts` | `no better` | Hook file for Table Animation Guard. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentDetailHeaderStatus.ts` | `no better` | Hook file for Torrent Detail Header Status. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentDetailsGeneralViewModel.ts` | `no better` | Hook file for Torrent Details General View Model. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentDetailsPeersViewModel.ts` | `no better` | Hook file for Torrent Details Peers View Model. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentDetailsTrackersViewModel.ts` | `no better` | Hook file for Torrent Details Trackers View Model. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentRowDrag.ts` | `no better` | Hook file for Torrent Row Drag. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentSpeedHistory.ts` | `no better` | Hook file for Torrent Speed History. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableColumns.tsx` | `no better` | Hook file for Torrent Table Columns. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableContextActions.ts` | `no better` | Hook file for Torrent Table Context Actions. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableHeaderContext.ts` | `no better` | Hook file for Torrent Table Header Context. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableInteractions.ts` | `no better` | Hook file for Torrent Table Interactions. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableKeyboard.ts` | `no better` | Hook file for Torrent Table Keyboard. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTablePersistence.ts` | `no better` | Hook file for Torrent Table Persistence. |
| 1 | `frontend/src\modules\dashboard\hooks\useTorrentTableVirtualization.ts` | `no better` | Hook file for Torrent Table Virtualization. |
| 1 | `frontend/src\modules\dashboard\viewModels\useFileExplorerViewModel.ts` | `no better` | ViewModel file for File Explorer View Model. |
| 1 | `frontend/src\modules\dashboard\viewModels\useTorrentTableViewModel.ts` | `no better` | ViewModel file for Torrent Table View Model. |
| 1 | `frontend/src\modules\settings\hooks\useSettingsModalController.ts` | `no better` | Hook file for Settings Modal Controller. |
| 1 | `frontend/src\modules\torrent-add\components\AddTorrentDestinationGatePanel.tsx` | `no better` | Component file for Add Torrent Destination Gate Panel. |
| 1 | `frontend/src\modules\torrent-add\components\AddTorrentFileTable.tsx` | `no better` | Component file for Add Torrent File Table. |
| 1 | `frontend/src\modules\torrent-add\components\AddTorrentModalContext.tsx` | `no better` | Component file for Add Torrent Modal Context. |
| 1 | `frontend/src\modules\torrent-add\components\AddTorrentSettingsPanel.tsx` | `no better` | Component file for Add Torrent Settings Panel. |
| 1 | `frontend/src\modules\torrent-add\hooks\useAddTorrentDestinationViewModel.ts` | `no better` | Hook file for Add Torrent Destination View Model. |
| 1 | `frontend/src\modules\torrent-add\hooks\useAddTorrentFileSelectionViewModel.ts` | `no better` | Hook file for Add Torrent File Selection View Model. |
| 1 | `frontend/src\modules\torrent-add\hooks\useAddTorrentModalViewModel.ts` | `no better` | Hook file for Add Torrent Modal View Model. |
| 1 | `frontend/src\modules\torrent-add\hooks\useAddTorrentViewportViewModel.ts` | `no better` | Hook file for Add Torrent Viewport View Model. |
| 1 | `frontend/src\modules\torrent-add\hooks\useFreeSpaceProbe.ts` | `no better` | Hook file for Free Space Probe. |
| 1 | `frontend/src\shared\hooks\ui\useContextMenuPosition.ts` | `no better` | Hook file for Context Menu Position. |
| 1 | `frontend/src\shared\hooks\useEngineSpeedHistory.ts` | `no better` | Hook file for Engine Speed History. |
| 1 | `frontend/src\shared\hooks\useSessionSpeedHistory.ts` | `no better` | Hook file for Session Speed History. |
| 1 | `frontend/src\shared\hooks\useSpeedHistoryDomain.ts` | `no better` | Hook file for Speed History Domain. |
| 1 | `frontend/src\shared\ui\workspace\fileExplorerTreeModel.ts` | `no better` | Source file for file Explorer Tree Model. |
| 1 | `frontend/src\shared\ui\workspace\FileExplorerTreeRow.tsx` | `no better` | Source file for File Explorer Tree Row. |
| 1 | `frontend/src\shared\ui\workspace\fileExplorerTreeTypes.ts` | `no better` | Source file for file Explorer Tree Types. |
| 1 | `frontend/src\shared\ui\workspace\useFileExplorerTreeState.ts` | `no better` | Source file for File Explorer Tree State. |

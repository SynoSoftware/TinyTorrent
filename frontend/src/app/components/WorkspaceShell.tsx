import { useCallback, useMemo } from "react";
import type { HTMLAttributes, InputHTMLAttributes } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@heroui/react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { X } from "lucide-react";
import { STATUS } from "@/shared/status";
import type { ConnectionStatus } from "@/shared/types/rpc";

import Runtime, { NativeShell } from "@/app/runtime";
import { useLifecycle } from "@/app/context/LifecycleContext";
import { useSelection } from "@/app/context/SelectionContext";

import { Dashboard_Layout } from "@/modules/dashboard/components/Dashboard_Layout";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { SettingsModal } from "@/modules/settings/components/SettingsModal";
import { Navbar } from "./layout/Navbar";
import { StatusBar, type EngineDisplayType } from "./layout/StatusBar";
import type { SettingsConfig } from "@/modules/settings/data/config";
import {
    ICON_STROKE_WIDTH,
    IMMERSIVE_CHROME_PADDING,
    IMMERSIVE_CHROME_RADIUS,
    IMMERSIVE_HUD_CARD_RADIUS,
    IMMERSIVE_MAIN_CONTENT_PADDING,
    IMMERSIVE_MAIN_INNER_RADIUS,
    IMMERSIVE_MAIN_OUTER_RADIUS,
    IMMERSIVE_MAIN_PADDING,
    INTERACTION_CONFIG,
} from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import type {
    AmbientHudCard,
    DeleteIntent,
    RehashStatus,
} from "@/app/types/workspace";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { PeerContextAction } from "@/modules/dashboard/components/TorrentDetails_Peers";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type {
    SessionStats,
    TorrentPeerEntity,
    ServerClass,
} from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { AddTorrentContext } from "@/app/hooks/useAddTorrent";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";

type AddTorrentPayload = {
    magnetLink?: string;
    metainfo?: string;
    metainfoPath?: string;
    downloadDir: string;
    startNow: boolean;
    filesUnwanted?: number[];
};

const MODAL_SPRING_TRANSITION = INTERACTION_CONFIG.modalBloom.transition;
const TOAST_SPRING_TRANSITION: Transition = {
    type: "spring",
    stiffness: 300,
    damping: 28,
};

interface WorkspaceShellProps {
    getRootProps: () => HTMLAttributes<HTMLElement>;
    getInputProps: () => InputHTMLAttributes<HTMLInputElement>;
    isDragActive: boolean;
    filter: string;
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    setFilter: (key: string) => void;
    openAddTorrent: () => void;
    openAddMagnet: () => void;
    openSettings: () => void;
    // handleBulkAction removed — use TorrentActionsContext in leaf components
    rehashStatus?: RehashStatus;
    workspaceStyle: WorkspaceStyle;
    toggleWorkspaceStyle: () => void;
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isTableLoading: boolean;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    detailData: TorrentDetail | null;
    closeDetail: () => void;
    handleFileSelectionChange: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void>;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    sequentialToggleHandler?: (enabled: boolean) => Promise<void>;
    superSeedingToggleHandler?: (enabled: boolean) => Promise<void>;

    // onRetry removed — use TorrentActionsContext in leaf components
    capabilities: CapabilityStore;
    optimisticStatuses: OptimisticStatusMap;
    isDetailRecoveryBlocked?: boolean;
    // handleOpenFolder removed — use TorrentActionsContext in leaf components
    peerSortStrategy: PeerSortStrategy;
    inspectorTabCommand: DetailTab | null;
    onInspectorTabCommandHandled: () => void;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    engineType: EngineDisplayType;
    handleReconnect: () => void;
    pendingDelete: DeleteIntent | null;
    clearPendingDelete: () => void;
    confirmDelete: (overrideDeleteData?: boolean) => Promise<void>;
    visibleHudCards: AmbientHudCard[];
    dismissHudCard: (cardId: string) => void;
    hasDismissedInsights: boolean;
    isSettingsOpen: boolean;
    closeSettings: () => void;
    settingsConfig: SettingsConfig;
    isSettingsSaving: boolean;
    settingsLoadError?: boolean;
    handleSaveSettings: (config: SettingsConfig) => Promise<void>;
    handleTestPort: () => Promise<void>;
    restoreHudCards: () => void;
    applyUserPreferencesPatch: (
        patch: Partial<
            Pick<
                SettingsConfig,
                | "refresh_interval_ms"
                | "request_timeout_ms"
                | "table_watermark_enabled"
            >
        >
    ) => void;
    tableWatermarkEnabled: boolean;
    retryTorrent?: (torrent: Torrent | TorrentDetail) => Promise<void> | void;
    resumeTorrent: (torrent: Torrent) => Promise<void> | void;
}

export function WorkspaceShell({
    getRootProps,
    getInputProps,
    isDragActive,
    filter,
    searchQuery,
    setSearchQuery,
    setFilter,
    openAddTorrent,
    openAddMagnet,
    openSettings,

    rehashStatus,
    workspaceStyle,
    toggleWorkspaceStyle,
    torrents,
    ghostTorrents,
    isTableLoading,
    handleRequestDetails,
    detailData,
    closeDetail,
    handleFileSelectionChange,
    onFileContextAction,
    onPeerContextAction,
    sequentialToggleHandler,
    superSeedingToggleHandler,
    isDetailRecoveryBlocked,
    capabilities,
    optimisticStatuses,
    // handleOpenFolder removed — leaf components should call TorrentActionsContext
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    sessionStats,
    liveTransportStatus,
    engineType,
    // isNativeIntegrationActive removed — read from LifecycleContext
    handleReconnect,
    pendingDelete,
    clearPendingDelete,
    confirmDelete,
    visibleHudCards,
    dismissHudCard,
    hasDismissedInsights,
    isSettingsOpen,
    closeSettings,
    settingsConfig,
    isSettingsSaving,
    settingsLoadError,
    handleSaveSettings,
    handleTestPort,
    restoreHudCards,
    applyUserPreferencesPatch,
    tableWatermarkEnabled,
    retryTorrent,
    resumeTorrent,
}: WorkspaceShellProps) {
    const {
        serverClass,
        rpcStatus: lifecycleRpcStatus,
        nativeIntegration,
    } = useLifecycle();
    const { t } = useTranslation();
    const { dispatch } = useRequiredTorrentActions();
    const { selectedIds } = useSelection();
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents]
    );
    const handleEnsureSelectionActive = useCallback(() => {
        if (!resumeTorrent) return;
        selectedTorrents.forEach((torrent) => void resumeTorrent(torrent));
    }, [resumeTorrent, selectedTorrents]);
    const handleWindowCommand = useCallback(
        (command: "minimize" | "maximize" | "close") => {
            if (!Runtime.isNativeHost) {
                return;
            }
            void NativeShell.sendWindowCommand(command);
        },
        []
    );
    const isNativeHost = Runtime.isNativeHost;
    const isImmersiveShell = workspaceStyle === "immersive";

    const renderNavbar = () => (
        // Compute selection-based emphasis hints from ErrorEnvelope.primaryAction
        // (presentational only — no behavior change).
        <Navbar
            filter={filter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddTorrent={openAddTorrent}
            onAddMagnet={openAddMagnet}
            onSettings={() => openSettings()}
            hasSelection={selectedIds.length > 0}
            onEnsureSelectionActive={handleEnsureSelectionActive}
            onEnsureSelectionPaused={() => {
                selectedIds.forEach((id) =>
                    void dispatch(TorrentIntents.ensurePaused(id))
                );
            }}
            onEnsureSelectionValid={() => {
                void dispatch(
                    TorrentIntents.ensureSelectionActive(selectedIds)
                );
            }}
            onEnsureSelectionRemoved={() => {
                void dispatch(
                    TorrentIntents.ensureSelectionRemoved(selectedIds, false)
                );
            }}
            rehashStatus={rehashStatus}
            workspaceStyle={workspaceStyle}
            onWindowCommand={handleWindowCommand}
            emphasizeActions={{
                pause: selectedTorrents.some(
                    (t) => t.errorEnvelope?.primaryAction === "pause"
                ),
                reannounce: selectedTorrents.some(
                    (t) => t.errorEnvelope?.primaryAction === "reannounce"
                ),
                changeLocation: selectedTorrents.some(
                    (t) => t.errorEnvelope?.primaryAction === "changeLocation"
                ),
                openFolder: selectedTorrents.some(
                    (t) => t.errorEnvelope?.primaryAction === "openFolder"
                ),
                forceRecheck: selectedTorrents.some(
                    (t) => t.errorEnvelope?.primaryAction === "forceRecheck"
                ),
            }}
        />
    );

    const renderModeLayoutSection = () => (
            <Dashboard_Layout
                workspaceStyle={workspaceStyle}
                torrents={torrents}
                filter={filter}
                searchQuery={searchQuery}
                isTableLoading={isTableLoading}
                // onAction/handleBulkAction handled via TorrentActionsContext in leaf components
                onRequestDetails={handleRequestDetails}
            detailData={detailData}
            onCloseDetail={closeDetail}
            onFilesToggle={handleFileSelectionChange}
            onFileContextAction={onFileContextAction}
            onPeerContextAction={onPeerContextAction}
            onSequentialToggle={sequentialToggleHandler}
            onSuperSeedingToggle={superSeedingToggleHandler}
            /* onSetLocation removed: use TorrentActionsContext.setLocation */

            capabilities={capabilities}
            optimisticStatuses={optimisticStatuses}
            peerSortStrategy={peerSortStrategy}
            inspectorTabCommand={inspectorTabCommand}
            onInspectorTabCommandHandled={onInspectorTabCommandHandled}
                ghostTorrents={ghostTorrents}
                isDropActive={isDragActive}
                /* onOpenFolder removed; leaf components use TorrentActionsContext */
                tableWatermarkEnabled={tableWatermarkEnabled}
                isDetailRecoveryBlocked={isDetailRecoveryBlocked}
                resumeTorrent={resumeTorrent}
                retryTorrent={retryTorrent}
            />
    );

    const renderStatusBarSection = () => (
        <StatusBar
            workspaceStyle={workspaceStyle}
            sessionStats={sessionStats}
            liveTransportStatus={liveTransportStatus}
            selectedCount={selectedIds.length}
            onEngineClick={handleReconnect}
            engineType={engineType}
            torrents={torrents}
        />
    );

    const renderDeleteModal = () => (
        <RemoveConfirmationModal
            isOpen={Boolean(pendingDelete)}
            onClose={() => clearPendingDelete()}
            onConfirm={async (deleteData: boolean) => {
                await confirmDelete(deleteData);
            }}
            torrentIds={pendingDelete?.torrents.map((t) => t.id) ?? []}
            torrentCount={pendingDelete?.torrents.length ?? 0}
            defaultDeleteData={Boolean(pendingDelete?.deleteData)}
        />
    );

    return (
        <div
            {...getRootProps()}
            className="tt-app-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20"
        >
            <input {...getInputProps()} />

            {isImmersiveShell && !isNativeHost && (
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-background/95" />
                    <div className="absolute inset-0 mix-blend-screen opacity-50 bg-primary/20" />
                    <div className="absolute inset-0 mix-blend-screen opacity-40 bg-content1/15" />
                    <div className="absolute inset-0 bg-noise opacity-20" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 h-shell-accent-large rounded-full bg-primary/30 blur-glass opacity-40" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 h-shell-accent-medium rounded-full bg-primary/30 blur-glass opacity-35" />
                </div>
            )}

            <AnimatePresence>
                {lifecycleRpcStatus === STATUS.connection.ERROR && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={TOAST_SPRING_TRANSITION}
                        className="fixed z-40"
                        style={{
                            bottom: "var(--spacing-panel)",
                            right: "var(--spacing-panel)",
                        }}
                    >
                        <Button
                            size="md"
                            variant="shadow"
                            color="warning"
                            onPress={handleReconnect}
                        >
                            {t("status_bar.reconnect")}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative z-10 flex w-full flex-1">
                <div
                    className={cn(
                        "tt-shell-body mx-auto flex w-full flex-1 flex-col",
                        isNativeHost && "native-shell-body",
                        isImmersiveShell
                            ? isNativeHost
                                ? "gap-stage"
                                : "gap-stage px-panel py-stage sm:px-stage lg:px-stage"
                            : isNativeHost
                            ? "gap-tools"
                            : "gap-tools px-panel py-panel"
                    )}
                    style={
                        isImmersiveShell && !isNativeHost
                            ? { maxWidth: "var(--tt-shell-main-max-w)" }
                            : undefined
                    }
                >
                    {isImmersiveShell ? (
                        <div
                            className="acrylic border shadow-hud"
                            style={{
                                borderRadius: `${IMMERSIVE_CHROME_RADIUS}px`,
                                padding: `${IMMERSIVE_CHROME_PADDING}px`,
                            }}
                        >
                            {renderNavbar()}
                        </div>
                    ) : (
                        renderNavbar()
                    )}

                    {isImmersiveShell ? (
                        <>
                            <div
                                className={cn(
                                    "tt-shell-no-drag acrylic flex-1 min-h-0 h-full border shadow-hud",
                                    isNativeHost && "native-shell-inner"
                                )}
                                style={{
                                    borderRadius: `${IMMERSIVE_MAIN_OUTER_RADIUS}px`,
                                    padding: `${IMMERSIVE_MAIN_PADDING}px`,
                                }}
                            >
                                <main
                                    className={cn(
                                        "flex-1 min-h-0 h-full overflow-hidden border bg-background/20 shadow-inner",
                                        isNativeHost && "native-shell-main"
                                    )}
                                    style={{
                                        borderRadius: `${IMMERSIVE_MAIN_INNER_RADIUS}px`,
                                        padding: `${IMMERSIVE_MAIN_CONTENT_PADDING}px`,
                                    }}
                                >
                                    {renderModeLayoutSection()}
                                </main>
                            </div>
                            {visibleHudCards.length > 0 ? (
                                <section className="tt-shell-no-drag grid gap-panel md:grid-cols-2 xl:grid-cols-3">
                                    <AnimatePresence>
                                        {visibleHudCards.map((card) => {
                                            const Icon = card.icon;
                                            return (
                                                <motion.div
                                                    key={card.id}
                                                    layout
                                                    initial={{
                                                        opacity: 0,
                                                        y: 12,
                                                        scale: 0.98,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        scale: 1,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        y: 12,
                                                        scale: 0.98,
                                                    }}
                                                    transition={{
                                                        duration: 0.2,
                                                    }}
                                                    whileHover={{ y: -4 }}
                                                    className={cn(
                                                        "glass-panel relative overflow-hidden border border-content1/10 bg-background/55 p-panel shadow-hud",
                                                        card.surfaceClass
                                                    )}
                                                    style={{
                                                        borderRadius: `${IMMERSIVE_HUD_CARD_RADIUS}px`,
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            dismissHudCard(
                                                                card.id
                                                            )
                                                        }
                                                        className="absolute rounded-full bg-content1/20 p-tight text-foreground/60 transition hover:bg-content1/40 hover:text-foreground"
                                                        style={{
                                                            right: "var(--spacing-tight)",
                                                            top: "var(--spacing-tight)",
                                                        }}
                                                        aria-label={t(
                                                            "workspace.stage.dismiss_card"
                                                        )}
                                                    >
                                                        <StatusIcon
                                                            Icon={X}
                                                            size="md"
                                                            className="text-current"
                                                        />
                                                    </button>

                                                    <div className="flex items-start gap-workbench">
                                                        <div
                                                            className={cn(
                                                                "flex size-icon-btn-lg items-center justify-center rounded-2xl",
                                                                card.iconBgClass
                                                            )}
                                                        >
                                                            <StatusIcon
                                                                Icon={Icon}
                                                                size="lg"
                                                                className="text-current"
                                                            />
                                                        </div>

                                                        <div className="flex-1">
                                                            <p className="text-sm text-foreground/60">
                                                                {card.title}
                                                            </p>
                                                            <p className="mt-tight text-lg font-semibold text-foreground">
                                                                {card.label}
                                                            </p>
                                                            <p className="mt-panel text-sm text-foreground/60">
                                                                {
                                                                    card.description
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </section>
                            ) : (
                                <> </>
                            )}

                            <div
                                className="tt-shell-no-drag glass-panel border border-content1/10 bg-background/75 shadow-hud backdrop-blur-3xl"
                                style={{
                                    borderRadius: `${IMMERSIVE_CHROME_RADIUS}px`,
                                    padding: `${IMMERSIVE_CHROME_PADDING}px`,
                                }}
                            >
                                {renderStatusBarSection()}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 min-h-0 h-full flex flex-col gap-tools">
                            <div className="tt-shell-no-drag flex-1 min-h-0 h-full">
                                {renderModeLayoutSection()}
                            </div>
                            <div className="tt-shell-no-drag">
                                {renderStatusBarSection()}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {renderDeleteModal()}

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={closeSettings}
                initialConfig={settingsConfig}
                isSaving={isSettingsSaving}
                settingsLoadError={settingsLoadError}
                onSave={handleSaveSettings}
                onTestPort={handleTestPort}
                onRestoreInsights={restoreHudCards}
                onToggleWorkspaceStyle={toggleWorkspaceStyle}
                onReconnect={handleReconnect}
                serverClass={serverClass}
                isNativeMode={nativeIntegration}
                isImmersive={workspaceStyle === "immersive"}
                hasDismissedInsights={hasDismissedInsights}
                onApplyUserPreferencesPatch={applyUserPreferencesPatch}
            />
        </div>
    );
}

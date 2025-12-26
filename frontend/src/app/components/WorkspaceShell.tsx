import { useCallback, useMemo } from "react";
import type { HTMLAttributes, InputHTMLAttributes } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    cn,
} from "@heroui/react";
import { AlertTriangle, Link2, MousePointer, PlugZap, X } from "lucide-react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    SystemInstallOptions,
    SystemInstallResult,
} from "@/services/rpc/types";
import { ModeLayout } from "@/modules/dashboard/components/ModeLayout";
import { AddTorrentModal } from "@/modules/torrent-add/components/AddTorrentModal";
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
import type {
    OptimisticStatusMap,
    TorrentTableAction,
} from "@/modules/dashboard/components/TorrentTable";
import type { PeerContextAction } from "@/modules/dashboard/components/details/tabs/PeersTab";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/components/TorrentDetailView";
import type { SessionStats, TorrentPeerEntity } from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { RpcStatus } from "@/shared/types/rpc";
import type { AddTorrentContext } from "@/app/hooks/useAddTorrent";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import { useRpcExtension } from "@/app/context/RpcExtensionContext";

type AddTorrentPayload = {
    magnetLink?: string;
    metainfo?: string;
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
    openAddModal: () => void;
    openSettings: () => void;
    selectedTorrents: Torrent[];
    handleBulkAction: (action: TorrentTableAction) => Promise<void>;
    rehashStatus?: RehashStatus;
    workspaceStyle: WorkspaceStyle;
    toggleWorkspaceStyle: () => void;
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isTableLoading: boolean;
    handleTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent
    ) => Promise<void>;
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
    handleForceTrackerReannounce: () => Promise<void>;
    sequentialSupported: boolean;
    superSeedingSupported: boolean;
    optimisticStatuses: OptimisticStatusMap;
    handleSelectionChange: (selection: Torrent[]) => void;
    handleOpenFolder: (torrent: Torrent) => Promise<void>;
    peerSortStrategy: PeerSortStrategy;
    inspectorTabCommand: DetailTab | null;
    onInspectorTabCommandHandled: () => void;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    rpcStatus: RpcStatus;
    handleReconnect: () => void;
    pendingDelete: DeleteIntent | null;
    clearPendingDelete: () => void;
    confirmDelete: () => Promise<void>;
    visibleHudCards: AmbientHudCard[];
    dismissHudCard: (cardId: string) => void;
    isAddModalOpen: boolean;
    handleAddModalClose: () => void;
    pendingTorrentFile: File | null;
    incomingMagnetLink: string | null;
    handleAddTorrent: (
        payload: AddTorrentPayload,
        context?: AddTorrentContext
    ) => Promise<void>;
    isAddingTorrent: boolean;
    isSettingsOpen: boolean;
    closeSettings: () => void;
    settingsConfig: SettingsConfig;
    isSettingsSaving: boolean;
    settingsLoadError?: boolean;
    handleSaveSettings: (config: SettingsConfig) => Promise<void>;
    handleTestPort: () => Promise<void>;
    restoreHudCards: () => void;
    tableWatermarkEnabled: boolean;
    torrentClient: EngineAdapter;
}

export function WorkspaceShell({
    getRootProps,
    getInputProps,
    isDragActive,
    filter,
    searchQuery,
    setSearchQuery,
    setFilter,
    openAddModal,
    openSettings,
    selectedTorrents,
    handleBulkAction,
    rehashStatus,
    workspaceStyle,
    toggleWorkspaceStyle,
    torrents,
    ghostTorrents,
    isTableLoading,
    handleTorrentAction,
    handleRequestDetails,
    detailData,
    closeDetail,
    handleFileSelectionChange,
    onFileContextAction,
    onPeerContextAction,
    sequentialToggleHandler,
    superSeedingToggleHandler,
    handleForceTrackerReannounce,
    sequentialSupported,
    superSeedingSupported,
    optimisticStatuses,
    handleSelectionChange,
    handleOpenFolder,
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,
    sessionStats,
    liveTransportStatus,
    rpcStatus,
    handleReconnect,
    pendingDelete,
    clearPendingDelete,
    confirmDelete,
    visibleHudCards,
    dismissHudCard,
    isAddModalOpen,
    handleAddModalClose,
    pendingTorrentFile,
    incomingMagnetLink,
    handleAddTorrent,
    isAddingTorrent,
    isSettingsOpen,
    closeSettings,
    settingsConfig,
    isSettingsSaving,
    settingsLoadError,
    handleSaveSettings,
    handleTestPort,
    restoreHudCards,
    tableWatermarkEnabled,
    torrentClient,
}: WorkspaceShellProps) {
    const { t } = useTranslation();
    const { availability } = useRpcExtension();

    const engineType = useMemo<EngineDisplayType>(() => {
        if (rpcStatus === "connected" && availability === "available") {
            return "tinytorrent";
        }
        if (availability === "unavailable" || availability === "error") {
            return "transmission";
        }
        return "unknown";
    }, [availability, rpcStatus]);
    const isImmersiveShell = workspaceStyle === "immersive";

    const workspaceStyleToggleLabel =
        workspaceStyle === "immersive"
            ? t("workspace.shell.toggle_classic", {
                  defaultValue: "Switch to classic shell",
              })
            : t("workspace.shell.toggle_immersive", {
                  defaultValue: "Switch to immersive shell",
              });

    const handleSystemInstall = useCallback(
        (options: SystemInstallOptions): Promise<SystemInstallResult> => {
            if (!torrentClient.systemInstall) {
                return Promise.reject(
                    new Error("System install not supported")
                );
            }
            return torrentClient.systemInstall(options);
        },
        [torrentClient]
    );

    const renderNavbar = () => (
        <Navbar
            filter={filter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAdd={() => openAddModal()}
            onSettings={() => openSettings()}
            hasSelection={selectedTorrents.length > 0}
            onResumeSelection={() => {
                void handleBulkAction("resume");
            }}
            onPauseSelection={() => {
                void handleBulkAction("pause");
            }}
            onRecheckSelection={() => {
                void handleBulkAction("recheck");
            }}
            onRemoveSelection={() => {
                void handleBulkAction("remove");
            }}
            rehashStatus={rehashStatus}
            workspaceStyle={workspaceStyle}
            onWorkspaceToggle={toggleWorkspaceStyle}
            workspaceToggleLabel={workspaceStyleToggleLabel}
        />
    );

    const renderModeLayoutSection = () => (
        <ModeLayout
            workspaceStyle={workspaceStyle}
            torrents={torrents}
            filter={filter}
            searchQuery={searchQuery}
            isTableLoading={isTableLoading}
            onAction={handleTorrentAction}
            onRequestDetails={handleRequestDetails}
            detailData={detailData}
            onCloseDetail={closeDetail}
            onFilesToggle={handleFileSelectionChange}
            onFileContextAction={onFileContextAction}
            onPeerContextAction={onPeerContextAction}
            onSequentialToggle={sequentialToggleHandler}
            onSuperSeedingToggle={superSeedingToggleHandler}
            onForceTrackerReannounce={handleForceTrackerReannounce}
            sequentialSupported={sequentialSupported}
            superSeedingSupported={superSeedingSupported}
            optimisticStatuses={optimisticStatuses}
            peerSortStrategy={peerSortStrategy}
            inspectorTabCommand={inspectorTabCommand}
            onInspectorTabCommandHandled={onInspectorTabCommandHandled}
            ghostTorrents={ghostTorrents}
            isDropActive={isDragActive}
            onSelectionChange={handleSelectionChange}
            onOpenFolder={handleOpenFolder}
            tableWatermarkEnabled={tableWatermarkEnabled}
        />
    );

    const renderStatusBarSection = () => (
        <StatusBar
            workspaceStyle={workspaceStyle}
            sessionStats={sessionStats}
            rpcStatus={rpcStatus}
            liveTransportStatus={liveTransportStatus}
            selectedTorrent={detailData ?? undefined}
            onEngineClick={handleReconnect}
            engineType={engineType}
        />
    );

    const renderDeleteModal = () => (
        <Modal
            isOpen={Boolean(pendingDelete)}
            onOpenChange={(open) => {
                if (!open) clearPendingDelete();
            }}
            backdrop="blur"
            motionProps={INTERACTION_CONFIG.modalBloom}
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, "shadow-xl"),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader>
                            {t("toolbar.delete_confirm.title")}
                        </ModalHeader>
                        <ModalBody className="text-sm text-foreground/70">
                            {t(
                                pendingDelete?.deleteData
                                    ? "toolbar.delete_confirm.description_with_data"
                                    : "toolbar.delete_confirm.description",
                                { count: pendingDelete?.torrents.length ?? 0 }
                            )}
                        </ModalBody>
                        <ModalFooter className="flex justify-end gap-3">
                            <Button
                                variant="light"
                                onPress={() => clearPendingDelete()}
                            >
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="danger"
                                onPress={confirmDelete}
                                className="shadow-danger/30"
                            >
                                {pendingDelete?.deleteData
                                    ? t("table.actions.remove_with_data")
                                    : t("table.actions.remove")}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );

    return (
        <div
            {...getRootProps()}
            className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20"
        >
            <input {...getInputProps()} />

            {isImmersiveShell && (
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-background/95" />
                    <div className="absolute inset-0 mix-blend-screen opacity-50 bg-primary/20" />
                    <div className="absolute inset-0 mix-blend-screen opacity-40 bg-content1/15" />
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                    <div className="absolute inset-x-[-20%] bottom-[-30%] h-shell-accent-large rounded-full bg-primary/30 blur-(--glass-blur) opacity-40" />
                    <div className="absolute inset-x-[-15%] top-[-35%] h-shell-accent-medium rounded-full bg-blue-500/30 blur-(--glass-blur) opacity-35" />
                </div>
            )}

            <AnimatePresence>
                {rpcStatus === "error" && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={TOAST_SPRING_TRANSITION}
                        className="fixed bottom-6 right-6 z-40"
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
                        "mx-auto flex w-full flex-1 flex-col",
                        isImmersiveShell
                            ? "max-w-(--tt-shell-main-max-w) gap-6 px-4 py-6 sm:px-6 lg:px-10"
                            : "gap-tools px-4 py-4"
                    )}
                >
                    {isImmersiveShell ? (
                        <div
                            className="acrylic border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.45)]"
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
                                className="acrylic flex-1 min-h-0 h-full border border-white/10 shadow-[0_35px_140px_rgba(0,0,0,0.45)]"
                                style={{
                                    borderRadius: `${IMMERSIVE_MAIN_OUTER_RADIUS}px`,
                                    padding: `${IMMERSIVE_MAIN_PADDING}px`,
                                }}
                            >
                                <main
                                    className="flex-1 min-h-0 h-full overflow-hidden border border-white/5 bg-background/20 shadow-inner"
                                    style={{
                                        borderRadius: `${IMMERSIVE_MAIN_INNER_RADIUS}px`,
                                        padding: `${IMMERSIVE_MAIN_CONTENT_PADDING}px`,
                                    }}
                                >
                                    {renderModeLayoutSection()}
                                </main>
                            </div>
                            {visibleHudCards.length > 0 ? (
                                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                                                        "glass-panel relative overflow-hidden border border-content1/10 bg-background/55 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.4)]",
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
                                                        className="absolute right-3 top-3 rounded-full bg-content1/20 p-1 text-foreground/60 transition hover:bg-content1/40 hover:text-foreground"
                                                        aria-label={t(
                                                            "workspace.stage.dismiss_card",
                                                            {
                                                                defaultValue:
                                                                    "Dismiss card",
                                                            }
                                                        )}
                                                    >
                                                        <X
                                                            size={12}
                                                            strokeWidth={
                                                                ICON_STROKE_WIDTH
                                                            }
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
                                                            <Icon
                                                                size={18}
                                                                strokeWidth={
                                                                    ICON_STROKE_WIDTH
                                                                }
                                                                className="text-current"
                                                            />
                                                        </div>

                                                        <div className="flex-1">
                                                            <p className="text-sm text-foreground/60">
                                                                {card.title}
                                                            </p>
                                                            <p className="mt-1 text-lg font-semibold text-foreground">
                                                                {card.label}
                                                            </p>
                                                            <p className="mt-3 text-sm text-foreground/60">
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
                                className="glass-panel border border-content1/10 bg-background/75 shadow-[0_25px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl"
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
                            <div className="flex-1 min-h-0 h-full">
                                {renderModeLayoutSection()}
                            </div>
                            {renderStatusBarSection()}
                        </div>
                    )}
                </div>
            </div>

            {renderDeleteModal()}

            <AddTorrentModal
                isOpen={isAddModalOpen}
                onClose={handleAddModalClose}
                initialFile={pendingTorrentFile}
                initialMagnetLink={incomingMagnetLink ?? undefined}
                initialDownloadDir={settingsConfig.download_dir}
                onAdd={handleAddTorrent}
                isSubmitting={isAddingTorrent}
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={closeSettings}
                initialConfig={settingsConfig}
                isSaving={isSettingsSaving}
                settingsLoadError={settingsLoadError}
                onSave={handleSaveSettings}
                onTestPort={handleTestPort}
                onRestoreInsights={restoreHudCards}
                onSystemInstall={
                    torrentClient.systemInstall
                        ? handleSystemInstall
                        : undefined
                }
                onReconnect={handleReconnect}
                rpcStatus={rpcStatus}
                torrentClient={torrentClient}
            />
        </div>
    );
}

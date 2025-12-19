import { useCallback } from "react";
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

import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import type {
    SystemInstallOptions,
    SystemInstallResult,
} from "../../services/rpc/types";
import { ModeLayout } from "../../modules/dashboard/components/ModeLayout";
import { AddTorrentModal } from "../../modules/torrent-add/components/AddTorrentModal";
import { SettingsModal } from "../../modules/settings/components/SettingsModal";
import { Navbar } from "./layout/Navbar";
import { StatusBar } from "./layout/StatusBar";
import type { SettingsConfig } from "../../modules/settings/data/config";
import { INTERACTION_CONFIG } from "../../config/logic";
import { ICON_STROKE_WIDTH } from "../../config/logic";
import { GLASS_MODAL_SURFACE } from "../../shared/ui/layout/glass-surface";
import type {
    AmbientHudCard,
    DeleteIntent,
    GlobalActionFeedback,
    RehashStatus,
} from "../types/workspace";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "../../shared/ui/workspace/FileExplorerTree";
import type {
    Torrent,
    TorrentDetail,
} from "../../modules/dashboard/types/torrent";
import type {
    OptimisticStatusMap,
    TorrentTableAction,
} from "../../modules/dashboard/components/TorrentTable";
import type { PeerContextAction } from "../../modules/dashboard/components/details/tabs/PeersTab";
import type {
    DetailTab,
    PeerSortStrategy,
} from "../../modules/dashboard/components/TorrentDetailView";
import type {
    SessionStats,
    TorrentPeerEntity,
} from "../../services/rpc/entities";
import type { RpcStatus } from "../../shared/types/rpc";
import type { AddTorrentContext } from "../hooks/useAddTorrent";
import type { WorkspaceStyle } from "../hooks/useWorkspaceShell";

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
    globalActionFeedback: GlobalActionFeedback | null;
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
    downHistory: number[];
    upHistory: number[];
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
    globalActionFeedback,
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
    downHistory,
    upHistory,
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
    handleSaveSettings,
    handleTestPort,
    restoreHudCards,
    tableWatermarkEnabled,
    torrentClient,
}: WorkspaceShellProps) {
    const { t } = useTranslation();
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
            actionFeedback={globalActionFeedback}
            rehashStatus={rehashStatus}
            workspaceStyle={workspaceStyle}
            onWorkspaceToggle={toggleWorkspaceStyle}
            workspaceToggleLabel={workspaceStyleToggleLabel}
        />
    );

    const renderModeLayoutSection = () => (
        <ModeLayout
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
            sessionStats={sessionStats}
            downHistory={downHistory}
            upHistory={upHistory}
            rpcStatus={rpcStatus}
            selectedTorrent={detailData ?? undefined}
            actionFeedback={globalActionFeedback}
            onEngineClick={handleReconnect}
        />
    );

    const renderDeleteModal = () => (
        <Modal
            isOpen={Boolean(pendingDelete)}
            onOpenChange={(open) => {
                if (!open) clearPendingDelete();
            }}
            size="sm"
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
                    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(4,7,16,0.95),rgba(9,12,22,0.92))]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_60%)] mix-blend-screen opacity-80" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_5%,rgba(236,72,153,0.25),transparent_50%)] mix-blend-screen opacity-70" />
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                    <div className="absolute inset-x-[-20%] bottom-[-30%] h-[55%] rounded-[999px] bg-primary/30 blur-[220px] opacity-40" />
                    <div className="absolute inset-x-[-15%] top-[-35%] h-[50%] rounded-[999px] bg-blue-500/30 blur-[220px] opacity-35" />
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
                            size="sm"
                            variant="flat"
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
                            ? "max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:px-10"
                            : "gap-2 px-4 py-4"
                    )}
                >
                    {isImmersiveShell ? (
                        <div className="glass-panel rounded-[32px] border border-content1/10 bg-background/70 px-2 py-2 shadow-[0_25px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                            {renderNavbar()}
                        </div>
                    ) : (
                        renderNavbar()
                    )}

                    {isImmersiveShell ? (
                        <>
                            <div className="glass-panel flex-1 min-h-0 h-full rounded-[36px] border border-content1/10 bg-background/65 p-2 shadow-[0_35px_140px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                                <main className="flex-1 min-h-0 h-full overflow-hidden rounded-[32px] border border-content1/10 bg-background/80 px-4 py-4 shadow-inner shadow-black/30">
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
                                                    whileHover={{
                                                        y: -4,
                                                    }}
                                                    className={cn(
                                                        "glass-panel relative overflow-hidden rounded-[28px] border border-content1/10 bg-background/55 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.4)]",
                                                        card.surfaceClass
                                                    )}
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
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-foreground/40">
                                                                {card.label}
                                                            </p>
                                                            <p className="mt-1 text-lg font-semibold text-foreground">
                                                                {card.title}
                                                            </p>
                                                        </div>
                                                        <div
                                                            className={cn(
                                                                "flex h-11 w-11 items-center justify-center rounded-2xl",
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
                                                    </div>
                                                    <p className="mt-3 text-sm text-foreground/60">
                                                        {card.description}
                                                    </p>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </section>
                            ) : (
                                <> </>
                            )}

                            <div className="glass-panel rounded-[32px] border border-content1/10 bg-background/75 px-2 py-2 shadow-[0_25px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                                {renderStatusBarSection()}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 min-h-0 h-full flex flex-col gap-2">
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
                onAdd={handleAddTorrent}
                isSubmitting={isAddingTorrent}
                getFreeSpace={torrentClient.checkFreeSpace}
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={closeSettings}
                initialConfig={settingsConfig}
                isSaving={isSettingsSaving}
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

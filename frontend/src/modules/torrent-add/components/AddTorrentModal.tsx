import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    cn,
} from "@heroui/react";
import { ArrowDown, FileText, FileUp, HardDrive, Zap } from "lucide-react";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
    type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { DirectoryPicker } from "../../../shared/ui/workspace/DirectoryPicker";
import {
    FileExplorerTree,
    type FileExplorerEntry,
} from "../../../shared/ui/workspace/FileExplorerTree";
import { DiskSpaceGauge } from "../../../shared/ui/workspace/DiskSpaceGauge";
import {
    parseTorrentFile,
    type TorrentMetadata,
} from "../../../shared/utils/torrent";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { getDriveSpace } from "@/services/rpc/rpc-extended";
import { ICON_STROKE_WIDTH } from "../../../config/logic";
import { INTERACTION_CONFIG } from "../../../config/logic";
import { GLASS_MODAL_SURFACE } from "../../../shared/ui/layout/glass-surface";
import type { AddTorrentContext } from "../../../app/hooks/useAddTorrent";
import { useRpcExtension } from "@/app/context/RpcExtensionContext";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";

interface AddTorrentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (
        payload: {
            magnetLink?: string;
            metainfo?: string;
            downloadDir: string;
            startNow: boolean;
            filesUnwanted?: number[];
        },
        context?: AddTorrentContext
    ) => Promise<void>;
    isSubmitting: boolean;
    initialFile?: File | null;
    initialMagnetLink?: string | null;
}

const DEFAULT_SAVE_PATH = "C:/Downloads/Torrents";

export function AddTorrentModal({
    isOpen,
    onClose,
    onAdd,
    isSubmitting,
    initialFile,
    initialMagnetLink,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const { isMocked, shouldUseExtension } = useRpcExtension();
    const canUseExtensionHelpers = shouldUseExtension || isMocked;
    const [magnetLink, setMagnetLink] = useState("");
    const [downloadDir, setDownloadDir] = useState(DEFAULT_SAVE_PATH);
    const [startNow, setStartNow] = useState(true);
    const [isDirectoryPickerOpen, setDirectoryPickerOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [directorySpace, setDirectorySpace] =
        useState<TransmissionFreeSpace | null>(null);
    const [isSpaceLoading, setIsSpaceLoading] = useState(false);
    const [spaceError, setSpaceError] = useState<string | null>(null);
    const [torrentMetadata, setTorrentMetadata] =
        useState<TorrentMetadata | null>(null);
    const [filesUnwanted, setFilesUnwanted] = useState<Set<number>>(
        () => new Set()
    );
    const [isParsingTorrent, setIsParsingTorrent] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    const readFileAsBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const buffer = reader.result;
                if (!(buffer instanceof ArrayBuffer)) {
                    reject(new Error("Unable to parse torrent file"));
                    return;
                }
                const bytes = new Uint8Array(buffer);
                let binary = "";
                const chunkSize = 0x8000;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, i + chunkSize);
                    binary += String.fromCharCode(...chunk);
                }
                resolve(window.btoa(binary));
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.target.files?.[0] ?? null;
        setSelectedFile(nextFile);
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const openDirectoryPicker = () => setDirectoryPickerOpen(true);
    const closeDirectoryPicker = () => setDirectoryPickerOpen(false);
    const handleDirectorySelect = (path: string) => {
        setDownloadDir(path);
        closeDirectoryPicker();
    };

    useEffect(() => {
        if (!isOpen) {
            setMagnetLink("");
            setStartNow(true);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setDirectoryPickerOpen(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!canUseExtensionHelpers && isDirectoryPickerOpen) {
            setDirectoryPickerOpen(false);
        }
    }, [canUseExtensionHelpers, isDirectoryPickerOpen]);

    useEffect(() => {
        if (isOpen && initialFile) {
            setSelectedFile(initialFile);
        }
    }, [initialFile, isOpen]);

    useEffect(() => {
        if (!isOpen || !initialMagnetLink) return;
        setMagnetLink(initialMagnetLink);
    }, [initialMagnetLink, isOpen]);

    useEffect(() => {
        let active = true;
        if (!selectedFile) {
            setTorrentMetadata(null);
            setFilesUnwanted(new Set());
            setParseError(null);
            setIsParsingTorrent(false);
            return () => {
                active = false;
            };
        }
        setIsParsingTorrent(true);
        setParseError(null);
        parseTorrentFile(selectedFile)
            .then((metadata: TorrentMetadata) => {
                if (!active) return;
                setTorrentMetadata(metadata);
                setFilesUnwanted(new Set());
            })
            .catch(() => {
                if (!active) return;
                setTorrentMetadata(null);
                setParseError(t("modals.file_tree_error"));
            })
            .finally(() => {
                if (!active) return;
                setIsParsingTorrent(false);
            });
        return () => {
            active = false;
        };
    }, [selectedFile, t]);

    useEffect(() => {
        let active = true;
        if (!canUseExtensionHelpers) {
            setDirectorySpace(null);
            setSpaceError(null);
            setIsSpaceLoading(false);
            return () => {
                active = false;
            };
        }
        setIsSpaceLoading(true);
        setSpaceError(null);
        getDriveSpace(torrentClient, downloadDir, {
            useExtension: shouldUseExtension,
            allowMock: isMocked,
        })
            .then((space) => {
                if (!active) return;
                setDirectorySpace(space);
            })
            .catch(() => {
                if (!active) return;
                setDirectorySpace(null);
                setSpaceError(t("modals.disk_gauge_error"));
            })
            .finally(() => {
                if (!active) return;
                setIsSpaceLoading(false);
            });
        return () => {
            active = false;
        };
    }, [
        downloadDir,
        canUseExtensionHelpers,
        shouldUseExtension,
        isMocked,
        t,
        torrentClient,
    ]);

    const fileTreeEntries = useMemo<FileExplorerEntry[]>(() => {
        if (!torrentMetadata) return [];
        return torrentMetadata.files.map(
            (file: TorrentMetadata["files"][number], index: number) => ({
                name: file.path,
                index,
                length: file.length,
                wanted: !filesUnwanted.has(index),
            })
        );
    }, [torrentMetadata, filesUnwanted]);

    const torrentSize = useMemo(() => {
        if (!torrentMetadata) return 0;
        return torrentMetadata.files.reduce(
            (acc, file) => acc + file.length,
            0
        );
    }, [torrentMetadata]);

    const canSubmit = useMemo(
        () => Boolean(magnetLink.trim() || selectedFile),
        [magnetLink, selectedFile]
    );
    const hasTorrentSize = typeof torrentSize === "number" && torrentSize > 0;
    const hasFreeSpace = typeof directorySpace?.sizeBytes === "number";
    const isSpaceInsufficient =
        hasTorrentSize &&
        hasFreeSpace &&
        torrentSize > (directorySpace?.sizeBytes ?? 0);

    const handleSubmit = async () => {
        if (!canSubmit || isSubmitting) return;
        const trimmedLink = magnetLink.trim();
        const ghostLabel =
            torrentMetadata?.name ?? trimmedLink ?? t("modals.add_title");
        const ghostContext: AddTorrentContext = {
            label: ghostLabel,
            strategy: trimmedLink ? "magnet_lookup" : "loading",
        };
        try {
            const payload: {
                magnetLink?: string;
                metainfo?: string;
                downloadDir: string;
                startNow: boolean;
                filesUnwanted?: number[];
            } = {
                downloadDir,
                startNow,
            };
            if (selectedFile) {
                payload.metainfo = await readFileAsBase64(selectedFile);
            } else if (trimmedLink) {
                payload.magnetLink = trimmedLink;
            }
            if (torrentMetadata && filesUnwanted.size) {
                const filtered = Array.from(filesUnwanted).sort(
                    (a, b) => a - b
                );
                if (filtered.length) {
                    (payload as { filesUnwanted?: number[] }).filesUnwanted =
                        filtered;
                }
            }
            await onAdd(payload, ghostContext);
            onClose();
        } catch {
            // The caller will handle errors; keep the modal open for corrections.
        }
    };

    const handleFilesToggle = useCallback(
        (indexes: number[], wanted: boolean) => {
            setFilesUnwanted((prev) => {
                const next = new Set(prev);
                indexes.forEach((index) => {
                    if (wanted) next.delete(index);
                    else next.add(index);
                });
                return next;
            });
        },
        []
    );

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => !open && onClose()}
            placement="center"
            backdrop="blur"
            size="2xl"
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, "w-full max-w-[720px]"),
                closeButton: "hover:bg-content1/10 active:bg-content1/20",
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent>
                {(handleClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <FileUp
                                    size={22}
                                    strokeWidth={ICON_STROKE_WIDTH + 0.5}
                                    className="text-primary"
                                />
                                {t("modals.add_title")}
                            </h3>
                        </ModalHeader>
                        <ModalBody className="py-6 space-y-6">
                            <Input
                                autoFocus
                                value={magnetLink}
                                onChange={(event) =>
                                    setMagnetLink(event.target.value)
                                }
                                label={t("modals.magnet_label")}
                                placeholder={t("modals.magnet_placeholder")}
                                variant="bordered"
                                labelPlacement="outside"
                                classNames={{
                                    label: "text-foreground/50 font-medium text-xs uppercase tracking-wider",
                                    inputWrapper:
                                        "bg-content1/15 border-content1/20 data-[hover=true]:border-primary/50 group-data-[focus=true]:border-primary transition-colors",
                                    input: "font-mono text-sm",
                                }}
                            />
                            <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-3 space-y-2">
                                <div className="flex items-center justify-between text-foreground/60">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                                        <FileText
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        {t("modals.file_label")}
                                    </div>
                                    {selectedFile && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            color="danger"
                                            onPress={clearSelectedFile}
                                        >
                                            {t("modals.file_remove")}
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-mono text-foreground/70 truncate">
                                        {selectedFile
                                            ? selectedFile.name
                                            : t("modals.file_placeholder")}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="light"
                                            onPress={() =>
                                                fileInputRef.current?.click()
                                            }
                                        >
                                            {t("modals.file_browse")}
                                        </Button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".torrent"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-foreground/50">
                                    {t("modals.file_help")}
                                </p>
                            </div>
                            {torrentMetadata && (
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] uppercase tracking-[0.3em] text-foreground/60">
                                            {t("modals.file_tree_title")}
                                        </span>
                                        <span className="text-[11px] text-foreground/50">
                                            {t("modals.file_count", {
                                                count: torrentMetadata.files
                                                    .length,
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-foreground/50">
                                        {t("modals.file_tree_description")}
                                    </p>
                                    <div className="max-h-[280px] overflow-y-auto">
                                        <FileExplorerTree
                                            files={fileTreeEntries}
                                            emptyMessage={t(
                                                "modals.file_tree_empty"
                                            )}
                                            onFilesToggle={handleFilesToggle}
                                        />
                                    </div>
                                </div>
                            )}
                            {selectedFile && !torrentMetadata && (
                                <div className="rounded-xl border border-content1/20 bg-background/30 px-4 py-3 text-[11px] text-foreground/50">
                                    {isParsingTorrent
                                        ? t("modals.file_tree_loading")
                                        : parseError ??
                                          t("modals.file_tree_waiting")}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-3 space-y-2">
                                    <div className="flex items-center gap-2 text-foreground/60">
                                        <HardDrive
                                            size={18}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        <span className="text-xs font-bold uppercase tracking-wider">
                                            {t("modals.save_path")}
                                        </span>
                                    </div>
                                    <Input
                                        labelPlacement="outside"
                                        value={downloadDir}
                                        onChange={(event) =>
                                            setDownloadDir(event.target.value)
                                        }
                                        variant="flat"
                                        size="sm"
                                        classNames={{
                                            input: "font-mono text-xs",
                                            inputWrapper:
                                                "bg-content1/10 border-content1/20",
                                        }}
                                        endContent={
                                            canUseExtensionHelpers ? (
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    color="primary"
                                                    onPress={
                                                        openDirectoryPicker
                                                    }
                                                    className="text-[10px] font-semibold uppercase tracking-[0.3em] px-3 py-1"
                                                >
                                                    {t(
                                                        "settings.button.browse"
                                                    )}
                                                </Button>
                                            ) : undefined
                                        }
                                    />
                                </div>
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-3 space-y-2 flex flex-col">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-foreground/60">
                                            <Zap
                                                size={18}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-wider">
                                                {t("modals.options")}
                                            </span>
                                        </div>
                                        <Switch
                                            size="sm"
                                            isSelected={startNow}
                                            color="success"
                                            onValueChange={(value) =>
                                                setStartNow(Boolean(value))
                                            }
                                        />
                                    </div>
                                    <p className="text-xs font-medium text-foreground/60">
                                        {t("modals.start_now")}
                                    </p>
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter className="flex flex-col gap-3">
                            {canUseExtensionHelpers && (
                                <DiskSpaceGauge
                                    freeBytes={directorySpace?.sizeBytes}
                                    totalBytes={directorySpace?.totalSize}
                                    torrentSize={torrentSize}
                                    path={downloadDir}
                                    isLoading={isSpaceLoading}
                                    error={spaceError}
                                    isInsufficient={isSpaceInsufficient}
                                />
                            )}
                            <div className="flex w-full items-center justify-between gap-3">
                                <Button
                                    variant="light"
                                    onPress={handleClose}
                                    className="text-foreground/50 hover:text-foreground flex-1"
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    color="primary"
                                    variant="shadow"
                                    onPress={handleSubmit}
                                    startContent={
                                        <ArrowDown
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                    }
                                    isLoading={isSubmitting}
                                    isDisabled={
                                        !canSubmit ||
                                        isSubmitting ||
                                        isSpaceInsufficient
                                    }
                                    className="flex-1"
                                >
                                    {t("modals.download")}
                                </Button>
                            </div>
                            {isSpaceInsufficient && (
                                <p className="text-[10px] text-warning">
                                    {t("modals.disk_gauge.insufficient")}
                                </p>
                            )}
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
            {canUseExtensionHelpers && (
                <DirectoryPicker
                    isOpen={isDirectoryPickerOpen}
                    initialPath={downloadDir}
                    onClose={closeDirectoryPicker}
                    onSelect={handleDirectorySelect}
                />
            )}
        </Modal>
    );
}

// All config tokens imported from '@/config/logic'. ICON_STROKE_WIDTH and INTERACTION_CONFIG used. Magic numbers and business logic flagged for follow-up refactor.

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
import type { TFunction } from "i18next";
import {
    FileExplorerTree,
    type FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import { DiskSpaceGauge } from "@/shared/ui/workspace/DiskSpaceGauge";
import { parseTorrentFile, type TorrentMetadata } from "@/shared/utils/torrent";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { AddTorrentContext } from "@/app/hooks/useAddTorrent";
import { NativeShell } from "@/app/runtime";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";

type AddTorrentModalPayload = {
    magnetLink?: string;
    metainfo?: string;
    metainfoPath?: string;
    downloadDir: string;
    startNow: boolean;
    filesUnwanted?: number[];
};

type AddTorrentSource =
    | { type: "native"; path: string }
    | { type: "file"; file: File }
    | { type: "magnet"; magnetLink: string };

interface AddTorrentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (
        payload: AddTorrentModalPayload,
        context?: AddTorrentContext
    ) => Promise<void>;
    isSubmitting: boolean;
    initialFile?: File | null;
    initialMagnetLink?: string | null;
    initialDownloadDir?: string;
    isNativeMode: boolean;
}

export function AddTorrentModal({
    isOpen,
    onClose,
    onAdd,
    isSubmitting,
    initialFile,
    initialMagnetLink,
    initialDownloadDir,
    isNativeMode,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const canBrowseDirectories = NativeShell.isAvailable;
    const checkFreeSpace = useMemo(
        () =>
            torrentClient.checkFreeSpace
                ? (path: string) => torrentClient.checkFreeSpace!(path)
                : undefined,
        [torrentClient]
    );
    const supportsCheckFreeSpace = Boolean(checkFreeSpace);
    const initialDownloadDirValue = initialDownloadDir?.trim() ?? "";
    const [magnetLink, setMagnetLink] = useState("");
    const [downloadDir, setDownloadDir] = useState(initialDownloadDirValue);
    const [startNow, setStartNow] = useState(true);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedNativeFilePath, setSelectedNativeFilePath] =
        useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const lastInitialDownloadDir = useRef(initialDownloadDirValue);
    const [torrentMetadata, setTorrentMetadata] =
        useState<TorrentMetadata | null>(null);
    const [filesUnwanted, setFilesUnwanted] = useState<Set<number>>(
        () => new Set()
    );
    const [isParsingTorrent, setIsParsingTorrent] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [hasSubmitError, setHasSubmitError] = useState(false);

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
        setSelectedNativeFilePath(null);
        setSelectedFile(nextFile);
    };

    const handleNativeFileSelection = useCallback(async () => {
        if (!isNativeMode || !NativeShell.isAvailable) {
            return;
        }
        setSelectedFile(null);
        try {
            const path = await NativeShell.openFileDialog();
            if (typeof path === "string" && path) {
                setSelectedNativeFilePath(path);
            }
        } catch {
            setParseError(t("modals.file_tree_error"));
        }
    }, [isNativeMode, t]);

    const clearSelectedFile = () => {
        setSelectedFile(null);
        setSelectedNativeFilePath(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const clearSubmitError = useCallback(() => {
        setHasSubmitError(false);
        setSubmitError(null);
    }, []);

    const {
        directorySpace,
        isSpaceLoading,
        spaceError,
        spaceHint,
        refreshDiskSpace,
        reportSpaceError,
    } = useDiskSpaceProbe({
        isOpen,
        downloadDir,
        checkFreeSpace,
        supportsCheckFreeSpace,
        t,
    });

    const handleBrowseDirectory = useCallback(async () => {
        if (!canBrowseDirectories) return;
        try {
            const selected = await NativeShell.browseDirectory(downloadDir);
            if (selected) {
                setDownloadDir(selected);
            }
        } catch {
            reportSpaceError(t("modals.disk_gauge_error"));
        }
    }, [canBrowseDirectories, downloadDir, reportSpaceError, t]);

    useEffect(() => {
        if (!isOpen) {
            setMagnetLink("");
            setStartNow(true);
            setSelectedFile(null);
            setSelectedNativeFilePath(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            clearSubmitError();
        }
    }, [isOpen, clearSubmitError]);

    useEffect(() => {
        const nextDefault = initialDownloadDirValue;
        if (!isOpen) {
            lastInitialDownloadDir.current = nextDefault;
            return;
        }
        setDownloadDir((current) => {
            if (!current || current === lastInitialDownloadDir.current) {
                return nextDefault;
            }
            return current;
        });
        lastInitialDownloadDir.current = nextDefault;
    }, [initialDownloadDirValue, isOpen]);

    useEffect(() => {
        let active = true;
        if (!isOpen || downloadDir.trim() || initialDownloadDirValue) {
            return () => {
                active = false;
            };
        }
        if (!torrentClient.fetchSessionSettings) {
            return () => {
                active = false;
            };
        }
        torrentClient
            .fetchSessionSettings()
            .then((settings) => {
                if (!active) return;
                const sessionDir = settings["download-dir"];
                if (typeof sessionDir === "string" && sessionDir.trim()) {
                    setDownloadDir(sessionDir);
                }
            })
            .catch(() => {
                // Swallow fetch errors; the modal can still accept manual input.
            });
        return () => {
            active = false;
        };
    }, [
        downloadDir,
        initialDownloadDirValue,
        isOpen,
        torrentClient,
    ]);

    useEffect(() => {
        if (isNativeMode || !isOpen || !initialFile) {
            return;
        }
        setSelectedFile(initialFile);
    }, [initialFile, isOpen, isNativeMode]);

    useEffect(() => {
        if (!isOpen || !initialMagnetLink) return;
        setMagnetLink(initialMagnetLink);
    }, [initialMagnetLink, isOpen]);

    useEffect(() => {
        let active = true;
        if (isNativeMode || !selectedFile) {
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
    }, [selectedFile, t, isNativeMode]);

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

    const magnetLinkValue = useMemo(() => {
        const trimmed = magnetLink.trim();
        if (trimmed) return trimmed;
        return initialMagnetLink?.trim() ?? undefined;
    }, [magnetLink, initialMagnetLink]);

    const source = useMemo<AddTorrentSource | null>(() => {
        const trimmedNativePath = selectedNativeFilePath?.trim();
        if (trimmedNativePath) {
            return { type: "native", path: trimmedNativePath };
        }
        if (selectedFile) {
            return { type: "file", file: selectedFile };
        }
        if (magnetLinkValue) {
            return { type: "magnet", magnetLink: magnetLinkValue };
        }
        return null;
    }, [selectedNativeFilePath, selectedFile, magnetLinkValue]);

    const canSubmit = Boolean(source);
    const hasTorrentSize = typeof torrentSize === "number" && torrentSize > 0;
    const hasFreeSpace = typeof directorySpace?.sizeBytes === "number";
    const isSpaceInsufficient =
        hasTorrentSize &&
        hasFreeSpace &&
        torrentSize > (directorySpace?.sizeBytes ?? 0);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        clearSubmitError();
        if (!source) {
            setHasSubmitError(true);
            setSubmitError(t("modals.add_error_source_missing"));
            return;
        }
        const ghostLabel =
            torrentMetadata?.name ??
            (source.type === "file"
                ? source.file.name
                : source.type === "native"
                ? source.path
                : source.magnetLink) ??
            t("modals.add_title");
        const ghostContext: AddTorrentContext = {
            label: ghostLabel,
            strategy: source.type === "magnet" ? "magnet_lookup" : "loading",
        };
        try {
            const payload: AddTorrentModalPayload = {
                downloadDir,
                startNow,
            };
            if (source.type === "native") {
                payload.metainfoPath = source.path;
            } else if (source.type === "file") {
                try {
                    payload.metainfo = await readFileAsBase64(source.file);
                } catch (error) {
                    setHasSubmitError(true);
                    setSubmitError(
                        isFileAccessError(error)
                            ? t("modals.file_unavailable")
                            : resolveSubmitErrorMessage(error) ??
                                  t("modals.add_error_default")
                    );
                    return;
                }
            } else if (source.type === "magnet") {
                payload.magnetLink = source.magnetLink;
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
            if (import.meta.env.DEV) {
                const logSource = source.type === "magnet" ? "magnet" : "file";
                console.info(
                    "[tiny-torrent][add] source=%s downloadDir=%s startNow=%s filesUnwanted=%s",
                    logSource,
                    payload.downloadDir,
                    payload.startNow,
                    filesUnwanted.size
                );
            }
            await onAdd(payload, ghostContext);
            onClose();
        } catch (error) {
            setHasSubmitError(true);
            setSubmitError(resolveSubmitErrorMessage(error));
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
                base: cn(
                    GLASS_MODAL_SURFACE,
                    "w-full max-w-[var(--tt-modal-add-w)]"
                ),
                closeButton: "hover:bg-content1/10 active:bg-content1/20",
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent>
                {(handleClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-tight">
                            <h3 className="text-lg font-bold flex items-center gap-tools">
                                <FileUp
                                    size={22}
                                    strokeWidth={ICON_STROKE_WIDTH + 0.5}
                                    className="text-primary"
                                />
                                {t("modals.add_title")}
                            </h3>
                        </ModalHeader>
                        <ModalBody className="py-panel space-y-stage">
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
                                        "bg-content1/15 border-content1/20 hover:border-primary/50 group-focus:border-primary transition-colors",
                                    input: "font-mono text-sm",
                                }}
                            />
                            <div className="rounded-xl border border-content1/20 bg-content1/15 px-panel py-panel space-y-tight">
                                <div className="flex items-center justify-between text-foreground/60">
                                    <div className="flex items-center gap-tools text-xs font-bold uppercase tracking-wider">
                                        <FileText
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                        />
                                        {t("modals.file_label")}
                                    </div>
                                    {selectedFile && (
                                        <Button
                                            size="md"
                                            variant="ghost"
                                            color="danger"
                                            onPress={clearSelectedFile}
                                        >
                                            {t("modals.file_remove")}
                                        </Button>
                                    )}
                                </div>
                                    <div className="flex items-center justify-between gap-tools">
                                        <p className="text-sm font-mono text-foreground/70 truncate">
                                            {selectedNativeFilePath
                                                ? selectedNativeFilePath
                                                : selectedFile
                                                ? selectedFile.name
                                                : t(
                                                      "modals.file_placeholder"
                                                  )}
                                        </p>
                                    <div className="flex items-center gap-tools">
                                        <Button
                                            size="md"
                                            variant="bordered"
                                            onPress={() =>
                                                isNativeMode
                                                    ? void handleNativeFileSelection()
                                                    : fileInputRef.current?.click()
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
                                <p
                                    style={{
                                        fontSize: "var(--tt-font-size-base)",
                                    }}
                                    className="text-foreground/50"
                                >
                                    {t("modals.file_help")}
                                </p>
                            </div>
                            {!isNativeMode && torrentMetadata && (
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-panel py-panel space-y-tight">
                                    <div className="flex items-center justify-between">
                                        <span
                                            style={{
                                                fontSize:
                                                    "var(--tt-font-size-base)",
                                                letterSpacing:
                                                    "var(--tt-tracking-ultra)",
                                            }}
                                            className="uppercase text-foreground/60"
                                        >
                                            {t("modals.file_tree_title")}
                                        </span>
                                        <span
                                            style={{
                                                fontSize:
                                                    "var(--tt-font-size-base)",
                                            }}
                                            className="text-foreground/50"
                                        >
                                            {t("modals.file_count", {
                                                count: torrentMetadata.files
                                                    .length,
                                            })}
                                        </span>
                                    </div>
                                    <p
                                        style={{
                                            fontSize:
                                                "var(--tt-font-size-base)",
                                        }}
                                        className="text-foreground/50"
                                    >
                                        {t("modals.file_tree_description")}
                                    </p>
                                    <div
                                        className="max-h-[var(--tt-modal-body-max-h)] overflow-y-auto"
                                    >
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
                            {!isNativeMode && selectedFile && !torrentMetadata && (
                                <div
                                    className="rounded-xl border border-content1/20 bg-background/30 px-panel py-panel"
                                    style={{
                                        fontSize: "var(--tt-font-size-base)",
                                    }}
                                >
                                    <span className="text-foreground/50">
                                        {isParsingTorrent
                                            ? t("modals.file_tree_loading")
                                            : parseError ??
                                              t("modals.file_tree_waiting")}
                                    </span>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-panel">
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-panel py-panel space-y-tight">
                                    <div className="flex items-center gap-tools text-foreground/60">
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
                                        variant="bordered"
                                        size="md"
                                        classNames={{
                                            input: "font-mono text-xs",
                                            inputWrapper:
                                                "bg-content1/10 border-content1/20",
                                        }}
                                        endContent={
                                            canBrowseDirectories ? (
                                                <Button
                                                    size="md"
                                                    variant="shadow"
                                                    color="primary"
                                                    onPress={handleBrowseDirectory}
                                                    className="font-semibold uppercase px-panel py-tight"
                                                    style={{
                                                        fontSize:
                                                            "var(--tt-font-size-base)",
                                                        letterSpacing:
                                                            "var(--tt-tracking-ultra)",
                                                    }}
                                                >
                                                    {t("settings.button.browse")}
                                                </Button>
                                            ) : undefined
                                        }
                                    />
                                </div>
                                <div className="rounded-xl border border-content1/20 bg-content1/15 px-panel py-panel space-y-tight flex flex-col">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-tools text-foreground/60">
                                            <Zap
                                                size={18}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-wider">
                                                {t("modals.options")}
                                            </span>
                                        </div>
                                        <Switch
                                            size="md"
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
                        <ModalFooter className="flex flex-col gap-tools">
                            {supportsCheckFreeSpace && (
                                <DiskSpaceGauge
                                    freeBytes={directorySpace?.sizeBytes}
                                    totalBytes={directorySpace?.totalSize}
                                    torrentSize={torrentSize}
                                    path={
                                        directorySpace?.path ??
                                        (downloadDir.trim() || undefined)
                                    }
                                    isLoading={isSpaceLoading}
                                    error={spaceError}
                                    hint={spaceHint}
                                    onRetry={refreshDiskSpace}
                                    isInsufficient={isSpaceInsufficient}
                                />
                            )}
                            <div className="flex w-full items-center justify-between gap-tools">
                                <Button
                                    variant="flat"
                                    onPress={handleClose}
                                    className="text-foreground/50 hover:text-foreground flex-1"
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    color="primary"
                                    variant="bordered"
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
                            {hasSubmitError && (
                                <div className="space-y-tight">
                                    <p className="text-xs text-danger">
                                        {t("modals.add_error_default")}
                                    </p>
                                    {submitError && (
                                        <p className="text-foreground/60 text-xs break-words">
                                            {submitError}
                                        </p>
                                    )}
                                </div>
                            )}
                            {isSpaceInsufficient && (
                                <p className="text-scaled text-warning">
                                    {t("modals.disk_gauge.insufficient")}
                                </p>
                            )}
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

type DiskSpaceProbeParams = {
    isOpen: boolean;
    downloadDir: string;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    supportsCheckFreeSpace: boolean;
    t: TFunction;
};

type DiskSpaceProbeResult = {
    directorySpace: TransmissionFreeSpace | null;
    isSpaceLoading: boolean;
    spaceError: string | null;
    spaceHint: string | null;
    refreshDiskSpace: () => void;
    reportSpaceError: (message: string) => void;
};

function useDiskSpaceProbe({
    isOpen,
    downloadDir,
    checkFreeSpace,
    supportsCheckFreeSpace,
    t,
}: DiskSpaceProbeParams): DiskSpaceProbeResult {
    const [directorySpace, setDirectorySpace] =
        useState<TransmissionFreeSpace | null>(null);
    const [isSpaceLoading, setIsSpaceLoading] = useState(false);
    const [spaceError, setSpaceError] = useState<string | null>(null);
    const [spaceHint, setSpaceHint] = useState<string | null>(null);
    const requestTokenRef = useRef<symbol | null>(null);

    const resetSpaceState = useCallback(() => {
        requestTokenRef.current = null;
        setDirectorySpace(null);
        setSpaceError(null);
        setSpaceHint(null);
        setIsSpaceLoading(false);
    }, []);

    const reportSpaceError = useCallback((message: string) => {
        requestTokenRef.current = null;
        setDirectorySpace(null);
        setSpaceHint(null);
        setIsSpaceLoading(false);
        setSpaceError(message);
    }, []);

    const refreshDiskSpace = useCallback(() => {
        if (!isOpen) {
            resetSpaceState();
            return;
        }
        if (!supportsCheckFreeSpace || !checkFreeSpace) {
            resetSpaceState();
            return;
        }
        const trimmedDownloadDir = downloadDir.trim();
        if (!trimmedDownloadDir) {
            requestTokenRef.current = null;
            setDirectorySpace(null);
            setSpaceError(null);
            setIsSpaceLoading(false);
            setSpaceHint(t("modals.disk_gauge.choose_path"));
            return;
        }
        const token = Symbol("disk-space-request");
        requestTokenRef.current = token;
        setIsSpaceLoading(true);
        setSpaceError(null);
        setSpaceHint(null);
        checkFreeSpace(trimmedDownloadDir)
            .then((space) => {
                if (requestTokenRef.current !== token) return;
                setDirectorySpace(space);
            })
            .catch((error) => {
                if (requestTokenRef.current !== token) return;
                setDirectorySpace(null);
                setSpaceError(resolveDiskSpaceErrorMessage(error, t));
            })
            .finally(() => {
                if (requestTokenRef.current !== token) return;
                setIsSpaceLoading(false);
            });
    }, [
        checkFreeSpace,
        downloadDir,
        isOpen,
        resetSpaceState,
        supportsCheckFreeSpace,
        t,
    ]);

    useEffect(() => {
        refreshDiskSpace();
    }, [refreshDiskSpace]);

    return {
        directorySpace,
        isSpaceLoading,
        spaceError,
        spaceHint,
        refreshDiskSpace,
        reportSpaceError,
    };
}

function extractErrorMessage(error: unknown): string | null {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error.length) {
        return error;
    }
    if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string" &&
        (error as { message: string }).message
    ) {
        return (error as { message: string }).message;
    }
    return null;
}

function isFileAccessError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const name = (error as { name?: unknown }).name;
    return name === "NotAllowedError" || name === "SecurityError";
}

function resolveSubmitErrorMessage(error: unknown): string | null {
    return extractErrorMessage(error);
}

function resolveDiskSpaceErrorMessage(
    error: unknown,
    t: TFunction
): string {
    const message = extractErrorMessage(error);
    if (message) {
        return t("modals.disk_gauge.error_detail", { message });
    }
    return t("modals.disk_gauge_error");
}

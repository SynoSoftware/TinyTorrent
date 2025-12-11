import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Skeleton,
    cn,
} from "@heroui/react";
import { ArrowLeft, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format";
import {
    browseDirectories,
    type DirectoryBrowseResult,
    type DirectoryNode,
} from "../../../services/rpc/rpc-extended";
import { ICON_STROKE_WIDTH } from "../../../config/logic";
import { INTERACTION_CONFIG } from "../../../config/logic";
import { GLASS_MODAL_SURFACE } from "../layout/glass-surface";

interface DirectoryPickerProps {
    isOpen: boolean;
    initialPath?: string;
    onClose: () => void;
    onSelect: (path: string) => void;
}

export function DirectoryPicker({
    isOpen,
    initialPath = "",
    onClose,
    onSelect,
}: DirectoryPickerProps) {
    const { t } = useTranslation();
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [browseResult, setBrowseResult] = useState<DirectoryBrowseResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setCurrentPath(initialPath);
        }
    }, [initialPath, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        setError(null);
        browseDirectories(currentPath)
            .then(setBrowseResult)
            .catch(() => setError(t("directory_browser.error")))
            .finally(() => setIsLoading(false));
    }, [currentPath, isOpen, t]);

    const goUp = () => {
        if (!browseResult) return;
        if (!browseResult.parentPath) {
            setCurrentPath("");
            return;
        }
        setCurrentPath(browseResult.parentPath);
    };

    const resolvedPath = browseResult?.path ?? currentPath;

    const isRoot = !browseResult || !resolvedPath;

    const entries = browseResult?.entries ?? [];

    const renderEntry = (entry: DirectoryNode) => {
        const subtitle = entry.freeBytes
            ? `${formatBytes(entry.freeBytes)} free`
            : entry.type === "drive"
            ? t("directory_browser.drive_label")
            : undefined;
        return (
            <button
                key={entry.path}
                type="button"
                onClick={() => setCurrentPath(entry.path)}
                className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border border-content1/20 bg-content1/10 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-content1/20",
                    "focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/40"
                )}
            >
                <div className="flex items-center gap-3">
                    <Folder
                        size={20}
                        strokeWidth={ICON_STROKE_WIDTH}
                        className="text-foreground/60"
                    />
                    <div className="flex flex-col text-sm">
                        <span className="font-semibold text-foreground truncate">
                            {entry.name}
                        </span>
                        {subtitle && (
                            <span className="text-xs uppercase tracking-[0.3em] text-foreground/50">
                                {subtitle}
                            </span>
                        )}
                    </div>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-foreground/40">
                    {t("directory_browser.open")}
                </span>
            </button>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
            placement="center"
            size="xl"
            backdrop="blur"
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, "max-w-[640px] w-full"),
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1 pb-0">
                    <h3 className="text-lg font-bold text-foreground">
                        {t("directory_browser.title")}
                    </h3>
                    <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                        {resolvedPath || t("directory_browser.root_label")}
                    </p>
                </ModalHeader>
                <ModalBody className="space-y-4 pt-3 pb-0">
                    <div className="flex items-center justify-between">
                        <Button
                            size="sm"
                            variant="light"
                            onPress={goUp}
                            disabled={!browseResult?.parentPath}
                            className="flex items-center gap-2"
                        >
                            <ArrowLeft
                                size={14}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                            {t("directory_browser.up")}
                        </Button>
                        <span className="text-[11px] uppercase tracking-[0.35em] text-foreground/40">
                            {isRoot
                                ? t("directory_browser.root_label")
                                : resolvedPath}
                        </span>
                    </div>
                    <div className="relative h-64 overflow-y-auto rounded-2xl border border-content1/20 bg-content1/10 p-2">
                        {isLoading && (
                            <div className="space-y-2">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton
                                        key={index}
                                        className="h-12 w-full rounded-2xl bg-content1/20"
                                    />
                                ))}
                            </div>
                        )}
                        {!isLoading && error && (
                            <p className="text-sm text-warning">
                                {error}
                            </p>
                        )}
                        {!isLoading &&
                            !entries.length &&
                            !error && (
                                <p className="text-sm text-foreground/60">
                                    {t("directory_browser.empty")}
                                </p>
                            )}
                        {!isLoading &&
                            entries.length > 0 &&
                            entries.map(renderEntry)}
                    </div>
                </ModalBody>
                <ModalFooter className="flex flex-col gap-3 pt-0">
                    <div className="flex w-full gap-3">
                        <Button
                            variant="light"
                            size="sm"
                            onPress={onClose}
                            className="flex-1 text-foreground/50"
                        >
                            {t("modals.cancel")}
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            variant="shadow"
                            className="flex-1"
                            onPress={() =>
                                onSelect(
                                    browseResult?.path ??
                                        currentPath ??
                                        ""
                                )
                            }
                            isDisabled={isLoading}
                        >
                            {t("directory_browser.select")}
                        </Button>
                    </div>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

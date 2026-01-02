import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    cn,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { INTERACTION_CONFIG } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { TorrentMetadata } from "@/shared/utils/torrent";
import type { TransmissionFreeSpace } from "@/services/rpc/types";

export type AddTorrentPriority = "low" | "normal" | "high";

export type AddTorrentSelection = {
    downloadDir: string;
    startNow: boolean;
    filesUnwanted: number[];
    priorityHigh: number[];
    priorityNormal: number[];
    priorityLow: number[];
};

export interface AddTorrentWindowProps {
    isOpen: boolean;
    metadata: TorrentMetadata;
    initialDownloadDir: string;
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: (selection: AddTorrentSelection) => void;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
}

type FileRow = {
    index: number;
    path: string;
    length: number;
};

const SECTION_CARD =
    "glass-panel surface-layer-1 rounded-panel p-panel flex flex-col gap-tight";
const SECTION_HEADING = "flex items-center justify-between gap-tools";
const SECTION_LABEL =
    "flex items-center gap-tools text-label font-semibold tracking-label uppercase";

export function AddTorrentWindow({
    isOpen,
    metadata,
    initialDownloadDir,
    isSubmitting,
    onCancel,
    onConfirm,
    checkFreeSpace,
}: AddTorrentWindowProps) {
    const { t } = useTranslation();

    const [downloadDir, setDownloadDir] = useState(initialDownloadDir);
    const [startNow, setStartNow] = useState(true);
    const [filter, setFilter] = useState("");
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [priorities, setPriorities] = useState<Map<number, AddTorrentPriority>>(
        () => new Map()
    );
    const [freeSpaceBytes, setFreeSpaceBytes] = useState<number | null>(null);
    const [isFreeSpaceLoading, setIsFreeSpaceLoading] = useState(false);
    const [freeSpaceError, setFreeSpaceError] = useState<string | null>(null);

    const files: FileRow[] = useMemo(
        () =>
            metadata.files.map((file, index) => ({
                index,
                path: file.path,
                length: file.length,
            })),
        [metadata.files]
    );

    useEffect(() => {
        if (!isOpen) return;
        setDownloadDir(initialDownloadDir);
        setStartNow(true);
        setFilter("");
        setSelected(new Set(files.map((f) => f.index)));
        setPriorities(new Map());
        setFreeSpaceBytes(null);
        setIsFreeSpaceLoading(false);
        setFreeSpaceError(null);
    }, [files, initialDownloadDir, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (!checkFreeSpace) {
            setFreeSpaceBytes(null);
            setIsFreeSpaceLoading(false);
            setFreeSpaceError(null);
            return;
        }
        const path = downloadDir.trim();
        if (!path) {
            setFreeSpaceBytes(null);
            setIsFreeSpaceLoading(false);
            setFreeSpaceError(null);
            return;
        }

        let active = true;
        setIsFreeSpaceLoading(true);
        setFreeSpaceError(null);
        checkFreeSpace(path)
            .then((space) => {
                if (!active) return;
                setFreeSpaceBytes(space.sizeBytes);
            })
            .catch(() => {
                if (!active) return;
                setFreeSpaceBytes(null);
                setFreeSpaceError(t("modals.add_torrent.free_space_unknown"));
            })
            .finally(() => {
                if (!active) return;
                setIsFreeSpaceLoading(false);
            });
        return () => {
            active = false;
        };
    }, [checkFreeSpace, downloadDir, isOpen, t]);

    const filteredFiles = useMemo(() => {
        const query = filter.trim().toLowerCase();
        if (!query) return files;
        return files.filter((file) => file.path.toLowerCase().includes(query));
    }, [files, filter]);

    const selectedSizeBytes = useMemo(() => {
        let total = 0;
        for (const file of files) {
            if (selected.has(file.index)) {
                total += file.length;
            }
        }
        return total;
    }, [files, selected]);

    const isFreeSpaceKnown = typeof freeSpaceBytes === "number";
    const isInsufficient =
        isFreeSpaceKnown && selectedSizeBytes > (freeSpaceBytes ?? 0);

    const handleToggleFile = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        setSelected(new Set(files.map((file) => file.index)));
    }, [files]);

    const handleSelectNone = useCallback(() => {
        setSelected(new Set());
    }, []);

    const setPriority = useCallback((index: number, priority: AddTorrentPriority) => {
        setPriorities((prev) => {
            const next = new Map(prev);
            if (priority === "normal") {
                next.delete(index);
            } else {
                next.set(index, priority);
            }
            return next;
        });
    }, []);

    const canConfirm = selected.size > 0 && !isSubmitting;
    const commitLabel = startNow
        ? t("modals.add_torrent.add_and_start")
        : t("modals.add_torrent.add_paused");

    const handleConfirm = useCallback(() => {
        if (!canConfirm) return;
        const filesUnwanted: number[] = [];
        const priorityHigh: number[] = [];
        const priorityLow: number[] = [];
        const priorityNormal: number[] = [];

        for (const file of files) {
            if (!selected.has(file.index)) {
                filesUnwanted.push(file.index);
            }
        }

        for (const file of files) {
            const priority = priorities.get(file.index) ?? "normal";
            if (priority === "high") priorityHigh.push(file.index);
            else if (priority === "low") priorityLow.push(file.index);
            else priorityNormal.push(file.index);
        }

        onConfirm({
            downloadDir: downloadDir.trim(),
            startNow,
            filesUnwanted,
            priorityHigh,
            priorityNormal,
            priorityLow,
        });
    }, [canConfirm, downloadDir, files, onConfirm, priorities, selected, startNow]);

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? onCancel() : null)}
            backdrop="blur"
            motionProps={INTERACTION_CONFIG.modalBloom}
            isDismissable={!isSubmitting}
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    "max-w-modal-add w-full overflow-hidden flex flex-col"
                ),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="px-stage py-panel border-b border-default flex flex-col gap-tight">
                            <div className="flex items-center justify-between gap-stage">
                                <div className="min-w-0 flex flex-col gap-tight">
                                    <span className="text-label font-semibold tracking-label uppercase">
                                        {t("modals.add_torrent.title")}
                                    </span>
                                    <span className="text-scaled text-foreground/60 truncate">
                                        {metadata.name}
                                    </span>
                                </div>
                                <span className="font-mono text-scaled text-foreground/60 select-text">
                                    {t("modals.add_torrent.file_count", {
                                        count: metadata.files.length,
                                    })}
                                </span>
                            </div>
                        </ModalHeader>
                        <ModalBody className="px-stage py-panel flex-1 min-h-0">
                            <div className="flex gap-stage min-h-0">
                                <div className="flex flex-col gap-stage min-w-0 w-full">
                                    <div className={SECTION_CARD}>
                                        <div className={SECTION_HEADING}>
                                            <div className={SECTION_LABEL}>
                                                {t("modals.add_torrent.destination")}
                                            </div>
                                        </div>
                                        <Input
                                            labelPlacement="outside"
                                            value={downloadDir}
                                            onChange={(event) =>
                                                setDownloadDir(event.target.value)
                                            }
                                            placeholder={t(
                                                "modals.add_torrent.save_path_placeholder"
                                            )}
                                            variant="bordered"
                                            size="md"
                                            isDisabled={isSubmitting}
                                        />
                                        <div className="flex items-center justify-between gap-tools">
                                            <div className="flex flex-col gap-tight">
                                                <span className="text-scaled text-foreground/60">
                                                    {t(
                                                        "modals.add_torrent.free_space_label"
                                                    )}
                                                </span>
                                                <span className="font-mono text-scaled select-text">
                                                    {isFreeSpaceLoading
                                                        ? t(
                                                              "modals.add_torrent.free_space_loading"
                                                          )
                                                        : freeSpaceError
                                                          ? t(
                                                                "modals.add_torrent.free_space_unknown"
                                                            )
                                                          : isFreeSpaceKnown
                                                            ? formatBytes(
                                                                  freeSpaceBytes ??
                                                                      0
                                                              )
                                                            : t(
                                                                  "modals.add_torrent.free_space_unknown"
                                                              )}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-tight">
                                                <span className="text-scaled text-foreground/60">
                                                    {t(
                                                        "modals.add_torrent.selected_size_label"
                                                    )}
                                                </span>
                                                <span className="font-mono text-scaled select-text">
                                                    {formatBytes(
                                                        Math.max(selectedSizeBytes, 0)
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        {isInsufficient && (
                                            <p className="text-scaled text-warning">
                                                {t(
                                                    "modals.add_torrent.disk_space_insufficient"
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    <div className={SECTION_CARD}>
                                        <div className={SECTION_HEADING}>
                                            <div className={SECTION_LABEL}>
                                                {t(
                                                    "modals.add_torrent.start_behavior"
                                                )}
                                            </div>
                                        </div>
                                        <Select
                                            selectedKeys={[startNow ? "start" : "paused"]}
                                            onSelectionChange={(keys) => {
                                                const [value] = Array.from(keys);
                                                setStartNow(value === "start");
                                            }}
                                            variant="bordered"
                                            size="md"
                                            isDisabled={isSubmitting}
                                        >
                                            <SelectItem key="start">
                                                {t("modals.add_torrent.add_and_start")}
                                            </SelectItem>
                                            <SelectItem key="paused">
                                                {t("modals.add_torrent.add_paused")}
                                            </SelectItem>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-stage min-w-0 w-full">
                                    <div className={SECTION_CARD}>
                                        <div className={SECTION_HEADING}>
                                            <div className={SECTION_LABEL}>
                                                {t("modals.add_torrent.files_title")}
                                            </div>
                                            <div className="flex items-center gap-tools">
                                                <Button
                                                    size="md"
                                                    variant="light"
                                                    onPress={handleSelectAll}
                                                    isDisabled={isSubmitting}
                                                >
                                                    {t(
                                                        "modals.add_torrent.select_all"
                                                    )}
                                                </Button>
                                                <Button
                                                    size="md"
                                                    variant="light"
                                                    onPress={handleSelectNone}
                                                    isDisabled={isSubmitting}
                                                >
                                                    {t(
                                                        "modals.add_torrent.select_none"
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <Input
                                            value={filter}
                                            onChange={(event) =>
                                                setFilter(event.target.value)
                                            }
                                            placeholder={t(
                                                "modals.add_torrent.filter_placeholder"
                                            )}
                                            variant="bordered"
                                            size="md"
                                            isDisabled={isSubmitting}
                                        />
                                        <div className="rounded-panel border border-default overflow-hidden min-h-0 flex-1">
                                            <div className="h-lg overflow-auto overlay-scrollbar">
                                                <table className="w-full table-fixed">
                                                    <thead className="sticky top-0 bg-content1/60 backdrop-blur">
                                                        <tr className="text-left text-label font-semibold tracking-label uppercase">
                                                            <th className="p-tight">
                                                                {t(
                                                                    "modals.add_torrent.col_select"
                                                                )}
                                                            </th>
                                                            <th className="p-tight">
                                                                {t(
                                                                    "modals.add_torrent.col_name"
                                                                )}
                                                            </th>
                                                            <th className="p-tight">
                                                                {t(
                                                                    "modals.add_torrent.col_size"
                                                                )}
                                                            </th>
                                                            <th className="p-tight">
                                                                {t(
                                                                    "modals.add_torrent.col_priority"
                                                                )}
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredFiles.map((file) => {
                                                            const isChecked =
                                                                selected.has(
                                                                    file.index
                                                                );
                                                            const prio =
                                                                priorities.get(
                                                                    file.index
                                                                ) ?? "normal";
                                                            return (
                                                                <tr
                                                                    key={file.index}
                                                                    className={cn(
                                                                        "border-t border-default/20",
                                                                        !isChecked &&
                                                                            "opacity-50"
                                                                    )}
                                                                >
                                                                    <td className="p-tight">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() =>
                                                                                handleToggleFile(
                                                                                    file.index
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                isSubmitting
                                                                            }
                                                                        />
                                                                    </td>
                                                                    <td className="p-tight">
                                                                        <span className="text-scaled select-text break-words">
                                                                            {file.path}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-tight">
                                                                        <span className="font-mono text-scaled select-text whitespace-nowrap">
                                                                            {formatBytes(
                                                                                file.length
                                                                            )}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-tight">
                                                                        <select
                                                                            value={prio}
                                                                            onChange={(event) =>
                                                                                setPriority(
                                                                                    file.index,
                                                                                    event
                                                                                        .target
                                                                                        .value as AddTorrentPriority
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                isSubmitting ||
                                                                                !isChecked
                                                                            }
                                                                            className="w-full rounded-panel border border-default bg-content1/20 px-tight py-tight text-scaled"
                                                                        >
                                                                            <option value="high">
                                                                                {t(
                                                                                    "torrent_modal.context_menu.files.priority_high"
                                                                                )}
                                                                            </option>
                                                                            <option value="normal">
                                                                                {t(
                                                                                    "torrent_modal.context_menu.files.priority_normal"
                                                                                )}
                                                                            </option>
                                                                            <option value="low">
                                                                                {t(
                                                                                    "torrent_modal.context_menu.files.priority_low"
                                                                                )}
                                                                            </option>
                                                                        </select>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter className="px-stage py-panel border-t border-default flex items-center justify-between gap-tools">
                            <Button
                                variant="light"
                                onPress={onCancel}
                                isDisabled={isSubmitting}
                            >
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleConfirm}
                                isLoading={isSubmitting}
                                isDisabled={!canConfirm}
                            >
                                {commitLabel}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

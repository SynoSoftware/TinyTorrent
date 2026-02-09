import type { MissingFilesProbeResult } from "@/services/recovery/recovery-controller";
import { formatBytes } from "@/shared/utils/format";
import type { TFunction } from "i18next";

export function formatMissingFileDetails(
    t: TFunction,
    probe?: MissingFilesProbeResult
): string[] {
    if (!probe) {
        return [t("recovery.status.waiting_status")];
    }

    if (probe.kind === "unknown") {
        return [
            t("torrent_modal.errors.no_data_found_title"),
            t("torrent_modal.errors.files.expected", {
                value: formatBytes(probe.expectedBytes),
            }),
            t("recovery.inline_fallback"),
        ];
    }

    if (probe.kind === "path_missing") {
        return [
            t("torrent_modal.errors.files.folder_missing", {
                path: probe.path,
            }),
            t("torrent_modal.errors.files.expected", {
                value: formatBytes(probe.expectedBytes),
            }),
            ...(probe.onDiskBytes !== null
                ? [
                      t("torrent_modal.errors.files.on_disk", {
                          value: formatBytes(probe.onDiskBytes),
                      }),
                  ]
                : []),
            ...(probe.toDownloadBytes !== null
                ? [
                      t("torrent_modal.errors.files.to_download", {
                          value: formatBytes(probe.toDownloadBytes),
                      }),
                  ]
                : []),
        ];
    }

    const baseLines = [
        t("torrent_modal.errors.no_data_found_title"),
        t("torrent_modal.errors.files.expected", {
            value: formatBytes(probe.expectedBytes),
        }),
    ];

    const onDiskLine =
        probe.onDiskBytes !== null
            ? t("torrent_modal.errors.files.on_disk", {
                  value: formatBytes(probe.onDiskBytes),
              })
            : null;

    const toDownloadLine =
        probe.toDownloadBytes !== null
            ? t("torrent_modal.errors.files.to_download", {
                  value: formatBytes(probe.toDownloadBytes),
              })
            : null;

    return [
        ...baseLines,
        ...(onDiskLine ? [onDiskLine] : []),
        ...(toDownloadLine ? [toDownloadLine] : []),
    ];
}

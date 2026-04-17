import {
    Button,
    Modal,
    cn,
} from "@heroui/react";
import { Maximize2, Minimize2, X, type LucideIcon } from "lucide-react";
import type {
    ComponentProps,
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
} from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { details, form, modal } from "@/shared/ui/layout/glass-surface";
import {
    ICON_SIZE_CLASSES,
    ToolbarIconButton,
} from "@/shared/ui/layout/toolbar-button";

const modalExLayout = {
    headerLead: "flex min-w-0 flex-1 items-center gap-panel",
    headerTitle: "flex min-w-0 flex-col overflow-hidden",
    headerActions: "flex shrink-0 items-center gap-tools",
    titleIcon: "text-accent",
} as const;

type HeroModalSize = NonNullable<ComponentProps<typeof Modal.Container>["size"]>;
type ModalExSize = "full" extends HeroModalSize
    ? HeroModalSize
    : HeroModalSize | "full";
type ModalExBodyVariant = "padded" | "flush";

export type ModalAction = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
};

interface ModalExProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    icon?: LucideIcon;
    footerStartContent?: ReactNode;
    primaryAction?: ModalAction;
    secondaryAction?: ModalAction;
    dangerAction?: ModalAction;
    size?: ModalExSize;
    maximize?: boolean;
    disableClose?: boolean;
    allowOverlayDismiss?: boolean;
    bodyVariant?: ModalExBodyVariant;
    onKeyDownCapture?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    children: ReactNode;
}

export function ModalEx({
    open,
    onClose,
    title,
    icon: TitleIcon,
    footerStartContent,
    primaryAction,
    secondaryAction,
    dangerAction,
    size,
    maximize = false,
    disableClose = false,
    allowOverlayDismiss = false,
    bodyVariant = "padded",
    onKeyDownCapture,
    children,
}: ModalExProps) {
    const { t } = useTranslation();
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!open && isMaximized) {
            const timeoutId = window.setTimeout(() => {
                setIsMaximized(false);
            }, 0);
            return () => {
                window.clearTimeout(timeoutId);
            };
        }
        return undefined;
    }, [isMaximized, open]);

    const resolvedSize: ModalExSize = isMaximized ? "full" : (size ?? "lg");
    const hasFooter = Boolean(
        footerStartContent || secondaryAction || primaryAction || dangerAction,
    );
    const showFooterStartSlot = Boolean(footerStartContent || secondaryAction);
    const closeAriaLabel = t("torrent_modal.actions.close");
    const bodyClassName =
        bodyVariant === "flush"
            ? modal.layout.bodyFlush
            : modal.layout.body;
    const resetAndClose = () => {
        setIsMaximized(false);
        onClose();
    };

    const handleContentKeyDownCapture = (
        event: ReactKeyboardEvent<HTMLDivElement>,
    ) => {
        if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            !disableClose
        ) {
            event.preventDefault();
            event.stopPropagation();
            resetAndClose();
            return;
        }

        onKeyDownCapture?.(event);
    };

    const headerControls = (
        <div className={modalExLayout.headerActions}>
            {maximize ? (
                <ToolbarIconButton
                    Icon={isMaximized ? Minimize2 : Maximize2}
                    ariaLabel={
                        isMaximized
                            ? t("toolbar.minimize")
                            : t("toolbar.maximize")
                    }
                    onPress={() =>
                        setIsMaximized((current) => !current)
                    }
                />
            ) : null}
            <ToolbarIconButton
                Icon={X}
                ariaLabel={closeAriaLabel}
                onPress={resetAndClose}
                isDisabled={disableClose}
            />
        </div>
    );

    return (
        <Modal
            isOpen={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen && allowOverlayDismiss && !disableClose) {
                    resetAndClose();
                }
            }}
        >
            <Modal.Backdrop
                isDismissable={allowOverlayDismiss && !disableClose}
                variant="opaque"
            >
                <Modal.Container
                    className={modal.placement.center}
                    placement="center"
                    scroll="outside"
                    size={resolvedSize}
                >
                    <Modal.Dialog className={modal.surface.base}>
                        <div
                            className={modal.layout.frame}
                            onKeyDownCapture={handleContentKeyDownCapture}
                        >
                            <Modal.Header className={modal.chrome.header}>
                                <div className={modalExLayout.headerLead}>
                                    {TitleIcon ? (
                                        <TitleIcon
                                            className={cn(
                                                ICON_SIZE_CLASSES.lg,
                                                modalExLayout.titleIcon,
                                            )}
                                        />
                                    ) : null}
                                    <div className={modalExLayout.headerTitle}>{title}</div>
                                </div>
                                {headerControls}
                            </Modal.Header>
                            <Modal.Body className={bodyClassName}>{children}</Modal.Body>
                            {hasFooter ? (
                                <Modal.Footer className={modal.chrome.footer}>
                                    {showFooterStartSlot ? (
                                        <div className={details.generalMetricContent}>
                                            {footerStartContent ?? (
                                                <span aria-hidden="true">&nbsp;</span>
                                            )}
                                        </div>
                                    ) : null}
                                    <div className={form.inputActionRow}>
                                        {secondaryAction ? (
                                            <Button
                                                variant="tertiary"
                                                onPress={secondaryAction.onPress}
                                                isDisabled={secondaryAction.disabled}
                                                isPending={secondaryAction.loading}
                                            >
                                                {secondaryAction.label}
                                            </Button>
                                        ) : null}
                                        {dangerAction ? (
                                            <Button
                                                variant="danger"
                                                onPress={dangerAction.onPress}
                                                isDisabled={dangerAction.disabled}
                                                isPending={dangerAction.loading}
                                            >
                                                {dangerAction.label}
                                            </Button>
                                        ) : null}
                                        {primaryAction ? (
                                            <Button
                                                variant="primary"
                                                onPress={primaryAction.onPress}
                                                isDisabled={primaryAction.disabled}
                                                isPending={primaryAction.loading}
                                            >
                                                {primaryAction.label}
                                            </Button>
                                        ) : null}
                                    </div>
                                </Modal.Footer>
                            ) : null}
                        </div>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}

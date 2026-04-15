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
import { details, modal } from "@/shared/ui/layout/glass-surface";
import {
    ICON_SIZE_CLASSES,
    ToolbarIconButton,
} from "@/shared/ui/layout/toolbar-button";

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
    const footerClassName =
        footerStartContent || secondaryAction
            ? modal.dialogFooter
            : modal.footerEnd;
    const showFooterStartSlot = footerClassName === modal.dialogFooter;
    const modalClassName =
        resolvedSize === "sm" ? modal.compactClass : modal.baseClass;
    const closeAriaLabel = t("torrent_modal.actions.close");
    const bodyClassName =
        bodyVariant === "flush" ? modal.dialogBodyFlush : modal.dialogBody;
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
        <div className={modal.dialogFooterGroup}>
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
                variant="blur"
            >
                <Modal.Container placement="center" size={resolvedSize}>
                    <Modal.Dialog className={modalClassName}>
                        <div
                            className={modal.contentWrapper}
                            onKeyDownCapture={handleContentKeyDownCapture}
                        >
                            <Modal.Header className={modal.dialogHeader}>
                                <div className={modal.dialogHeaderLead}>
                                    {TitleIcon ? (
                                        <TitleIcon
                                            className={cn(
                                                ICON_SIZE_CLASSES.lg,
                                                modal.headerLeadPrimaryIcon,
                                            )}
                                        />
                                    ) : null}
                                    <div className={modal.headerTitleWrap}>{title}</div>
                                </div>
                                {headerControls}
                            </Modal.Header>
                            <Modal.Body className={bodyClassName}>{children}</Modal.Body>
                            {hasFooter ? (
                                <Modal.Footer className={footerClassName}>
                                    {showFooterStartSlot ? (
                                        <div className={details.generalMetricContent}>
                                            {footerStartContent ?? (
                                                <span aria-hidden="true">&nbsp;</span>
                                            )}
                                        </div>
                                    ) : null}
                                    <div className={modal.footerButtonRow}>
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

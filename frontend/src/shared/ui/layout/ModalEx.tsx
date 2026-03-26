import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    cn,
    type ModalProps,
} from "@heroui/react";
import { Maximize2, Minimize2, X, type LucideIcon } from "lucide-react";
import type {
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
} from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DETAILS, MODAL } from "@/shared/ui/layout/glass-surface";
import {
    ICON_SIZE_CLASSES,
    ToolbarIconButton,
} from "@/shared/ui/layout/toolbar-button";

type HeroModalSize = NonNullable<ModalProps["size"]>;
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
            ? MODAL.dialogFooter
            : MODAL.footerEnd;
    const showFooterStartSlot = footerClassName === MODAL.dialogFooter;
    const modalClassNames =
        resolvedSize === "sm" ? MODAL.compactClassNames : MODAL.baseClassNames;
    const closeAriaLabel = t("torrent_modal.actions.close");
    const bodyClassName =
        bodyVariant === "flush" ? MODAL.dialogBodyFlush : MODAL.dialogBody;
    const resetAndClose = () => {
        setIsMaximized(false);
        onClose();
    };

    const handleOpenChange: ModalProps["onOpenChange"] = (nextOpen) => {
        if (!nextOpen && !disableClose && allowOverlayDismiss) {
            resetAndClose();
        }
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
        <div className={MODAL.dialogFooterGroup}>
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
            onOpenChange={handleOpenChange}
            hideCloseButton
            backdrop="blur"
            classNames={modalClassNames}
            placement="center"
            size={resolvedSize}
            motionProps={{
                variants: {
                    enter: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                    },
                    exit: {
                        opacity: 0,
                        y: 8,
                        scale: 0.985,
                    },
                },
                transition: {
                    duration: 0.18,
                    ease: "easeOut",
                },
            }}
            isDismissable={allowOverlayDismiss && !disableClose}
            isKeyboardDismissDisabled={disableClose}
        >
            <ModalContent onKeyDownCapture={handleContentKeyDownCapture}>
                <ModalHeader className={MODAL.dialogHeader}>
                    <div className={MODAL.dialogHeaderLead}>
                        {TitleIcon ? (
                            <TitleIcon
                                className={cn(
                                    ICON_SIZE_CLASSES.lg,
                                    MODAL.headerLeadPrimaryIcon,
                                )}
                            />
                        ) : null}
                        <div className={MODAL.headerTitleWrap}>{title}</div>
                    </div>
                    {headerControls}
                </ModalHeader>
                <ModalBody className={bodyClassName}>{children}</ModalBody>
                {hasFooter ? (
                    <ModalFooter className={footerClassName}>
                        {showFooterStartSlot ? (
                            <div className={DETAILS.generalMetricContent}>
                                {footerStartContent ?? (
                                    <span aria-hidden="true">&nbsp;</span>
                                )}
                            </div>
                        ) : null}
                        <div className={MODAL.footerButtonRow}>
                            {secondaryAction ? (
                                <Button
                                    variant="light"
                                    onPress={secondaryAction.onPress}
                                    isDisabled={secondaryAction.disabled}
                                    isLoading={secondaryAction.loading}
                                >
                                    {secondaryAction.label}
                                </Button>
                            ) : null}
                            {dangerAction ? (
                                <Button
                                    color="danger"
                                    variant="shadow"
                                    onPress={dangerAction.onPress}
                                    isDisabled={dangerAction.disabled}
                                    isLoading={dangerAction.loading}
                                >
                                    {dangerAction.label}
                                </Button>
                            ) : null}
                            {primaryAction ? (
                                <Button
                                    color="primary"
                                    variant="shadow"
                                    onPress={primaryAction.onPress}
                                    isDisabled={primaryAction.disabled}
                                    isLoading={primaryAction.loading}
                                >
                                    {primaryAction.label}
                                </Button>
                            ) : null}
                        </div>
                    </ModalFooter>
                ) : null}
            </ModalContent>
        </Modal>
    );
}

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
    ReactNode,
} from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MODAL } from "@/shared/ui/layout/glass-surface";
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
    primaryAction?: ModalAction;
    secondaryAction?: ModalAction;
    dangerAction?: ModalAction;
    size?: ModalExSize;
    maximize?: boolean;
    disableClose?: boolean;
    bodyVariant?: ModalExBodyVariant;
    children: ReactNode;
}

export function ModalEx({
    open,
    onClose,
    title,
    icon: TitleIcon,
    primaryAction,
    secondaryAction,
    dangerAction,
    size,
    maximize = false,
    disableClose = false,
    bodyVariant = "padded",
    children,
}: ModalExProps) {
    const { t } = useTranslation();
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!open) {
            setIsMaximized(false);
        }
    }, [open]);

    const resolvedSize: ModalExSize = isMaximized ? "full" : (size ?? "lg");
    const hasFooter = Boolean(secondaryAction || primaryAction || dangerAction);
    const footerClassName = secondaryAction ? MODAL.dialogFooter : MODAL.footerEnd;
    const modalClassNames =
        resolvedSize === "sm" ? MODAL.compactClassNames : MODAL.baseClassNames;
    const closeAriaLabel = t("torrent_modal.actions.close");
    const bodyClassName =
        bodyVariant === "flush" ? MODAL.dialogBodyFlush : MODAL.dialogBody;

    const handleOpenChange: ModalProps["onOpenChange"] = (nextOpen) => {
        if (!nextOpen && !disableClose) {
            onClose();
        }
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
                    onPress={() => setIsMaximized((value) => !value)}
                />
            ) : null}
            <ToolbarIconButton
                Icon={X}
                ariaLabel={closeAriaLabel}
                onPress={onClose}
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
            isDismissable={!disableClose}
        >
            <ModalContent>
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
                        <div className={MODAL.dialogFooterGroup}>
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

import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input } from "@heroui/react";
import { FileUp, HardDrive, Zap, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AddTorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddTorrentModal({ isOpen, onClose }: AddTorrentModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onClose}
      placement="center"
      backdrop="blur"
      size="2xl"
      classNames={{
        base: "bg-content1/80 backdrop-blur-xl border border-content1/20 shadow-2xl",
        header: "border-b border-content1/30 py-4",
        footer: "border-t border-content1/30 py-4",
        closeButton: "hover:bg-content1/10 active:bg-content1/20",
      }}
      motionProps={{
        variants: {
          enter: { y: 0, opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } },
          exit: { y: 10, opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
        },
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileUp size={20} className="text-primary" />
                {t("modals.add_title")}
              </h3>
            </ModalHeader>
            <ModalBody className="py-6 gap-6">
                <Input
                  autoFocus
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

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-content1/20 bg-content1/15 hover:bg-content1/25 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-2 mb-2 text-foreground/60 group-hover:text-primary transition-colors">
                    <HardDrive size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">{t("modals.save_path")}</span>
                  </div>
                  <div className="font-mono text-xs truncate opacity-70">C:/Downloads/Isos</div>
                </div>
                <div className="p-4 rounded-xl border border-content1/20 bg-content1/15 hover:bg-content1/25 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-2 mb-2 text-foreground/60 group-hover:text-success transition-colors">
                    <Zap size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">{t("modals.options")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    <span className="text-xs font-medium">{t("modals.start_now")}</span>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="text-foreground/50 hover:text-foreground">
                {t("modals.cancel")}
              </Button>
              <Button color="primary" variant="shadow" onPress={onClose} startContent={<ArrowDown size={16} />}>
                {t("modals.download")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

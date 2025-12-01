import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch } from "@heroui/react";
import { ArrowDown, FileText, FileUp, HardDrive, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

interface AddTorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (payload: { magnetLink?: string; metainfo?: string; downloadDir: string; startNow: boolean }) => Promise<void>;
  isSubmitting: boolean;
  initialFile?: File | null;
}

const DEFAULT_SAVE_PATH = "C:/Downloads/Torrents";

export function AddTorrentModal({ isOpen, onClose, onAdd, isSubmitting, initialFile }: AddTorrentModalProps) {
  const { t } = useTranslation();
  const [magnetLink, setMagnetLink] = useState("");
  const [downloadDir, setDownloadDir] = useState(DEFAULT_SAVE_PATH);
  const [startNow, setStartNow] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      setMagnetLink("");
      setStartNow(true);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialFile) {
      setSelectedFile(initialFile);
    }
  }, [initialFile, isOpen]);

  const canSubmit = useMemo(() => Boolean(magnetLink.trim() || selectedFile), [magnetLink, selectedFile]);

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    const trimmedLink = magnetLink.trim();
    try {
      const payload: { magnetLink?: string; metainfo?: string; downloadDir: string; startNow: boolean } = {
        downloadDir,
        startNow,
      };
      if (selectedFile) {
        payload.metainfo = await readFileAsBase64(selectedFile);
      } else if (trimmedLink) {
        payload.magnetLink = trimmedLink;
      }
      await onAdd(payload);
      onClose();
    } catch {
      // The caller will handle errors; keep the modal open for corrections.
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
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
        {(handleClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileUp size={20} className="text-primary" />
                {t("modals.add_title")}
              </h3>
            </ModalHeader>
            <ModalBody className="py-6 space-y-6">
              <Input
                autoFocus
                value={magnetLink}
                onChange={(event) => setMagnetLink(event.target.value)}
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
                    <FileText size={14} />
                    {t("modals.file_label")}
                  </div>
                  {selectedFile && (
                    <Button size="sm" variant="ghost" color="danger" onPress={clearSelectedFile}>
                      {t("modals.file_remove")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-mono text-foreground/70 truncate">
                    {selectedFile ? selectedFile.name : t("modals.file_placeholder")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="light" onPress={() => fileInputRef.current?.click()}>
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
                <p className="text-[11px] text-foreground/50">{t("modals.file_help")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 text-foreground/60">
                    <HardDrive size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">{t("modals.save_path")}</span>
                  </div>
                  <Input
                    value={downloadDir}
                    onChange={(event) => setDownloadDir(event.target.value)}
                    variant="flat"
                    size="sm"
                    classNames={{
                      input: "font-mono text-xs",
                      inputWrapper: "bg-content1/10 border-content1/20",
                    }}
                  />
                </div>
                <div className="rounded-xl border border-content1/20 bg-content1/15 px-4 py-3 space-y-2 flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-foreground/60">
                      <Zap size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">{t("modals.options")}</span>
                    </div>
                    <Switch
                      size="sm"
                      isSelected={startNow}
                      color="success"
                      onValueChange={(value) => setStartNow(Boolean(value))}
                    />
                  </div>
                  <p className="text-xs font-medium text-foreground/60">{t("modals.start_now")}</p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="justify-between items-center">
              <Button variant="light" onPress={handleClose} className="text-foreground/50 hover:text-foreground">
                {t("modals.cancel")}
              </Button>
              <Button
                color="primary"
                variant="shadow"
                onPress={handleSubmit}
                startContent={<ArrowDown size={16} />}
                isLoading={isSubmitting}
                isDisabled={!canSubmit || isSubmitting}
              >
                {t("modals.download")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

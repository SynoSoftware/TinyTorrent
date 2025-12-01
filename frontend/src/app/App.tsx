import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TransmissionClient } from "../core/rpc-client";

// Components
import { Navbar } from "../shared/ui/layout/Navbar";
import { StatusBar } from "../shared/ui/layout/StatusBar";
import { TorrentTable } from "../features/dashboard/components/TorrentTable";
import { AddTorrentModal } from "../features/torrent-add/components/AddTorrentModal";
import { SettingsModal } from "../features/settings/components/SettingsModal";

// Data
import { MOCK_TORRENTS } from "../features/dashboard/data/mock";

export default function App() {
  const { t } = useTranslation();

  // State
  const [torrents] = useState(MOCK_TORRENTS);
  const [filter, setFilter] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rpcStatus, setRpcStatus] = useState<"idle" | "connected" | "error">("idle");

  // Stats History (Simulated)
  const [downHistory, setDownHistory] = useState(new Array(20).fill(0));
  const [upHistory, setUpHistory] = useState(new Array(20).fill(0));

  // --- Logic: Simulation Loop ---
  useEffect(() => {
    const interval = setInterval(() => {
      const totalDown = torrents.reduce((acc, t) => acc + (t.status === "downloading" ? t.rateDownload : 0), 0);
      const totalUp = torrents.reduce((acc, t) => acc + t.rateUpload, 0);
      setDownHistory((prev) => [...prev.slice(1), totalDown]);
      setUpHistory((prev) => [...prev.slice(1), totalUp]);
    }, 1000);
    return () => clearInterval(interval);
  }, [torrents]);

  useEffect(() => {
    const client = new TransmissionClient();
    client
      .handshake()
      .then(() => setRpcStatus("connected"))
      .catch(() => setRpcStatus("error"));
  }, []);

  const globalDown = downHistory[downHistory.length - 1];
  const globalUp = upHistory[upHistory.length - 1];

  // --- Logic: Drag & Drop ---
  const onDrop = useCallback((files: File[]) => {
    console.log(files);
    setIsAddModalOpen(true);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div
      {...getRootProps()}
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20"
    >
      <input {...getInputProps()} />

      {/* 1. AMBIENT BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      {/* 2. OVERLAY LAYER */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 border-[6px] border-primary/40 m-4 rounded-3xl"
          >
            <div className="flex flex-col items-center gap-6">
              <FileUp size={48} className="text-primary animate-bounce" />
              <h2 className="text-3xl font-bold">{t("drop_overlay.title")}</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. LAYOUT: Header */}
      <Navbar
        filter={filter}
        setFilter={setFilter}
        onAdd={() => setIsAddModalOpen(true)}
        onSettings={() => setIsSettingsOpen(true)}
      />

      {/* 4. LAYOUT: Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col z-10">
        <TorrentTable torrents={torrents} filter={filter} />
      </main>

      {/* 5. LAYOUT: Footer */}
      <StatusBar
        downSpeed={globalDown}
        upSpeed={globalUp}
        downHistory={downHistory}
        upHistory={upHistory}
        rpcStatus={rpcStatus}
      />

      {/* 6. MODALS */}
      <AddTorrentModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

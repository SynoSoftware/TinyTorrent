import { Button, Input, Tab, Tabs } from "@heroui/react";
import { Search, Settings2, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "../controls/ThemeToggle";
import { LanguageMenu } from "../controls/LanguageMenu";

interface NavbarProps {
  filter: string;
  setFilter: (key: string) => void;
  onAdd: () => void;
  onSettings: () => void;
}

export function Navbar({ filter, setFilter, onAdd, onSettings }: NavbarProps) {
  const { t } = useTranslation();

  return (
    <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 px-6 border-b border-content1/20 bg-background/40 backdrop-blur-xl sticky top-0 select-none">
      <div className="flex items-center gap-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-600 text-white shadow-lg shadow-primary/20">
            <Zap size={18} fill="currentColor" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wide text-foreground/90">{t("brand.name")}</span>
            <span className="text-[9px] text-foreground/40 font-mono tracking-widest">{t("brand.version")}</span>
          </div>
        </div>

        {/* Filters */}
        <Tabs
          aria-label="Filter"
          variant="light"
          size="sm"
          selectedKey={filter}
          onSelectionChange={(k) => setFilter(k as string)}
          classNames={{
            cursor: "w-full bg-primary/20 shadow-none",
            tab: "h-8 px-3 text-tiny font-medium text-foreground/60 data-[selected=true]:text-primary",
            tabContent: "group-data-[selected=true]:font-bold",
          }}
        >
          <Tab key="all" title={t("nav.filter_all")} />
          <Tab key="downloading" title={t("nav.filter_downloading")} />
          <Tab key="seeding" title={t("nav.filter_seeding")} />
        </Tabs>
      </div>

      {/* Global Actions */}
      <div className="flex items-center gap-3">
        <Input
          classNames={{
            base: "w-48 h-8",
            mainWrapper: "h-full",
            input: "text-small",
            inputWrapper: "h-full font-normal text-default-500 bg-default-400/20 dark:bg-default-500/20 border-content1/20",
          }}
          placeholder={t("nav.search_placeholder")}
          size="sm"
          startContent={<Search size={14} />}
        />
        <div className="h-6 w-px bg-content1/20 mx-1" />
        <LanguageMenu />
        <ThemeToggle />
        <Button
          isIconOnly
          variant="ghost"
          radius="full"
          className="text-foreground/70"
          onPress={onSettings}
          aria-label={t("toolbar.settings")}
          title={t("toolbar.settings")}
        >
          <Settings2 size={20} />
        </Button>
        <Button
          color="primary"
          variant="shadow"
          size="sm"
          startContent={<Zap size={14} fill="currentColor" />}
          onPress={onAdd}
          className="font-bold shadow-primary/20"
        >
          {t("toolbar.add_torrent")}
        </Button>
      </div>
    </header>
  );
}

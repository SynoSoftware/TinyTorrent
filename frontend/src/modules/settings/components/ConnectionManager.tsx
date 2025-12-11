import { Button, Chip, Input, cn } from "@heroui/react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { useConnectionConfig } from "../../../app/context/ConnectionConfigContext";

export function ConnectionManager() {
    const { t } = useTranslation();
    const {
        profiles,
        activeProfileId,
        setActiveProfileId,
        addProfile,
        removeProfile,
        updateProfile,
    } = useConnectionConfig();

    return (
        <div className="space-y-4">
            {profiles.map((profile, index) => {
                const isActive = profile.id === activeProfileId;
                return (
                    <GlassPanel
                        key={profile.id}
                        className="p-4 space-y-4 border-content1/20 bg-content1/80"
                    >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <span className="text-[10px] uppercase tracking-[0.4em] text-foreground/40">
                                    {t("settings.connection.profile_title", {
                                        index: index + 1,
                                    })}
                                </span>
                                <h3 className="text-sm font-semibold text-foreground truncate">
                                    {profile.label ||
                                        t(
                                            "settings.connection.profile_placeholder"
                                        )}
                                </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {isActive ? (
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        color="success"
                                        className="text-[10px] tracking-[0.3em] uppercase"
                                    >
                                        {t("settings.connection.active_badge")}
                                    </Chip>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="light"
                                        color="primary"
                                        onPress={() =>
                                            setActiveProfileId(profile.id)
                                        }
                                        className="flex items-center gap-2 text-[10px] tracking-[0.35em]"
                                        type="button"
                                    >
                                        {t("settings.connection.activate")}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="flat"
                                    color="danger"
                                    disabled={profiles.length === 1}
                                    onPress={() => removeProfile(profile.id)}
                                    className="flex items-center gap-1 text-[10px] tracking-[0.35em]"
                                    type="button"
                                >
                                    <Trash2
                                        size={14}
                                        strokeWidth={1.5}
                                        className="text-current"
                                    />
                                    {t("settings.connection.remove")}
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-3">
                            <Input
                                label={t("settings.connection.profile_label")}
                                value={profile.label}
                                variant="bordered"
                                size="sm"
                                onChange={(event) =>
                                    updateProfile(profile.id, {
                                        label: event.target.value,
                                    })
                                }
                                className="text-sm font-medium text-foreground"
                            />
                            <Input
                                label={t("settings.connection.endpoint")}
                                value={profile.endpoint}
                                variant="bordered"
                                size="sm"
                                onChange={(event) =>
                                    updateProfile(profile.id, {
                                        endpoint: event.target.value,
                                    })
                                }
                                className="text-sm font-medium text-foreground"
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                    label={t("settings.connection.username")}
                                    value={profile.username}
                                    variant="flat"
                                    size="sm"
                                    onChange={(event) =>
                                        updateProfile(profile.id, {
                                            username: event.target.value,
                                        })
                                    }
                                />
                                <Input
                                    label={t("settings.connection.password")}
                                    value={profile.password}
                                    variant="flat"
                                    size="sm"
                                    type="password"
                                    onChange={(event) =>
                                        updateProfile(profile.id, {
                                            password: event.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </GlassPanel>
                );
            })}
            <Button
                size="sm"
                variant="flat"
                color="primary"
                onPress={addProfile}
                className={cn(
                    "flex w-full items-center justify-center gap-2 uppercase tracking-[0.4em]",
                    "text-[10px] font-semibold"
                )}
                type="button"
            >
                    <Plus size={16} strokeWidth={1.5} className="text-current" />
                {t("settings.connection.add")}
            </Button>
        </div>
    );
}

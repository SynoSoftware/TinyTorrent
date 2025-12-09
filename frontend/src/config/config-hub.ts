/**
 * Config Hub
 * -----------
 * Single entry point to discover all configuration locations.
 * This file is for navigation only — it does NOT re-export or merge config.
 */

// Global config
import "./constants.json";
import "./iconography";
import "./interaction";
import "./keymap";
import "./detail";

// Feature configs
import "../modules/dashboard/config/layout";
import "../modules/settings/data/config";
import "../modules/settings/data/settings-tabs";
import "../shared/ui/visualizations/config";
import "../shared/ui/visualizations/speedConfig";

// Add future config imports here.

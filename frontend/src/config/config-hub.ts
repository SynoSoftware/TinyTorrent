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
import "./heartbeats";

// Feature configs
import "../modules/dashboard/config/layout";
import "../modules/settings/data/config";
import "../modules/settings/data/settings-tabs";
import "../modules/dashboard/components/details/visualizations/config";
import "../modules/dashboard/components/details/visualizations/speedConfig";

// Add future config imports here.

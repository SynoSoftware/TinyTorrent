/**
 * Config Hub
 * -----------
 * Single entry point to discover all configuration locations.
 * This file is for navigation only — it does NOT re-export or merge config.
 */

// Global config
import "./constants.json";
import "./iconography";

// Feature configs
import "../modules/dashboard/config/layout";
import "../modules/settings/data/config";

// Add future config imports here.

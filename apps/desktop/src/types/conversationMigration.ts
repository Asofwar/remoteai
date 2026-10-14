export const MIGRATION_MODEL_PROVIDERS = ["openai", "codex-switch-local", "codex-switch-gui"] as const;

export type MigrationModelProvider = (typeof MIGRATION_MODEL_PROVIDERS)[number];

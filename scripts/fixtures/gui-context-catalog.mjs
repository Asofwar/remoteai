// A relayed model catalog with a small default, matching a 272 K upstream account setting.
export function guiContextCatalog(maxContextWindow) {
  return { models: [{
    slug: "gpt-5.4", display_name: "gpt-5.4", description: "Context fixture",
    base_instructions: "Reply briefly.", default_reasoning_level: "low",
    supported_reasoning_levels: [{ effort: "low", description: "Low" }],
    shell_type: "shell_command", visibility: "list", supported_in_api: true, priority: 0,
    supports_reasoning_summaries: false, support_verbosity: false,
    default_verbosity: null, apply_patch_tool_type: null,
    truncation_policy: { mode: "bytes", limit: 10000 },
    supports_parallel_tool_calls: false, context_window: 272000,
    max_context_window: maxContextWindow, auto_compact_token_limit: null,
    effective_context_window_percent: 95, experimental_supported_tools: [], input_modalities: ["text"],
  }] };
}

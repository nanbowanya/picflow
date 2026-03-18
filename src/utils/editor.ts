import { App, MarkdownView } from "obsidian";

/**
 * Gets the most appropriate MarkdownView, even if focus is currently in the sidebar.
 * Prioritizes:
 * 1. Currently active MarkdownView
 * 2. Any MarkdownView that has text selected
 * 3. The MarkdownView for the last active file
 * 4. The first available MarkdownView
 */
export function getActiveMarkdownView(app: App): MarkdownView | null {
    const workspace = app.workspace;

    // 1. Try getting the active view directly
    const activeView = workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
        return activeView;
    }

    const leaves = workspace.getLeavesOfType("markdown");
    let fallbackView: MarkdownView | null = null;
    let lastActiveView: MarkdownView | null = null;

    // Helper to check for last active file safely
    const lastFile = (workspace as unknown as { getLastActiveFile?: () => unknown }).getLastActiveFile?.();

    for (const leaf of leaves) {
        if (leaf.view instanceof MarkdownView) {
            const view = leaf.view;
            
            // 2. Check if this view has a selection
            if (view.editor && view.editor.somethingSelected()) {
                return view;
            }

            // Check if this is the last active file's view
            if (lastFile && view.file === lastFile) {
                lastActiveView = view;
            }

            // Keep the first one as a generic fallback
            if (!fallbackView) fallbackView = view;
        }
    }

    // 3. Return last active file view if found
    if (lastActiveView) return lastActiveView;

    // 4. Return generic fallback
    return fallbackView;
}

/**
 * Gets the editor from the active MarkdownView.
 * Safe to call even if the sidebar is focused.
 */
export function getActiveEditor(app: App) {
    const view = getActiveMarkdownView(app);
    return view ? view.editor : null;
}

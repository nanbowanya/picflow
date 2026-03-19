
export class StyleInliner {
    /**
     * Inlines CSS styles into HTML elements' style attributes.
     * This is required for platforms like WeChat that strip <style> tags.
     */
    static inline(html: string, css: string): string {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const container = doc.body;

        // Simple CSS Parser
        // Remove comments
        const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Split by } to get rules
        const rules = cleanCss.split('}');

        for (const rule of rules) {
            const trimmedRule = rule.trim();
            if (!trimmedRule) continue;

            const [selectorPart, stylePart] = trimmedRule.split('{');
            if (!selectorPart || !stylePart) continue;

            const selectors = selectorPart.split(',');
            const styles = stylePart.split(';').map(s => s.trim()).filter(s => s);

            for (const selector of selectors) {
                const trimmedSelector = selector.trim();
                if (!trimmedSelector) continue;

                // Handle pseudo-elements (skip them as they can't be inlined)
                if (trimmedSelector.includes('::') || trimmedSelector.includes(':')) {
                    continue; 
                }

                // [NEW] Remove .picflow-container class from selector for matching inside the container
                // because container.querySelectorAll('.picflow-container h1') might fail if container itself is .picflow-container
                // wait, container.innerHTML is content INSIDE the wrapper.
                // If CSS says .picflow-container h1, and we have <div><h1>...</h1></div> inside container,
                // querySelector('.picflow-container h1') won't match anything because the container itself isn't in innerHTML string yet?
                // Actually StyleInliner creates a div, sets innerHTML = html.
                // So the structure is:
                // <div> (container)
                //    <div class="picflow-container" id="picflow-article"> (from ThemeManager.inlineStyles wrapping)
                //       ... content ...
                //    </div>
                // </div>
                
                // So if selector is `.picflow-container h1`, it SHOULD match.
                
                try {
                    const elements = container.querySelectorAll(trimmedSelector);
                    elements.forEach(el => {
                        const htmlEl = el as HTMLElement;
                        styles.forEach(style => {
                            const [prop, val] = style.split(':');
                            if (prop && val) {
                                // Important: Don't overwrite existing inline styles if possible, or do?
                                // Usually CSS overwrites based on specificity. Here we just append.
                                const currentStyle = htmlEl.getAttribute('style') || '';
                                const newStyle = `${prop.trim()}: ${val.trim()};`;
                                // Simple append strategy
                                htmlEl.setAttribute('style', currentStyle + newStyle);
                            }
                        });
                    });
                } catch (_e) {
                    // Ignore invalid selectors
                    console.warn('Invalid selector in theme:', trimmedSelector);
                }
            }
        }

        return container.innerHTML;
    }
}

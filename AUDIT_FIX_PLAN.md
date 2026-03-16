# Obsidian 插件审核修复计划 (Audit Fix Plan)

本文件基于 `新建文件2.txt` 中的审核反馈生成，用于跟踪修复进度。

> ⚠️ **重要架构约束 (Architecture Constraints)**
>
> 本插件采用 **Lite (开源)** 与 **Pro (闭源)** 双版本构建架构，修复过程中必须严格遵守 `src/core/PicFlow.md` 定义的以下原则：
> 1.  **代码隔离**：Lite 版本构建时，`src/core/` 目录可能不存在或为空。
> 2.  **构建时 Mock**：Lite 构建依赖 `esbuild.config.mjs` 中的 `mock-pro-modules` 插件拦截对 `src/core/` 的引用。
> 3.  **动态加载**：Pro 功能目前通过 `require()` 动态加载。**由于审核禁止 `require()`，必须替换为合规的动态导入方案（如 `import()`），同时确保 Lite 构建不报错。**
> 4.  **接口解耦**：所有跨层调用必须通过 `src/interfaces.ts` 定义的接口进行。

## 🔴 必须修复 (Required)

### 1. 模块加载与依赖 (Modules & Dependencies)
- [x] **禁止使用 `require()`** (A `require()` style import is forbidden)
    - [x] `main.ts` (L118, L119, L192) - 涉及 `src/core` 模块的动态加载。
    - [x] `src/managers/publish-manager.ts` (L180, L214) - `loadPublishers` 和 `loadCustomPublishers` 中使用了 `require()` 同步加载 Pro 模块。
        - **修复方案**: 重构 `PublishManager`，将初始化过程改为异步 (`init()`)，并使用 `await import()` 动态加载模块。
    - [x] `src/managers/theme-manager.ts` (L257, L259) - 使用了 `require('obsidian')`。
        - **修复方案**: 改为静态 `import`。
    - [x] `src/uploaders/oss.ts` (L69) - 使用了 `require('http')`。
        - **修复方案**: 改为 `import * as http from 'http'`。
    - **修复方案**：已将 `require()` 替换为 `await import()`，保持了 Lite/Pro 兼容性。

### 2. Promise 与异步处理 (Promises & Async)
- [x] **Promise 必须被处理** (Promises must be awaited, end with .catch, or be marked as void)
    - [x] `main.ts` (L136, L144, L205)
    - [x] `src/ai/chat/message-bubble.ts` (L62-132, L142-159, L182)
    - [x] `src/settings.ts` (已处理大部分)
- [x] **Promise 返回值类型不匹配** (Promise-returning method provided where a void return was expected)
    - [x] `main.ts` (L185-187) - `Plugin` 扩展方法
    - [x] `src/ai/modals/template-suggest-modal.ts` (L32-60) - `SuggestModal` 方法
    - [x] `src/managers/account-manager.ts` 等多处 (函数参数期望 void)
    - [x] `src/ui/drawers/clip-drawer.ts`, `src/ui/drawers/ai-drawer.ts` - UI 事件回调返回了 Promise。
- [x] **异步方法缺少 `await`** (Async method has no 'await' expression)
    - [x] `src/ai/stub-service.ts`: `generateImage`, `chatCompletionStream`
    - [x] `src/api/keybridge-client.ts`: `getMachineId`
    - [x] `src/managers/account-manager.ts`: `addAccount`
    - [x] `src/managers/upload-handler.ts`: `insertImageAtCursor`, `fetchAndParse`
    - [x] 其他位置: `scanVault`, `startMigration`, `publish`, `renderConfigurationArea`, `checkSession`, `getUserInfo`, `handleFiles`, `switchToTab`
- [x] **布尔条件中的 Promise** (Expected non-Promise value in a boolean conditional)
    - [x] `src/ai/chat/input-area.ts` (L47)
- [x] **异步箭头函数缺少 `await`** (Async arrow function has no 'await' expression)

### 3. 网络请求 (Network Requests)
- [x] **禁止使用 `fetch`** (Unexpected use of 'fetch'. Use `requestUrl`)
    - [x] `src/ai/chat/message-bubble.ts` (L211)
    - [x] `src/managers/event-handler.ts` (L142)
    - [x] `src/managers/upload-handler.ts` (L160)
    - [x] `src/core/ai/service.ts`
        - **Old**: `PicFlow-old/src/core/ai/service.ts` (L128, L160)
        - **New**: `src/core/ai/service.ts` (L128, L160) - 使用了 `fetch` 进行 AI 请求。
        - **注意**: 此处通过 `keybridge` 中转。
        - **修复方案**: 
            - 普通请求: 替换为 `requestUrl`。
            - 流式请求: 替换为 `https.request` (Node.js 原生)，因为 `requestUrl` 不支持流式。需确保 Headers 兼容 `keybridge`。

### 4. DOM 操作与样式 (DOM & Styles)
- [x] **禁止直接设置样式** (Avoid setting styles directly via `element.style.xxx`)
    - [x] `width`, `textAlign`, `color`, `display`, `justifyContent`, `alignItems`, `marginTop`, `gap`, `marginLeft`, `opacity`, `marginBottom`, `border`, `borderRadius`, `padding`, `cursor`, `fontWeight`, `paddingTop`, `flexDirection`, `margin`, `fontSize`, `flex`, `height`, `overflow`, `borderRight`, `minWidth`, `background`, `borderBottom`, `resize`, `fontFamily`, `position`, `backgroundColor`, `maxWidth`, `minHeight`, `boxShadow`, `marginRight`, `paddingBottom`, `textTransform`, `objectFit`, `gridTemplateColumns`, `maxHeight`
    - [x] **解决方案**: 已更新 `styles.css` 并重构了 `settings.ts`, `clip-drawer.ts`, `publish-drawer.ts` 及相关 Modals。
- [x] **禁止使用 `innerHTML`/`outerHTML`** (Do not write to DOM directly using innerHTML/outerHTML property)
    - [x] `src/settings.ts` (extractor preview)
    - [x] `src/ui/drawers/publish-drawer.ts` (preview shadow dom)
- [x] **使用标准 UI 构建方式** (For a consistent UI use `new Setting(containerEl)...`)

### 5. 插件规范与最佳实践 (Plugin Guidelines)
- [x] **命令 ID 不应包含插件 ID** (The command ID should not include the plugin ID)
    - [x] `main.ts` (L141, L150, L164) - 已修复
- [x] **命令名称不应包含插件名称** (The command name should not include the plugin name)
    - [x] `main.ts` (L142) - 需检查
- [x] **避免将插件实例作为 Component 使用** (Avoid using the main plugin instance as a component)
    - [x] `src/ai/chat/message-bubble.ts` (L67, L147) - 已修复
    - [x] `src/settings.ts` (L690) - 需检查
- [x] **不要直接传递 `new Component()`** (Do not pass a `new Component()` directly)
- [ ] **UI 文本使用 Sentence case** (Use sentence case for UI text)
    - [ ] 涉及多个文件

### 6. 类型安全 (Type Safety)
- [x] **避免使用 `any`** (Unexpected any / 'any' overrides all other types)
    - [x] `main.ts`, `src/ai/chat/input-area.ts`, `src/interfaces.ts` 等
- [x] **空接口声明** (An empty interface declaration allows any non-nullish value)
    - [x] `src/interfaces.ts` (L60) - 已修复 (Deleted duplicate)
- [x] **不必要的类型断言** (Expected a `const` instead of a literal type assertion / Assertion unnecessary)
    - [x] `main.ts` (L266)
    - [x] `src/ai/chat/message-bubble.ts` (L67, L147)

### 7. 废弃 API (Deprecated APIs)
- [x] **`execCommand` 已废弃**
    - [x] `src/ui/drawers/publish-drawer.ts` (clipboard fallback) - 已替换为 Notice
- [x] **`substr` 已废弃**
    - [x] `src/ui/login-modal.ts` - 已替换为 substring
- [x] **`confirm` 是非标准 API** (Unexpected confirm)
    - [x] `src/settings.ts` (Delete confirmations) - 已替换为 ConfirmModal

### 8. 错误处理 (Error Handling)
- [x] **Promise 拒绝原因应为 Error 对象** (Expected the Promise rejection reason to be an Error)
- [x] **不必要的 try/catch** (Unnecessary try/catch wrapper)
- [x] **空块语句** (Empty block statement)

## 🟡 可选优化 (Optional)

- [x] **清理未使用的变量与导入** ('xxx' is defined but never used)
    - [x] `main.ts` (Cleanup unused imports like PluginSettingTab, Setting, EditorPosition)
    - [x] `src/settings.ts` (Cleanup unused imports like MarkdownView)

---

**执行策略：**
1.  **Phase 1 (Complete):** Core Module, Network, Basic Promise.
2.  **Phase 2 (Complete):** Styles & DOM.
3.  **Phase 3 (Complete):** Deprecated APIs, Types, and Cleanup.
4.  **Phase 4 (Next):** Architecture Refactor & Async Logic
    - [x] **Refactor `PublishManager`**: Convert to async init to support `await import()` and remove `require()`.
    - [x] **Refactor `AIService`**: Replace `fetch` with `requestUrl`/`https` ensuring `keybridge` compatibility.
    - [x] Fix `Async method has no 'await'` in core services.
    - [x] Fix `Promise returned where void expected`.
    - [x] Safety check for `innerHTML`.
    - [x] Final UI text review.

/**
 * ST快速状态栏扩展 (ST Quick Status Bar Extension)
 *
 * 提供一个简洁的模态框界面，让用户快速为当前角色添加正则表达式规则
 *
 * 功能特性：
 * - 模态框界面，操作集中便捷
 * - 实时正则表达式验证
 * - 当前角色信息显示
 * - 一键插入正则规则到角色
 * - 可选的测试预览功能
 * - 支持多行文本，完全保留用户输入格式
 *
 * @author SillyTavern Plugin Developer
 * @version 1.0.0
 */

(() => {
    'use strict';

    // 扩展基本信息
    const EXTENSION_NAME = 'STQuickStatusBar';
    const EXTENSION_DISPLAY_NAME = 'ST快速状态栏';

    // 导入必要的SillyTavern模块
    let callGenericPopup, POPUP_TYPE, POPUP_RESULT;
    let getContext, writeExtensionField, characters, this_chid;
    let uuidv4, toastr;
    let loadRegexScripts, reloadCurrentChat, getCurrentChatId;
    let eventSource, event_types; // 添加事件系统导入
    let extension_settings, saveSettingsDebounced; // 添加设置管理导入
    let chat_metadata, saveMetadataDebounced; // 本地变量保存与访问
    // 变量读写（与项目宏一致）
    let getLocalVariable, setLocalVariable, getGlobalVariable, setGlobalVariable;

    // 默认设置
    let extensionSettings = {
        enabled: true,
        showPreview: true,
        autoValidate: true,
        rememberLastValues: true,
        lastRegexPattern: '',
        lastReplacement: '',
        lastFlags: 'g',
        // AI功能设置
        aiEnabled: true,
        aiProvider: 'gemini', // 'gemini' 或 'custom'
        geminiApiKey: '',
        customApiUrl: '',
        customApiKey: '',
        defaultModel: 'gemini-2.5-pro',
        customModel: '',
        // 对话历史设置
        enableConversationHistory: true,
        // 使用 Infinity 表示不限制历史条数
        maxHistoryLength: Infinity,
        // 变量范围：global（与 {{getglobalvar}} 一致）或 local（与 {{getvar}} 一致）
        variablesScope: 'local',
    };

    // 扩展是否已初始化
    let isInitialized = false;

    /**
     * 对话历史管理类
     */
    class ConversationHistoryManager {
        constructor() {
            this.storageKey = 'STQuickStatusBar_ConversationHistory';
            this.maxHistory = (extensionSettings.maxHistoryLength === undefined || extensionSettings.maxHistoryLength === null)
                ? Infinity
                : extensionSettings.maxHistoryLength;
        }

        /**
         * 获取历史对话
         */
        getHistory() {
            try {
                const stored = localStorage.getItem(this.storageKey);
                if (!stored) return [];

                const history = JSON.parse(stored);
                return Array.isArray(history) ? history : [];
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 获取历史对话失败:`, error);
                return [];
            }
        }

        /**
         * 添加新对话到历史
         * @param {string} userPrompt 用户输入
         * @param {string} aiResponse AI回复
         */
        addToHistory(userPrompt, aiResponse) {
            try {
                console.log(`[${EXTENSION_NAME}] 尝试添加对话到历史`);
                console.log(`[${EXTENSION_NAME}] enableConversationHistory:`, extensionSettings.enableConversationHistory);
                console.log(`[${EXTENSION_NAME}] userPrompt 长度:`, userPrompt?.length);
                console.log(`[${EXTENSION_NAME}] aiResponse 长度:`, aiResponse?.length);
                
                if (!extensionSettings.enableConversationHistory) {
                    console.log(`[${EXTENSION_NAME}] 历史对话功能已禁用，跳过保存`);
                    return;
                }

                if (!userPrompt?.trim() || !aiResponse?.trim()) {
                    console.warn(`[${EXTENSION_NAME}] 用户输入或AI回复为空，跳过保存`);
                    return;
                }

                const history = this.getHistory();
                console.log(`[${EXTENSION_NAME}] 当前历史记录数量:`, history.length);
                
                const newEntry = {
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    userPrompt: userPrompt.trim(),
                    aiResponse: aiResponse.trim()
                };

                // 添加到历史开头
                history.unshift(newEntry);

                // 限制历史长度（Infinity 表示不限制）
                if (Number.isFinite(this.maxHistory) && this.maxHistory > 0 && history.length > this.maxHistory) {
                    history.splice(this.maxHistory);
                    console.log(`[${EXTENSION_NAME}] 历史记录已截断到 ${this.maxHistory} 条`);
                }

                // 保存到localStorage
                const jsonString = JSON.stringify(history);
                localStorage.setItem(this.storageKey, jsonString);
                console.log(`[${EXTENSION_NAME}] 对话已添加到历史，当前历史长度: ${history.length}`);
                console.log(`[${EXTENSION_NAME}] 保存的JSON长度:`, jsonString.length);
                
                // 触发UI更新
                this.updateHistoryDisplay();
                
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 添加历史对话失败:`, error);
                console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);
            }
        }

        /**
         * 获取最新的用户输入
         */
        getLatestUserInput() {
            const history = this.getHistory();
            return history.length > 0 ? history[0].userPrompt : '';
        }

        /**
         * 构建对话上下文（用于AI调用）
         * @param {string} currentPrompt 当前用户输入
         * @param {string} apiType API类型 'gemini' 或 'openai'
         * @returns {Array} 消息数组
         */
        buildConversationContext(currentPrompt, apiType = 'openai') {
            if (!extensionSettings.enableConversationHistory) {
                return [];
            }

            const history = this.getHistory();
            const messages = [];

            // 添加全部历史对话（不限制条数）
            const recentHistory = history; // 不再切片，使用全部历史
            for (const entry of recentHistory.reverse()) { // 按时间顺序
                if (apiType === 'gemini') {
                    // Gemini格式：user/model
                    messages.push({
                        role: "user",
                        content: entry.userPrompt
                    });
                    messages.push({
                        role: "model",
                        content: entry.aiResponse
                    });
                } else {
                    // OpenAI格式：user/assistant
                    messages.push({
                        role: "user",
                        content: entry.userPrompt
                    });
                    messages.push({
                        role: "assistant",
                        content: entry.aiResponse
                    });
                }
            }

            return messages;
        }

        /**
         * 清空历史对话
         */
        clearHistory() {
            try {
                localStorage.removeItem(this.storageKey);
                console.log(`[${EXTENSION_NAME}] 历史对话已清空`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 清空历史对话失败:`, error);
            }
        }

        /**
         * 更新最大历史长度
         */
        updateMaxHistory(newMax) {
            // 处理不限制的情况
            if (!Number.isFinite(newMax) || newMax <= 0) {
                this.maxHistory = Infinity;
                return;
            }

            this.maxHistory = newMax;

            // 如果当前历史超过新的限制，进行截断
            const history = this.getHistory();
            if (history.length > newMax) {
                history.splice(newMax);
                localStorage.setItem(this.storageKey, JSON.stringify(history));
            }
        }

        /**
         * 更新历史记录显示（UI更新）
         */
        updateHistoryDisplay() {
            try {
                console.log(`[${EXTENSION_NAME}] 更新历史记录显示`);
                
                // 获取当前历史记录数量
                const history = this.getHistory();
                const historyCount = history.length;
                console.log(`[${EXTENSION_NAME}] 当前历史记录数量: ${historyCount}`);
                
                // 更新历史计数显示
                const historyCountElements = document.querySelectorAll('.history-count');
                historyCountElements.forEach(element => {
                    element.textContent = `历史对话: ${historyCount}条`;
                    console.log(`[${EXTENSION_NAME}] 已更新历史计数显示元素`);
                });
                
                // 如果AI提示输入框存在且历史记录不为空，更新输入框内容
                const aiPromptElement = document.getElementById('ai-prompt');
                if (aiPromptElement && historyCount > 0) {
                    const latestInput = this.getLatestUserInput();
                    if (latestInput && aiPromptElement.value !== latestInput) {
                        aiPromptElement.value = latestInput;
                        console.log(`[${EXTENSION_NAME}] 已更新AI提示输入框内容`);
                    }
                }
                
                // 触发自定义事件，通知其他组件历史记录已更新
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    const event = new CustomEvent('STQuickStatusBar:historyUpdated', {
                        detail: { count: historyCount }
                    });
                    window.dispatchEvent(event);
                    console.log(`[${EXTENSION_NAME}] 已触发历史更新事件`);
                }
                
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 更新历史记录显示失败:`, error);
                console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);
            }
        }
    }

    /**
     * 变量管理类 - 使用SillyTavern标准扩展模式
     */
    class VariablesManager {
        constructor() {
            this.currentSessionId = null;
        }

        /**
         * 获取当前会话ID
         */
        getCurrentSessionId() {
            try {
                if (typeof getCurrentChatId === 'function') {
                    const chatId = getCurrentChatId();
                    console.log(`[${EXTENSION_NAME}] 获取当前聊天ID:`, chatId);
                    return chatId;
                }
                
                // 备用方案：从context获取
                if (typeof getContext === 'function') {
                    const context = getContext();
                    if (context && context.characterId) {
                        return context.characterId;
                    }
                }
                
                // 最后的备用方案
                return 'default_session';
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 获取会话ID失败，使用默认值:`, error);
                return 'default_session';
            }
        }

        /**
         * 设置当前会话ID
         */
        setCurrentSessionId(sessionId) {
            this.currentSessionId = sessionId;
            console.log(`[${EXTENSION_NAME}] 当前会话ID已设置为:`, sessionId);
        }

        /**
         * 获取所有变量数据
         */
        // 是否使用全局变量存储
        useGlobalScope() {
            try {
                const scope = (extensionSettings?.variablesScope || 'global').toLowerCase();
                return scope !== 'local';
            } catch { return true; }
        }

        // 直接返回底层存储对象（与项目宏一致）
        getAllVariablesData() {
            if (this.useGlobalScope()) {
                if (!extension_settings?.variables) {
                    extension_settings.variables = { global: {} };
                }
                if (!extension_settings.variables.global) {
                    extension_settings.variables.global = {};
                }
                return extension_settings.variables.global;
            } else {
                // 通过上下文获取最新的 chatMetadata 引用，避免捕获过期对象
                const ctx = typeof getContext === 'function' ? getContext() : null;
                const meta = ctx?.chatMetadata ?? chat_metadata;
                if (!meta.variables) {
                    meta.variables = {};
                }
                return meta.variables;
            }
        }

        // 插件变量存储（嵌套 JSON，不影响宏用的通用变量）
        getAllPluginVariablesData() {
            if (this.useGlobalScope()) {
                if (!extension_settings[EXTENSION_NAME]) extension_settings[EXTENSION_NAME] = {};
                if (!extension_settings[EXTENSION_NAME].variablesPlugin) extension_settings[EXTENSION_NAME].variablesPlugin = {};
                return extension_settings[EXTENSION_NAME].variablesPlugin;
            } else {
                const ctx = typeof getContext === 'function' ? getContext() : null;
                const meta = ctx?.chatMetadata ?? chat_metadata;
                if (!meta.plugin_variables) meta.plugin_variables = {};
                if (!meta.plugin_variables[EXTENSION_NAME]) meta.plugin_variables[EXTENSION_NAME] = {};
                if (!meta.plugin_variables[EXTENSION_NAME].variables) meta.plugin_variables[EXTENSION_NAME].variables = {};
                return meta.plugin_variables[EXTENSION_NAME].variables;
            }
        }

        /**
         * 保存所有变量数据
         */
        async saveAllVariablesData(data) {
            try {
                if (this.useGlobalScope()) {
                    // 写入全局变量对象并持久化
                    if (!extension_settings.variables) extension_settings.variables = { global: {} };
                    extension_settings.variables.global = data || {};
                    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
                } else {
                    // 写入本地变量对象并持久化（始终通过 context 引用，避免失效）
                    const ctx = typeof getContext === 'function' ? getContext() : null;
                    const meta = ctx?.chatMetadata ?? chat_metadata ?? {};
                    meta.variables = data || {};
                    if (typeof saveMetadataDebounced === 'function') saveMetadataDebounced();
                    // 立即强制保存，避免用户立刻查看文件时未落盘
                    if (ctx && typeof ctx.saveMetadata === 'function') {
                        try { await ctx.saveMetadata(); } catch (_) {}
                    }
                }
                return true;
            } catch (err) {
                console.error(`[${EXTENSION_NAME}] 保存变量失败:`, err);
                return false;
            }
        }

        /**
         * 保存插件变量（嵌套 JSON，含描述）
         * 与通用变量分开存储，避免影响宏读取
         */
        async saveAllPluginVariablesData(data) {
            try {
                if (this.useGlobalScope()) {
                    if (!extension_settings[EXTENSION_NAME]) extension_settings[EXTENSION_NAME] = {};
                    extension_settings[EXTENSION_NAME].variablesPlugin = data || {};
                    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
                } else {
                    const ctx = typeof getContext === 'function' ? getContext() : null;
                    const meta = ctx?.chatMetadata ?? chat_metadata ?? {};
                    if (!meta.plugin_variables) meta.plugin_variables = {};
                    if (!meta.plugin_variables[EXTENSION_NAME]) meta.plugin_variables[EXTENSION_NAME] = {};
                    meta.plugin_variables[EXTENSION_NAME].variables = data || {};
                    if (typeof saveMetadataDebounced === 'function') saveMetadataDebounced();
                    if (ctx && typeof ctx.saveMetadata === 'function') {
                        try { await ctx.saveMetadata(); } catch (_) {}
                    }
                }
                return true;
            } catch (err) {
                console.error(`[${EXTENSION_NAME}] 保存插件变量失败:`, err);
                return false;
            }
        }

        /**
         * 获取当前会话的变量列表
         */
        // 将底层对象映射为列表供UI展示（包含通用与插件两类）
        getSessionVariables(_sessionId = null) {
            const generic = this.getAllVariablesData();
            const plugin = this.getAllPluginVariablesData();

            const result = [];

            for (const [name, value] of Object.entries(generic || {})) {
                result.push({
                    id: `generic:${name}`,
                    name,
                    value: typeof value === 'string' ? value : JSON.stringify(value),
                    description: '',
                    type: 'generic',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }

            for (const [name, obj] of Object.entries(plugin || {})) {
                const val = obj?.value;
                const desc = obj?.description ?? '';
                const created = obj?.createdAt ?? new Date().toISOString();
                const updated = obj?.updatedAt ?? created;
                result.push({
                    id: `plugin:${name}`,
                    name,
                    value: typeof val === 'string' ? val : JSON.stringify(val),
                    description: typeof desc === 'string' ? desc : JSON.stringify(desc),
                    type: 'plugin',
                    createdAt: created,
                    updatedAt: updated,
                });
            }

            return result;
        }

        /**
         * 初始化存储系统
         */
        initializeStorage() {
            try {
                // 确保存储对象存在（与核心宏一致）
                if (this.useGlobalScope()) {
                    if (!extension_settings.variables) extension_settings.variables = { global: {} };
                    if (!extension_settings.variables.global) extension_settings.variables.global = {};
                    console.log(`[${EXTENSION_NAME}] 存储系统初始化完成，使用全局变量 extension_settings.variables.global`);
                } else {
                    if (!chat_metadata) chat_metadata = {};
                    if (!chat_metadata.variables) chat_metadata.variables = {};
                    console.log(`[${EXTENSION_NAME}] 存储系统初始化完成，使用本地变量 chat_metadata.variables`);
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 存储系统初始化失败:`, error);
                throw error;
            }
        }
        /**
         * 添加变量到当前会话
         */
        async addVariable(name, value, description = '', insertType = 'plugin') {
            try {
                const trimmed = String(name || '').trim();
                if (!trimmed) return null;
                let newVariable;
                const wantPlugin = insertType === 'plugin' || insertType === 'both';
                const wantGeneric = insertType === 'generic' || insertType === 'both';

                if (wantGeneric) {
                    if (this.useGlobalScope()) {
                        if (typeof setGlobalVariable === 'function') {
                            setGlobalVariable(trimmed, String(value ?? ''));
                        } else {
                            const store = this.getAllVariablesData();
                            store[trimmed] = String(value ?? '');
                            await this.saveAllVariablesData(store);
                        }
                    } else {
                        if (typeof setLocalVariable === 'function') {
                            setLocalVariable(trimmed, String(value ?? ''));
                        } else {
                            const store = this.getAllVariablesData();
                            store[trimmed] = String(value ?? '');
                            await this.saveAllVariablesData(store);
                        }
                    }
                    newVariable = {
                        id: `generic:${trimmed}`,
                        name: trimmed,
                        value: String(value ?? ''),
                        description,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        type: 'generic',
                    };
                }

                if (wantPlugin) {
                    const pluginStore = this.getAllPluginVariablesData();
                    pluginStore[trimmed] = {
                        value: String(value ?? ''),
                        description: String(description ?? ''),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    await this.saveAllPluginVariablesData(pluginStore);
                    newVariable = {
                        id: `plugin:${trimmed}`,
                        name: trimmed,
                        value: String(value ?? ''),
                        description,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        type: 'plugin',
                    };
                }
                await this.updateVariablesDisplay();
                return newVariable;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 添加变量失败:`, error);
                return null;
            }
        }

        /**
         * 删除变量
         */
        async deleteVariable(variableId) {
            try {
                const [type, name] = String(variableId).split(':');
                if (type === 'plugin') {
                    const pStore = this.getAllPluginVariablesData();
                    if (!(name in pStore)) return false;
                    delete pStore[name];
                    const success = await this.saveAllPluginVariablesData(pStore);
                    if (success) await this.updateVariablesDisplay();
                    return success;
                }
                const store = this.getAllVariablesData();
                if (!(name in store)) return false;
                delete store[name];
                const success = await this.saveAllVariablesData(store);
                if (success) await this.updateVariablesDisplay();
                return success;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 删除变量失败:`, error);
                return false;
            }
        }

        /**
         * 更新变量 - 支持异步
         */
        async updateVariable(variableId, name, value, description = '') {
            try {
                const newName = String(name || '').trim();
                const [type, oldNameRaw] = String(variableId).split(':');
                const oldName = oldNameRaw || newName;

                if (type === 'plugin') {
                    // 更新插件变量，并同步更新通用变量值
                    const pStore = this.getAllPluginVariablesData();
                    if (oldName !== newName && pStore[oldName]) {
                        delete pStore[oldName];
                    }
                    pStore[newName] = {
                        value: String(value ?? ''),
                        description: String(description ?? ''),
                        createdAt: pStore[newName]?.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    await this.saveAllPluginVariablesData(pStore);

                    // 同步写入通用变量
                    const store = this.getAllVariablesData();
                    if (oldName !== newName && store[oldName]) delete store[oldName];
                    store[newName] = String(value ?? '');
                    await this.saveAllVariablesData(store);

                    await this.updateVariablesDisplay();
                    return { id: `plugin:${newName}`, name: newName, value: String(value ?? ''), description, updatedAt: new Date().toISOString() };
                } else {
                    // 仅更新通用变量
                    const store = this.getAllVariablesData();
                    if (oldName !== newName && store[oldName]) delete store[oldName];
                    store[newName] = String(value ?? '');
                    await this.saveAllVariablesData(store);
                    await this.updateVariablesDisplay();
                    return { id: `generic:${newName}`, name: newName, value: String(value ?? ''), description, updatedAt: new Date().toISOString() };
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 更新变量失败:`, error);
                return null;
            }
        }

        /**
         * 清空当前会话的所有变量 - 支持异步
         */
        async clearSessionVariables() {
            try {
                await this.saveAllVariablesData({});
                await this.saveAllPluginVariablesData({});
                await this.updateVariablesDisplay();
                return true;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 清空变量失败:`, error);
                return false;
            }
        }

        /**
         * 导出当前会话的变量
         */
        async exportSessionVariables() {
            try {
                const variables = await this.getSessionVariables();
                const exportData = {
                    scope: this.useGlobalScope() ? 'global' : 'local',
                    exportTime: new Date().toISOString(),
                    variables: variables
                };

                const dataStr = JSON.stringify(exportData, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const exportFileDefaultName = `variables_${this.useGlobalScope() ? 'global' : 'local'}_${new Date().toISOString().split('T')[0]}.json`;
                
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
                
                console.log(`[${EXTENSION_NAME}] 变量导出完成`);
                return true;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 导出变量失败:`, error);
                return false;
            }
        }

        /**
         * 导入变量
         */
        async importVariables(jsonData) {
            try {
                const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
                
                if (!data.variables || !Array.isArray(data.variables)) {
                    throw new Error('无效的变量数据格式');
                }
                let importCount = 0;

                for (const variable of data.variables) {
                    if (variable.name && variable.value !== undefined) {
                        await this.addVariable(variable.name, variable.value, variable.description || '');
                        importCount++;
                    }
                }
                console.log(`[${EXTENSION_NAME}] 导入 ${importCount} 个变量到 ${this.useGlobalScope() ? 'global' : 'local'}`);
                return importCount;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 导入变量失败:`, error);
                throw error;
            }
        }

        /**
         * 更新变量显示UI - 支持异步
         */
        async updateVariablesDisplay() {
            try {
                const sessionId = this.getCurrentSessionId();
                const variables = await this.getSessionVariables();
                
                // 更新会话ID显示
                const sessionIdElement = document.getElementById('current-session-id');
                if (sessionIdElement) {
                    sessionIdElement.textContent = sessionId || '未获取到会话ID';
                }

                // 更新变量数量显示
                const countElement = document.getElementById('variables-count');
                if (countElement) {
                    countElement.textContent = variables.length.toString();
                }

                // 更新变量列表
                this.renderVariablesList(variables);
                
                console.log(`[${EXTENSION_NAME}] 变量显示已更新，会话: ${sessionId}，数量: ${variables.length}`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 更新变量显示失败:`, error);
            }
        }

        /**
         * 渲染变量列表
         */
        /**
         * 打开变量编辑器
         */
        async openVariablesEditor() {
            try {
                const overlay = document.getElementById('variables-editor-overlay');
                if (!overlay) return;

                // 显示编辑器
                overlay.style.display = 'flex';
                setTimeout(() => {
                    overlay.classList.add('active');
                }, 10);

                // 渲染变量到编辑器
                await this.renderVariablesToEditor();

                console.log(`[${EXTENSION_NAME}] 变量编辑器已打开`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 打开变量编辑器失败:`, error);
            }
        }

        /**
         * 关闭变量编辑器
         */
        closeVariablesEditor() {
            try {
                const overlay = document.getElementById('variables-editor-overlay');
                if (!overlay) return;

                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 300);

                console.log(`[${EXTENSION_NAME}] 变量编辑器已关闭`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 关闭变量编辑器失败:`, error);
            }
        }

        /**
         * 渲染变量到编辑器表格
         */
        async renderVariablesToEditor(searchText = '') {
            const container = document.getElementById('variables-editor-table-container');
            const countElement = document.getElementById('editor-search-count');
            if (!container) return;

            const variables = await this.getSessionVariables();
            let filteredVariables = variables;

            // 应用搜索过滤
            if (searchText.trim()) {
                const search = searchText.toLowerCase();
                filteredVariables = variables.filter(variable => 
                    (variable.name && variable.name.toLowerCase().includes(search)) ||
                    (variable.value && String(variable.value).toLowerCase().includes(search)) ||
                    (variable.description && String(variable.description).toLowerCase().includes(search)) ||
                    (variable.type && variable.type.toLowerCase().includes(search))
                );
            }

            // 类型过滤
            const typeSelector = document.getElementById('variables-type-filter');
            const typeFilter = typeSelector ? typeSelector.value : 'all';
            if (typeFilter !== 'all') {
                filteredVariables = filteredVariables.filter(v => v.type === typeFilter);
            }

            // 更新计数
            if (countElement) {
                countElement.textContent = `共 ${filteredVariables.length} 个变量`;
                if (searchText.trim() && filteredVariables.length !== variables.length) {
                    countElement.textContent += ` (从 ${variables.length} 个中筛选)`;
                }
            }

            if (filteredVariables.length === 0) {
                container.innerHTML = `
                    <div class="variables-editor-empty">
                        <h3>${searchText.trim() ? '未找到匹配的变量' : '暂无变量'}</h3>
                        <p>${searchText.trim() ? '尝试修改搜索条件' : '添加第一个变量来开始使用'}</p>
                    </div>
                `;
                return;
            }

            let html = `
                <table class="variables-editor-table">
                    <thead>
                        <tr>
                            <th>类型</th>
                            <th>变量名</th>
                            <th>变量值</th>
                            <th>变量作用</th>
                            <th>创建时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            filteredVariables.forEach(variable => {
                const createTime = new Date(variable.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                html += `
                    <tr data-variable-id="${variable.id}">
                        <td class="variable-type-cell">${variable.type === 'plugin' ? '插件' : '通用'}</td>
                        <td class="variable-name-cell">${this.escapeHtml(variable.name)}</td>
                        <td class="variable-value-cell">${this.escapeHtml(variable.value)}</td>
                        <td class="variable-description-cell">${this.escapeHtml(variable.description || '无描述')}</td>
                        <td class="variable-time-cell">${createTime}</td>
                        <td class="variable-actions-cell">
                            <button class="variable-action-btn variable-edit-btn" onclick="variablesManager.editVariableInEditor('${variable.id}')">编辑</button>
                            <button class="variable-action-btn variable-delete-btn" onclick="variablesManager.deleteVariableWithConfirm('${variable.id}')">删除</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            container.innerHTML = html;
        }

        /**
         * 在编辑器中编辑变量 - 支持异步
         */
        async editVariableInEditor(variableId) {
            try {
                const variables = await this.getSessionVariables();
                const variable = variables.find(v => v.id === variableId);
                
                if (!variable) {
                    showStatus('变量不存在', true);
                    return;
                }

                // 创建编辑弹窗
                const editHtml = `
                    <div class="edit-variable-form">
                        <h4>编辑变量</h4>
                        <div class="form-group">
                            <label for="edit-variable-name">变量名:</label>
                            <input type="text" id="edit-variable-name" class="form-control" value="${this.escapeHtml(variable.name)}">
                        </div>
                        <div class="form-group">
                            <label for="edit-variable-value">变量值:</label>
                            <input type="text" id="edit-variable-value" class="form-control" value="${this.escapeHtml(variable.value)}">
                        </div>
                        <div class="form-group">
                            <label for="edit-variable-description">变量作用:</label>
                            <textarea id="edit-variable-description" class="form-control" rows="3">${this.escapeHtml(variable.description)}</textarea>
                        </div>
                    </div>
                `;

                if (callGenericPopup) {
                    callGenericPopup(editHtml, POPUP_TYPE.CONFIRM, '', {
                        okButton: '保存',
                        cancelButton: '取消'
                    }).then(async (result) => {
                        if (result) {
                            const name = document.getElementById('edit-variable-name')?.value?.trim();
                            const value = document.getElementById('edit-variable-value')?.value || '';
                            const description = document.getElementById('edit-variable-description')?.value?.trim() || '';

                            if (!name) {
                                showStatus('变量名不能为空', true);
                                return;
                            }

                            const updated = await this.updateVariable(variableId, name, value, description);
                            if (updated) {
                                showStatus('变量已更新');
                                // 刷新编辑器显示
                                await this.renderVariablesToEditor();
                            } else {
                                showStatus('更新变量失败', true);
                            }
                        }
                    }).catch(() => {
                        // 用户取消
                    });
                } else {
                    showStatus('编辑变量失败', true);
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 编辑变量失败:`, error);
                showStatus('编辑变量失败', true);
            }
        }

        /**
         * 搜索变量
         */
        async searchVariables(searchText) {
            await this.renderVariablesToEditor(searchText);
        }
        
        renderVariablesList(variables) {
            const container = document.getElementById('variables-list-container');
            if (!container) return;

            if (variables.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-text">暂无变量</div>
                        <div class="empty-subtext">添加第一个变量来开始使用</div>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="variables-table">
                    <div class="table-header">
                        <div class="header-cell type-col">类型</div>
                        <div class="header-cell name-col">变量名</div>
                        <div class="header-cell value-col">变量值</div>
                        <div class="header-cell desc-col">变量作用</div>
                        <div class="header-cell time-col">创建时间</div>
                        <div class="header-cell actions-col">操作</div>
                    </div>
                    <div class="table-body">
            `;
            
            variables.forEach((variable, index) => {
                const createTime = new Date(variable.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                html += `
                    <div class="table-row" data-variable-id="${variable.id}">
                        <div class="table-cell type-col" data-label="类型">${variable.type === 'plugin' ? '插件' : '通用'}</div>
                        <div class="table-cell name-col" data-label="变量名">
                            <span class="variable-name">${this.escapeHtml(variable.name)}</span>
                        </div>
                        <div class="table-cell value-col" data-label="变量值">
                            <span class="variable-value">${this.escapeHtml(variable.value)}</span>
                        </div>
                        <div class="table-cell desc-col" data-label="变量作用">
                            <span class="variable-description" title="${this.escapeHtml(variable.description || '')}">
                                ${this.escapeHtml(variable.description || '无描述')}
                            </span>
                        </div>
                        <div class="table-cell time-col" data-label="创建时间">
                            <span class="create-time">${createTime}</span>
                        </div>
                        <div class="table-cell actions-col" data-label="操作">
                            <div class="action-buttons">
                                <button class="btn-action btn-edit" onclick="variablesManager.editVariable('${variable.id}')" title="编辑">
                                    编辑
                                </button>
                                <button class="btn-action btn-delete" onclick="variablesManager.deleteVariableWithConfirm('${variable.id}')" title="删除">
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
            container.innerHTML = html;
        }

        /**
         * HTML转义函数
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * 编辑变量（弹窗）
         */
        async editVariable(variableId) {
            try {
                const variables = await this.getSessionVariables();
                const variable = variables.find(v => v.id === variableId);
                
                if (!variable) {
                    showStatus('变量不存在', true);
                    return;
                }

                // 创建编辑弹窗
                const editHtml = `
                    <div class="edit-variable-form">
                        <h4>编辑变量</h4>
                        <div class="form-group">
                            <label for="edit-variable-name">变量名:</label>
                            <input type="text" id="edit-variable-name" class="form-control" value="${this.escapeHtml(variable.name)}">
                        </div>
                        <div class="form-group">
                            <label for="edit-variable-value">变量值:</label>
                            <input type="text" id="edit-variable-value" class="form-control" value="${this.escapeHtml(variable.value)}">
                        </div>
                        <div class="form-group">
                            <label for="edit-variable-description">变量作用:</label>
                            <textarea id="edit-variable-description" class="form-control" rows="3">${this.escapeHtml(variable.description)}</textarea>
                        </div>
                    </div>
                `;

                if (callGenericPopup) {
                    callGenericPopup(editHtml, POPUP_TYPE.CONFIRM, '', {
                        okButton: '保存',
                        cancelButton: '取消'
                    }).then(async result => {
                        if (result) {
                            const name = document.getElementById('edit-variable-name')?.value?.trim();
                            const value = document.getElementById('edit-variable-value')?.value || '';
                            const description = document.getElementById('edit-variable-description')?.value?.trim() || '';

                            if (!name) {
                                showStatus('变量名不能为空', true);
                                return;
                            }

                            const updated = await this.updateVariable(variableId, name, value, description);
                            if (updated) {
                                showStatus('变量已更新');
                            } else {
                                showStatus('更新变量失败', true);
                            }
                        }
                    });
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 编辑变量失败:`, error);
                showStatus('编辑变量失败', true);
            }
        }

        /**
         * 删除变量（带确认）
         */
        async deleteVariableWithConfirm(variableId) {
            try {
                const variables = await this.getSessionVariables();
                const variable = variables.find(v => v.id === variableId);
                
                if (!variable) {
                    showStatus('变量不存在', true);
                    return;
                }

                if (callGenericPopup) {
                    callGenericPopup(
                        `确定要删除变量 "${variable.name}" 吗？此操作无法撤销。`,
                        POPUP_TYPE.CONFIRM,
                        '',
                        {
                            okButton: '删除',
                            cancelButton: '取消'
                        }
                    ).then(async result => {
                        if (result) {
                            const success = await this.deleteVariable(variableId);
                            if (success) {
                                showStatus('变量已删除');
                            } else {
                                showStatus('删除变量失败', true);
                            }
                        }
                    });
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 删除变量失败:`, error);
                showStatus('删除变量失败', true);
            }
        }

        /**
         * 更新变量
         */
        async updateVariable(variableId, name, value, description = '') {
            try {
                const sessionId = this.getCurrentSessionId();
                const allData = this.getAllVariablesData();
                
                if (!allData[sessionId]) {
                    return false;
                }
                
                const variable = allData[sessionId].find(v => v.id === variableId);
                if (!variable) {
                    return false;
                }
                
                variable.name = name;
                variable.value = value;
                variable.description = description;
                variable.updatedAt = new Date().toISOString();
                
                const success = this.saveAllVariablesData(allData);
                
                if (success) {
                    console.log(`[${EXTENSION_NAME}] 变量已更新:`, variable);
                    await this.updateVariablesDisplay();
                }
                
                return success;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 更新变量失败:`, error);
                return false;
            }
        }

        /**
         * 清空当前会话的所有变量
         */
        async clearSessionVariables() {
            try {
                const sessionId = this.getCurrentSessionId();
                const allData = this.getAllVariablesData();
                
                allData[sessionId] = [];
                const success = this.saveAllVariablesData(allData);
                
                if (success) {
                    console.log(`[${EXTENSION_NAME}] 会话变量已清空:`, sessionId);
                    await this.updateVariablesDisplay();
                }
                
                return success;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 清空变量失败:`, error);
                return false;
            }
        }

        /**
         * 导出当前会话的变量
         */
        exportSessionVariables() {
            try {
                const sessionId = this.getCurrentSessionId();
                const variables = this.getSessionVariables();
                
                const exportData = {
                    sessionId: sessionId,
                    exportTime: new Date().toISOString(),
                    variables: variables
                };
                
                const dataStr = JSON.stringify(exportData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                
                const link = document.createElement('a');
                link.href = url;
                link.download = `variables_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                console.log(`[${EXTENSION_NAME}] 变量导出完成`);
                return true;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 导出变量失败:`, error);
                return false;
            }
        }

        /**
         * 导入变量
         */
        async importVariables(jsonData) {
            try {
                const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
                
                if (!data.variables || !Array.isArray(data.variables)) {
                    throw new Error('无效的变量数据格式');
                }
                
                const sessionId = this.getCurrentSessionId();
                const allData = this.getAllVariablesData();
                
                if (!allData[sessionId]) {
                    allData[sessionId] = [];
                }
                
                let importCount = 0;

                for (const variable of data.variables) {
                    if (variable.name && variable.value !== undefined) {
                        await this.addVariable(variable.name, variable.value, variable.description || '');
                        importCount++;
                    }
                }

                console.log(`[${EXTENSION_NAME}] 导入 ${importCount} 个变量到会话 ${sessionId}`);
                return importCount;
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 导入变量失败:`, error);
                return 0;
            }
        }

        /**
         * 更新变量显示
         */
        async updateVariablesDisplay() {
            try {
                const sessionId = this.getCurrentSessionId();
                const variables = this.getSessionVariables();

                // 更新会话ID显示
                const sessionIdElement = document.getElementById('current-session-id');
                if (sessionIdElement) {
                    sessionIdElement.textContent = sessionId || '未获取到会话ID';
                }

                // 更新变量数量显示
                const countElement = document.getElementById('variables-count');
                if (countElement) {
                    countElement.textContent = variables.length.toString();
                }

                // 更新变量列表
                this.renderVariablesList(variables);
                
                console.log(`[${EXTENSION_NAME}] 变量显示已更新，会话: ${sessionId}，数量: ${variables.length}`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 更新变量显示失败:`, error);
            }
        }

        /**
         * 打开变量编辑器
         */
        async openVariablesEditor() {
            try {
                const overlay = document.getElementById('variables-editor-overlay');
                if (!overlay) return;

                // 显示编辑器
                overlay.style.display = 'flex';
                setTimeout(() => {
                    overlay.classList.add('active');
                }, 10);

                // 渲染变量到编辑器
                await this.renderVariablesToEditor();

                console.log(`[${EXTENSION_NAME}] 变量编辑器已打开`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 打开变量编辑器失败:`, error);
            }
        }

        /**
         * 渲染变量到编辑器（覆盖层）
         */
        async renderVariablesToEditor(searchText = '') {
            const container = document.getElementById('variables-editor-table-container');
            const countElement = document.getElementById('editor-search-count');
            if (!container) return;

            const variables = await this.getSessionVariables();
            let filteredVariables = variables;

            // 搜索过滤
            if (searchText.trim()) {
                const search = searchText.toLowerCase();
                filteredVariables = variables.filter(variable =>
                    (variable.name && variable.name.toLowerCase().includes(search)) ||
                    (variable.value && String(variable.value).toLowerCase().includes(search)) ||
                    (variable.description && String(variable.description).toLowerCase().includes(search)) ||
                    (variable.type && variable.type.toLowerCase().includes(search))
                );
            }

            // 类型过滤
            const typeSelector = document.getElementById('variables-type-filter');
            const typeFilter = typeSelector ? typeSelector.value : 'all';
            if (typeFilter !== 'all') {
                filteredVariables = filteredVariables.filter(v => v.type === typeFilter);
            }

            // 更新计数
            if (countElement) {
                countElement.textContent = `共 ${filteredVariables.length} 个变量`;
                if (searchText.trim() && filteredVariables.length !== variables.length) {
                    countElement.textContent += ` (从 ${variables.length} 个中筛选)`;
                }
            }

            if (filteredVariables.length === 0) {
                container.innerHTML = `
                    <div class="variables-editor-empty">
                        <h3>${searchText.trim() ? '未找到匹配的变量' : '暂无变量'}</h3>
                        <p>${searchText.trim() ? '尝试修改搜索条件' : '添加第一个变量来开始使用'}</p>
                    </div>
                `;
                return;
            }

            let html = `
                <table class="variables-editor-table">
                    <thead>
                        <tr>
                            <th>类型</th>
                            <th>变量名</th>
                            <th>变量值</th>
                            <th>变量作用</th>
                            <th>创建时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            filteredVariables.forEach(variable => {
                const createTime = new Date(variable.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                html += `
                    <tr data-variable-id="${variable.id}">
                        <td class="variable-type-cell">${variable.type === 'plugin' ? '插件' : '通用'}</td>
                        <td class="variable-name-cell">${this.escapeHtml(variable.name)}</td>
                        <td class="variable-value-cell">${this.escapeHtml(variable.value)}</td>
                        <td class="variable-description-cell">${this.escapeHtml(variable.description || '无描述')}</td>
                        <td class="variable-time-cell">${createTime}</td>
                        <td class="variable-actions-cell">
                            <button class="variable-action-btn variable-edit-btn" onclick="variablesManager.editVariable('${variable.id}')">编辑</button>
                            <button class="variable-action-btn variable-delete-btn" onclick="variablesManager.deleteVariableWithConfirm('${variable.id}')">删除</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            container.innerHTML = html;
        }

        /**
         * 搜索变量
         */
        async searchVariables(searchText) {
            await this.renderVariablesToEditor(searchText);
        }
        
        /**
         * 渲染变量列表
         */
        renderVariablesList(variables) {
            const container = document.getElementById('variables-list-container');
            if (!container) return;

            if (variables.length === 0) {
                container.innerHTML = '<p class="text-muted">当前会话暂无变量</p>';
                return;
            }

            let html = '<div class="variables-list">';
            variables.forEach(variable => {
                html += `
                    <div class="variable-item" data-variable-id="${variable.id}">
                        <div class="variable-name">${this.escapeHtml(variable.name)}
                            <span class="variable-badge" title="类型">${variable.type === 'plugin' ? '插件' : '通用'}</span>
                        </div>
                        <div class="variable-value">${this.escapeHtml(variable.value)}</div>
                        ${variable.description ? `<div class="variable-description">${this.escapeHtml(variable.description)}</div>` : ''}
                    </div>
                `;
            });
            html += '</div>';

            container.innerHTML = html;
        }

        /**
         * 编辑变量（弹窗）
         */
        async editVariable(variableId) {
            try {
                const variables = this.getSessionVariables();
                const variable = variables.find(v => v.id === variableId);
                
                if (!variable) {
                    showStatus('变量不存在', true);
                    return;
                }

                // 创建编辑弹窗
                const editHtml = `
                    <div class="form-group">
                        <label for="edit-variable-name">变量名称:</label>
                        <input type="text" id="edit-variable-name" class="form-control" value="${this.escapeHtml(variable.name)}" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-variable-value">变量值:</label>
                        <textarea id="edit-variable-value" class="form-control" rows="3">${this.escapeHtml(variable.value)}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="edit-variable-description">变量作用:</label>
                        <input type="text" id="edit-variable-description" class="form-control" value="${this.escapeHtml(variable.description || '')}" placeholder="可选，描述这个变量的作用">
                    </div>
                `;

                if (callGenericPopup) {
                    callGenericPopup(editHtml, POPUP_TYPE.CONFIRM, '', {
                        okButton: '保存',
                        cancelButton: '取消'
                    }).then(async result => {
                        if (result) {
                            const name = document.getElementById('edit-variable-name')?.value?.trim();
                            const value = document.getElementById('edit-variable-value')?.value || '';
                            const description = document.getElementById('edit-variable-description')?.value?.trim() || '';

                            if (!name) {
                                showStatus('变量名不能为空', true);
                                return;
                            }

                            const updated = await this.updateVariable(variableId, name, value, description);
                            if (updated) {
                                showStatus('变量已更新');
                            } else {
                                showStatus('更新变量失败', true);
                            }
                        }
                    });
                } else {
                    console.warn(`[${EXTENSION_NAME}] callGenericPopup 不可用`);
                    showStatus('编辑变量失败', true);
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 编辑变量失败:`, error);
                showStatus('编辑变量失败', true);
            }
        }

        /**
         * 删除变量（带确认）
         */
        async deleteVariableWithConfirm(variableId) {
            try {
                const variables = this.getSessionVariables();
                const variable = variables.find(v => v.id === variableId);
                
                if (!variable) {
                    showStatus('变量不存在', true);
                    return;
                }

                if (callGenericPopup) {
                    callGenericPopup(
                        `确定要删除变量 "${variable.name}" 吗？\n\n这个操作无法撤销。`,
                        POPUP_TYPE.CONFIRM,
                        '确认删除',
                        { okButton: '删除', cancelButton: '取消' }
                    ).then(async result => {
                        if (result) {
                            const success = await this.deleteVariable(variableId);
                            if (success) {
                                showStatus('变量已删除');
                            } else {
                                showStatus('删除变量失败', true);
                            }
                        }
                    });
                } else {
                    console.warn(`[${EXTENSION_NAME}] callGenericPopup 不可用`);
                    showStatus('删除变量失败', true);
                }
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 删除变量失败:`, error);
                showStatus('删除变量失败', true);
            }
        }

        /**
         * 生成变量ID
         */
        generateVariableId() {
            if (typeof uuidv4 === 'function') {
                return uuidv4();
            }
            // 备用方案：生成随机ID
            return 'var_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        }

        /**
         * HTML转义
         */
        escapeHtml(text) {
            if (typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // 创建对话历史管理实例
    const conversationHistory = new ConversationHistoryManager();

    // 创建变量管理实例
    const variablesManager = new VariablesManager();

    // 将变量管理器暴露到全局作用域，以便HTML onclick可以访问
    window.variablesManager = variablesManager;

    // 存储系统初始化改为在模块导入完成后执行（见 initializeExtension）

    /**
     * 异步导入SillyTavern的模块
     */
    async function importSillyTavernModules() {
        console.log(`[${EXTENSION_NAME}] 开始导入SillyTavern模块`);

        try {
            // 导入弹窗模块
            console.log(`[${EXTENSION_NAME}] 导入弹窗模块: /scripts/popup.js`);
            const popupModule = await import('/scripts/popup.js');
            callGenericPopup = popupModule.callGenericPopup;
            POPUP_TYPE = popupModule.POPUP_TYPE;
            POPUP_RESULT = popupModule.POPUP_RESULT;
            console.log(`[${EXTENSION_NAME}] 弹窗模块导入成功:`, {
                callGenericPopup: typeof callGenericPopup,
                POPUP_TYPE: typeof POPUP_TYPE,
                POPUP_RESULT: typeof POPUP_RESULT
            });

            // 导入扩展模块
            console.log(`[${EXTENSION_NAME}] 导入扩展模块: /scripts/extensions.js`);
            const extensionsModule = await import('/scripts/extensions.js');
            getContext = extensionsModule.getContext;
            writeExtensionField = extensionsModule.writeExtensionField;
            extension_settings = extensionsModule.extension_settings; // 导入设置对象
            saveMetadataDebounced = extensionsModule.saveMetadataDebounced; // 元数据保存（本地变量）
            console.log(`[${EXTENSION_NAME}] 扩展模块导入成功:`, {
                getContext: typeof getContext,
                writeExtensionField: typeof writeExtensionField,
                extension_settings: typeof extension_settings
            });

            // 导入主脚本模块
            console.log(`[${EXTENSION_NAME}] 导入主脚本模块: /script.js`);
            const scriptModule = await import('/script.js');
            characters = scriptModule.characters;
            this_chid = scriptModule.this_chid;
            reloadCurrentChat = scriptModule.reloadCurrentChat;
            getCurrentChatId = scriptModule.getCurrentChatId;
            saveSettingsDebounced = scriptModule.saveSettingsDebounced; // 导入设置保存函数
            chat_metadata = scriptModule.chat_metadata; // 导入聊天元数据（本地变量底层存储）
            eventSource = scriptModule.eventSource; // 导入事件源
            event_types = scriptModule.event_types; // 导入事件类型
            console.log(`[${EXTENSION_NAME}] 主脚本模块导入成功:`, {
                characters: typeof characters,
                this_chid: typeof this_chid,
                reloadCurrentChat: typeof reloadCurrentChat,
                getCurrentChatId: typeof getCurrentChatId,
                saveSettingsDebounced: typeof saveSettingsDebounced,
                eventSource: typeof eventSource,
                event_types: typeof event_types
            });

            // 导入工具模块
            console.log(`[${EXTENSION_NAME}] 导入工具模块: /scripts/utils.js`);
            const utilsModule = await import('/scripts/utils.js');
            uuidv4 = utilsModule.uuidv4;
            console.log(`[${EXTENSION_NAME}] 工具模块导入成功:`, {
                uuidv4: typeof uuidv4
            });

            // toastr应该是全局可用的
            console.log(`[${EXTENSION_NAME}] 检查全局 toastr`);
            toastr = window.toastr;
            console.log(`[${EXTENSION_NAME}] toastr 可用性:`, typeof toastr);

            // 导入变量操作（与项目宏一致）
            try {
                console.log(`[${EXTENSION_NAME}] 导入变量模块: /scripts/variables.js`);
                const variablesModule = await import('/scripts/variables.js');
                getLocalVariable = variablesModule.getLocalVariable;
                setLocalVariable = variablesModule.setLocalVariable;
                getGlobalVariable = variablesModule.getGlobalVariable;
                setGlobalVariable = variablesModule.setGlobalVariable;
                console.log(`[${EXTENSION_NAME}] 变量模块导入成功:`, {
                    getLocalVariable: typeof getLocalVariable,
                    setLocalVariable: typeof setLocalVariable,
                    getGlobalVariable: typeof getGlobalVariable,
                    setGlobalVariable: typeof setGlobalVariable,
                });
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 变量模块导入失败，将在使用时回退检查:`, error);
            }

            // 导入正则扩展模块（用于刷新功能）
            console.log(`[${EXTENSION_NAME}] 导入正则扩展模块: /scripts/extensions/regex/index.js`);
            try {
                const regexModule = await import('/scripts/extensions/regex/index.js');
                loadRegexScripts = regexModule.default?.loadRegexScripts || window.loadRegexScripts;
                console.log(`[${EXTENSION_NAME}] 正则扩展模块导入:`, {
                    loadRegexScripts: typeof loadRegexScripts
                });
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 正则扩展模块导入失败，尝试从全局获取:`, error);
                loadRegexScripts = window.loadRegexScripts;
                console.log(`[${EXTENSION_NAME}] 从全局获取 loadRegexScripts:`, typeof loadRegexScripts);
            }

            console.log(`[${EXTENSION_NAME}] 所有SillyTavern模块导入成功`);
            return true;

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 模块导入失败:`, error);
            console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);
            return false;
        }
    }

    /**
     * 加载扩展设置
     */
    function loadSettings() {
        // 使用导入的extension_settings对象
        if (!extension_settings) {
            console.error(`[${EXTENSION_NAME}] extension_settings 未导入`);
            return;
        }

        // 初始化扩展设置（如果不存在）
        if (!extension_settings[EXTENSION_NAME]) {
            extension_settings[EXTENSION_NAME] = {
                // 原有设置
                enabled: true,
                showPreview: true,
                autoValidate: true,
                rememberLastValues: true,
                lastRegexPattern: '',
                lastReplacement: '',
                lastFlags: 'g',
                // AI功能设置
                aiEnabled: true,
                aiProvider: 'gemini',
                geminiApiKey: '',
                customApiUrl: '',
                customApiKey: '',
                defaultModel: 'gemini-2.5-pro',
                customModel: '',
                // 对话历史设置
                enableConversationHistory: true,
                maxHistorySize: 50,
                // 变量管理设置
                variables: {} // 变量数据存储
            };
            console.log(`[${EXTENSION_NAME}] 初始化 extension_settings[${EXTENSION_NAME}] 对象`);
        }

        // 更新本地设置缓存
        Object.assign(extensionSettings, extension_settings[EXTENSION_NAME]);

        // 尝试从浏览器存储加载API配置
        const hasBrowserConfig = loadAPIConfigFromBrowser();
        if (hasBrowserConfig) {
            console.log(`[${EXTENSION_NAME}] API配置已从浏览器存储恢复`);
        }

        console.log(`[${EXTENSION_NAME}] 设置已加载:`, extensionSettings);
    }

    /**
     * 保存扩展设置
     */
    function saveSettings() {
        if (!extension_settings) {
            console.error(`[${EXTENSION_NAME}] extension_settings 未导入`);
            return;
        }

        // 更新扩展设置
        Object.assign(extension_settings[EXTENSION_NAME], extensionSettings);

        // 使用SillyTavern的设置保存机制
        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        }

        console.log(`[${EXTENSION_NAME}] 设置已保存`);
    }

    /**
     * 获取当前选择的角色信息（增强版本，支持多种获取方式）
     */
    function getCurrentCharacterInfo() {
        try {
            console.log(`[${EXTENSION_NAME}] 开始获取角色信息`);
            
            // 方法1：优先使用 context 获取（最实时的方式）
            if (typeof getContext === 'function') {
                const context = getContext();
                console.log(`[${EXTENSION_NAME}] context 获取结果:`, {
                    characterId: context?.characterId,
                    name2: context?.name2,
                    mainApi: context?.mainApi
                });
                
                if (context && context.characterId !== undefined && context.characterId !== null) {
                    const charId = parseInt(context.characterId);
                    console.log(`[${EXTENSION_NAME}] 从context获取到characterId:`, charId);
                    
                    // 检查字符数组
                    if (characters && Array.isArray(characters) && characters[charId]) {
                        const character = characters[charId];
                        console.log(`[${EXTENSION_NAME}] ✅ 通过 context.characterId 获取角色成功:`, character.name);
                        return {
                            id: charId,
                            name: character.name || '未知角色',
                            avatar: character.avatar || '',
                            description: character.description || ''
                        };
                    } else {
                        console.warn(`[${EXTENSION_NAME}] characters[${charId}] 不存在，characters长度:`, characters?.length);
                    }
                }
                
                // 尝试通过 name2 查找角色
                if (context && context.name2) {
                    console.log(`[${EXTENSION_NAME}] 尝试通过name2查找角色:`, context.name2);
                    if (characters && Array.isArray(characters)) {
                        for (let i = 0; i < characters.length; i++) {
                            if (characters[i] && characters[i].name === context.name2) {
                                console.log(`[${EXTENSION_NAME}] ✅ 通过name2匹配找到角色:`, characters[i].name);
                                return {
                                    id: i,
                                    name: characters[i].name || '未知角色',
                                    avatar: characters[i].avatar || '',
                                    description: characters[i].description || ''
                                };
                            }
                        }
                        console.warn(`[${EXTENSION_NAME}] 未找到匹配name2的角色:`, context.name2);
                    }
                }
            }
            
            // 方法2：备用 this_chid
            console.log(`[${EXTENSION_NAME}] 备用方案 - this_chid 值:`, this_chid);
            console.log(`[${EXTENSION_NAME}] characters 数组长度:`, characters?.length);
            
            if (this_chid !== undefined && this_chid !== null && 
                characters && Array.isArray(characters) && characters[this_chid]) {
                const character = characters[this_chid];
                console.log(`[${EXTENSION_NAME}] ✅ 通过 this_chid 获取角色成功:`, character.name);
                return {
                    id: this_chid,
                    name: character.name || '未知角色',
                    avatar: character.avatar || '',
                    description: character.description || ''
                };
            }
            
            // 方法3：最后尝试获取第一个可用角色
            if (characters && Array.isArray(characters) && characters.length > 0) {
                for (let i = 0; i < characters.length; i++) {
                    if (characters[i] && characters[i].name) {
                        console.log(`[${EXTENSION_NAME}] ⚠️ 使用第一个可用角色作为备用:`, characters[i].name);
                        return {
                            id: i,
                            name: characters[i].name || '未知角色',
                            avatar: characters[i].avatar || '',
                            description: characters[i].description || ''
                        };
                    }
                }
            }
            
            console.error(`[${EXTENSION_NAME}] ❌ 所有方法都无法获取角色信息`);
            return null;
            
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取角色信息时出错:`, error);
            return null;
        }
    }

    /**
     * 验证正则表达式（支持多行）
     */
    function validateRegex(pattern, flags = 'g') {
        try {
            // 对于多行正则表达式，我们只做基本的语法检查，不实际创建RegExp对象
            // 因为某些多行正则可能需要特殊处理
            if (!pattern) {
                return { isValid: false, error: '正则表达式不能为空' };
            }

            // 如果包含换行符，我们跳过RegExp验证，只检查基本语法
            if (pattern.includes('\n')) {
                console.log(`[${EXTENSION_NAME}] 多行正则表达式，跳过RegExp验证`);
                return { isValid: true, error: null };
            }

            // 单行正则表达式使用标准验证
            new RegExp(pattern, flags);
            return { isValid: true, error: null };
        } catch (error) {
            return { isValid: false, error: error.message };
        }
    }

    /**
     * 测试正则表达式匹配
     */
    function testRegexMatch(pattern, flags, testText, replacement = '') {
        try {
            const regex = new RegExp(pattern, flags);
            const matches = Array.from(testText.matchAll(regex));
            let result = testText;

            if (replacement && matches.length > 0) {
                result = testText.replace(regex, replacement);
            }

            return {
                success: true,
                matchCount: matches.length,
                matches: matches.slice(0, 10), // 限制显示前10个匹配
                result: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                matchCount: 0,
                matches: [],
                result: testText
            };
        }
    }

    /**
     * 创建正则脚本对象
     */
    function createRegexScript(scriptName, findRegex, replaceWith) {
        // 完全保持用户输入的原始内容，不做任何处理或转换

        console.log(`[${EXTENSION_NAME}] 创建正则脚本对象 - 用户原始输入:`, {
            scriptName: `"${scriptName}"`,
            findRegex: `"${findRegex}"`,
            replaceWith: `"${replaceWith}"`,
            findRegexLength: findRegex?.length,
            replaceWithLength: replaceWith?.length,
            findRegexHasNewlines: findRegex?.includes('\n'),
            replaceWithHasNewlines: replaceWith?.includes('\n'),
            findRegexCharCodes: findRegex?.split('').slice(0, 20).map((c, i) => `${i}:${c.charCodeAt(0)}`),
            replaceWithCharCodes: replaceWith?.split('').slice(0, 20).map((c, i) => `${i}:${c.charCodeAt(0)}`)
        });

        const script = {
            id: uuidv4(),
            scriptName: scriptName,
            findRegex: findRegex, // 用户输入什么就保存什么，完全不修改
            replaceString: replaceWith, // 用户输入什么就保存什么，完全不修改
            trimStrings: [],
            placement: [1, 2], // 影响用户输入和AI输出
            disabled: false,
            markdownOnly: true, // 启用紧格式显示
            promptOnly: false,
            runOnEdit: false,
            substituteRegex: 0,
            minDepth: null,
            maxDepth: null
        };

        console.log(`[${EXTENSION_NAME}] 最终创建的正则脚本对象:`, script);
        return script;
    }

    /**
     * 保存正则脚本到当前角色
     */
    async function saveRegexScriptToCharacter(regexScript) {
        console.log(`[${EXTENSION_NAME}] saveRegexScriptToCharacter 开始执行`);
        console.log(`[${EXTENSION_NAME}] 输入的regexScript:`, regexScript);

        try {
            // 1. 验证角色信息
            console.log(`[${EXTENSION_NAME}] 验证角色信息`);
            const characterInfo = getCurrentCharacterInfo();
            if (!characterInfo) {
                throw new Error('未选择角色或角色无效');
            }
            console.log(`[${EXTENSION_NAME}] 角色验证通过:`, characterInfo);

            // 2. 获取角色对象
            console.log(`[${EXTENSION_NAME}] 获取角色对象 characters[${characterInfo.id}]`);
            const character = characters[characterInfo.id];
            console.log(`[${EXTENSION_NAME}] 角色对象:`, character ? '存在' : '不存在');

            // 3. 初始化数据结构
            console.log(`[${EXTENSION_NAME}] 初始化角色数据结构`);
            if (!character.data) {
                character.data = {};
                console.log(`[${EXTENSION_NAME}] 创建 character.data`);
            }
            if (!character.data.extensions) {
                character.data.extensions = {};
                console.log(`[${EXTENSION_NAME}] 创建 character.data.extensions`);
            }
            if (!character.data.extensions.regex_scripts) {
                character.data.extensions.regex_scripts = [];
                console.log(`[${EXTENSION_NAME}] 创建 character.data.extensions.regex_scripts`);
            }

            const regexScripts = character.data.extensions.regex_scripts;
            console.log(`[${EXTENSION_NAME}] 当前正则脚本数组:`, regexScripts);

            // 4. 检查重复脚本
            console.log(`[${EXTENSION_NAME}] 检查是否存在同名脚本: "${regexScript.scriptName}"`);
            const existingIndex = regexScripts.findIndex(script => script.scriptName === regexScript.scriptName);
            console.log(`[${EXTENSION_NAME}] 同名脚本索引:`, existingIndex);

            if (existingIndex !== -1) {
                console.log(`[${EXTENSION_NAME}] 更新现有脚本`);
                regexScripts[existingIndex] = regexScript;
            } else {
                console.log(`[${EXTENSION_NAME}] 添加新脚本`);
                regexScripts.push(regexScript);
            }
            console.log(`[${EXTENSION_NAME}] 更新后的脚本数组:`, regexScripts);

            // 5. 检查writeExtensionField函数
            console.log(`[${EXTENSION_NAME}] 检查writeExtensionField函数:`, typeof writeExtensionField);
            if (typeof writeExtensionField !== 'function') {
                throw new Error('writeExtensionField 函数不可用');
            }

            // 6. 写入扩展字段
            console.log(`[${EXTENSION_NAME}] 调用 writeExtensionField(${characterInfo.id}, 'regex_scripts', regexScripts)`);
            await writeExtensionField(characterInfo.id, 'regex_scripts', regexScripts);
            console.log(`[${EXTENSION_NAME}] writeExtensionField 调用完成`);

            // 7. 更新允许列表
            console.log(`[${EXTENSION_NAME}] 更新角色允许列表`);

            // 确保全局扩展设置对象存在
            if (!window.extension_settings) {
                window.extension_settings = {};
                console.log(`[${EXTENSION_NAME}] 创建 window.extension_settings 对象`);
            }

            if (!window.extension_settings.character_allowed_regex) {
                window.extension_settings.character_allowed_regex = [];
                console.log(`[${EXTENSION_NAME}] 创建 character_allowed_regex 数组`);
            }

            if (!window.extension_settings.character_allowed_regex.includes(character.avatar)) {
                window.extension_settings.character_allowed_regex.push(character.avatar);
                console.log(`[${EXTENSION_NAME}] 角色 ${character.avatar} 已添加到允许列表`);
            } else {
                console.log(`[${EXTENSION_NAME}] 角色 ${character.avatar} 已在允许列表中`);
            }

            console.log(`[${EXTENSION_NAME}] 正则脚本已保存到角色: ${characterInfo.name}`);

            // 8. 触发UI刷新 - 关键修复：调用SillyTavern的刷新函数
            console.log(`[${EXTENSION_NAME}] 开始刷新正则脚本UI`);
            try {
                // 刷新正则脚本列表UI
                if (typeof loadRegexScripts === 'function') {
                    await loadRegexScripts();
                    console.log(`[${EXTENSION_NAME}] 正则脚本UI已刷新`);
                } else {
                    console.warn(`[${EXTENSION_NAME}] loadRegexScripts函数不可用，跳过UI刷新`);
                }

                // 重新加载当前聊天以应用正则变更
                if (typeof reloadCurrentChat === 'function' && typeof getCurrentChatId === 'function') {
                    const currentChatId = getCurrentChatId();
                    if (currentChatId !== undefined && currentChatId !== null) {
                        await reloadCurrentChat();
                        console.log(`[${EXTENSION_NAME}] 当前聊天已重新加载`);
                    } else {
                        console.log(`[${EXTENSION_NAME}] 没有当前聊天，跳过重新加载`);
                    }
                } else {
                    console.warn(`[${EXTENSION_NAME}] 聊天重载函数不可用，跳过聊天重载`);
                }
            } catch (refreshError) {
                console.error(`[${EXTENSION_NAME}] 刷新UI时出错:`, refreshError);
                console.error(`[${EXTENSION_NAME}] 刷新错误堆栈:`, refreshError.stack);
                // 不抛出错误，因为保存已经成功
            }

            return true;

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 保存正则脚本失败:`, error);
            console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);
            throw error;
        }
    }

    /**
     * 创建快速正则工具区域HTML内容
     */
    function createQuickRegexToolsContent(characterInfo) {
        console.log(`[${EXTENSION_NAME}] 创建快速正则工具内容`);
        const isMobile = isMobileDevice();
        console.log(`[${EXTENSION_NAME}] 设备类型: ${isMobile ? '移动设备' : '桌面设备'}`);
        
        const toolsContent = `
            <style>
                /* API配置区域响应式样式 */
                .quick-regex-container {
                    max-width: 100%;
                    overflow-x: auto;
                }
                
                .quick-regex-container .form-control {
                    width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    word-break: break-all;
                }
                
                .quick-regex-container input[type="text"],
                .quick-regex-container input[type="password"] {
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .quick-regex-container .form-group {
                    margin-bottom: 1rem;
                    width: 100%;
                }
                
                .quick-regex-container .api-config {
                    width: 100%;
                    max-width: 100%;
                }
                
                /* 移动设备优化 */
                @media screen and (max-width: 768px) {
                    .quick-regex-container .form-control {
                        font-size: 0.9rem;
                        padding: 0.6rem;
                    }
                    
                    .quick-regex-container .ai-generate-btn {
                        font-size: 0.85rem;
                        padding: 0.6rem 1rem;
                    }
                    
                    .quick-regex-container small {
                        font-size: 0.75rem;
                    }
                    
                    .quick-regex-container .page-tabs {
                        flex-wrap: wrap;
                        gap: 0.25rem;
                    }
                    
                    .quick-regex-container .tab-button {
                        flex: 1;
                        min-width: 120px;
                    }
                }
                
                /* 平板设备优化 */
                @media screen and (min-width: 769px) and (max-width: 1024px) {
                    .quick-regex-container .form-control {
                        font-size: 0.95rem;
                    }
                }
                
                /* 桌面设备优化 */
                @media screen and (min-width: 1025px) {
                    .quick-regex-container .form-group {
                        margin-bottom: 1.25rem;
                    }
                }
                
                /* URL输入框特殊处理 */
                #custom-api-url {
                    font-family: 'Courier New', monospace;
                    font-size: 0.85rem;
                    letter-spacing: -0.5px;
                }
                
                /* 确保按钮不会变形 */
                .quick-regex-container .ai-generate-btn {
                    white-space: nowrap;
                    min-height: 2.5rem;
                    width: 100%;
                    display: block;
                }
                
                /* 标签页响应式 */
                .quick-regex-container .page-tabs {
                    display: flex;
                    width: 100%;
                }
                
                /* 解决长URL显示问题 */
                .quick-regex-container .form-control[type="text"] {
                    direction: rtl;
                    text-align: left;
                }
                
                .quick-regex-container .form-control[type="text"]:focus {
                    direction: ltr;
                }
            </style>
            
            <div id="quick-regex-tools" class="quick-regex-container">
                <div class="quick-regex-header">
                    <h4>快速正则工具</h4>
                    ${characterInfo ? `
                        <div class="character-info">
                            <img src="/characters/${characterInfo.avatar}" alt="${characterInfo.name}" class="character-avatar">
                            <span class="character-name">当前角色: ${characterInfo.name}</span>
                        </div>
                    ` : '<div class="no-character">未选择角色</div>'}

                    <!-- 页面切换标签 -->
                    <div class="page-tabs">
                        <button id="tab-manual" class="tab-button active" data-page="manual"${isMobile ? ' data-mobile="true"' : ''}>
                            手动创建
                        </button>
                        <button id="tab-ai" class="tab-button" data-page="ai"${isMobile ? ' data-mobile="true"' : ''}>
                            AI生成
                        </button>
                        <button id="tab-variables" class="tab-button" data-page="variables"${isMobile ? ' data-mobile="true"' : ''}>
                            变量页面
                        </button>
                    </div>
                </div>

                <!-- 第一个页面：手动创建 -->
                <div id="page-manual" class="page-content active">
                    <div class="quick-regex-form">
                        <div class="form-group">
                            <label for="regex-script-name">脚本名称:</label>
                            <input type="text" id="regex-script-name" class="form-control"
                                   placeholder="例如: 移除多余空格" value="快速正则${Date.now()}">
                        </div>

                        <div class="form-group">
                            <label for="regex-pattern">查找内容 (正则表达式):</label>
                            <textarea id="regex-pattern" class="form-control" rows="4"
                                   placeholder="例如: \\s+&#10;支持多行正则表达式，所有字符会被原样保存">${extensionSettings.lastRegexPattern}</textarea>
                            <div id="regex-validation" class="validation-message"></div>
                        </div>

                        <div class="form-group">
                            <label for="regex-replacement">替换为:</label>
                            <textarea id="regex-replacement" class="form-control" rows="8"
                                      placeholder="例如: 空格 (留空表示删除匹配内容)&#10;支持多行文本，换行符会被完全保留">${extensionSettings.lastReplacement}</textarea>
                            <small style="color: var(--SmartThemeQuoteColor); font-size: 0.75rem;">
                                📋 提示：此处会完全保留您输入的格式，包括所有空格和换行符
                            </small>
                        </div>

                        <div class="form-group form-row">
                            <div class="form-col">
                                <label for="regex-flags">正则标志:</label>
                                <select id="regex-flags" class="form-control">
                                    <option value="g" ${extensionSettings.lastFlags === 'g' ? 'selected' : ''}>g (全局匹配)</option>
                                    <option value="gi" ${extensionSettings.lastFlags === 'gi' ? 'selected' : ''}>gi (全局+忽略大小写)</option>
                                    <option value="gm" ${extensionSettings.lastFlags === 'gm' ? 'selected' : ''}>gm (全局+多行)</option>
                                    <option value="gim" ${extensionSettings.lastFlags === 'gim' ? 'selected' : ''}>gim (全局+忽略大小写+多行)</option>
                                </select>
                            </div>
                            <div class="form-col">
                                <label for="regex-affects">影响范围:</label>
                                <select id="regex-affects" class="form-control">
                                    <option value="both" selected>用户输入和AI输出</option>
                                    <option value="user">仅用户输入</option>
                                    <option value="ai">仅AI输出</option>
                                    <option value="all">所有内容</option>
                                </select>
                            </div>
                        </div>

                        ${extensionSettings.showPreview ? `
                            <div class="form-group preview-section">
                                <label for="test-text">测试文本 (可选):</label>
                                <textarea id="test-text" class="form-control" rows="2"
                                          placeholder="输入一些文本来测试正则表达式效果..."></textarea>
                                <div id="preview-result" class="preview-result"></div>
                            </div>
                        ` : ''}

                        <div class="form-group">
                            <button id="insert-regex-btn" class="ai-apply-btn">
                                插入正则表达式
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 第二个页面：AI生成 -->
                <div id="page-ai" class="page-content" style="display: none;">
                    <div class="ai-config-form">
                        <!-- API配置 -->
                        <div class="form-group">
                            <label for="ai-provider">API提供商:</label>
                            <select id="ai-provider" class="form-control">
                                <option value="gemini" ${extensionSettings.aiProvider === 'gemini' ? 'selected' : ''}>Gemini (Google)</option>
                                <option value="custom" ${extensionSettings.aiProvider === 'custom' ? 'selected' : ''}>自定义端点</option>
                            </select>
                        </div>

                        <!-- Gemini配置 -->
                        <div id="gemini-config" class="api-config" ${extensionSettings.aiProvider !== 'gemini' ? 'style="display: none;"' : ''}>
                            <div class="form-group">
                                <label for="gemini-api-key">Gemini API Key:</label>
                                <input type="password" id="gemini-api-key" class="form-control"
                                       placeholder="输入你的Gemini API密钥" value="${extensionSettings.geminiApiKey}">
                            </div>
                            <div class="form-group">
                                <label for="gemini-model-section">模型:</label>
                                <input type="hidden" id="gemini-model" value="${extensionSettings.defaultModel}">
                                <button type="button" id="fetch-gemini-models" class="ai-generate-btn" style="width: 100%; padding: 0.5rem 0.75rem;">
                                    获取Gemini模型列表
                                </button>
                            </div>
                        </div>

                        <!-- 自定义API配置 -->
                        <div id="custom-config" class="api-config" ${extensionSettings.aiProvider !== 'custom' ? 'style="display: none;"' : ''}>
                            <div class="form-group">
                                <label for="custom-api-url">API 基础URL:</label>
                                <input type="text" id="custom-api-url" class="form-control"
                                       placeholder="https://api.example.com/v1" value="${extensionSettings.customApiUrl}">
                                <small style="color: var(--SmartThemeQuoteColor); font-size: 0.75rem;">
                                    💡 提示：只需填写到 /v1 即可，系统会自动拼接 /chat/completions 和 /models 端点
                                </small>
                            </div>
                            <div class="form-group">
                                <label for="custom-api-key">API Key:</label>
                                <input type="password" id="custom-api-key" class="form-control"
                                       placeholder="输入你的API密钥" value="${extensionSettings.customApiKey}">
                            </div>
                            <div class="form-group">
                                <label for="custom-model-section">模型:</label>
                                <input type="hidden" id="custom-model" value="${extensionSettings.customModel}">
                                <button type="button" id="fetch-custom-models" class="ai-generate-btn" style="width: 100%; padding: 0.5rem 0.75rem;">
                                    获取模型列表
                                </button>
                            </div>
                        </div>

                        <!-- 自动保存指示器 -->
                        <div class="form-group">
                            <span id="api-save-indicator" class="save-indicator" style="display: none;">✓ 已保存</span>
                        </div>

                        <!-- AI提示输入 -->
                        <div class="form-group">
                            <label for="ai-prompt">描述你想要的正则功能:</label>
                            <textarea id="ai-prompt" class="form-control" rows="3"
                                      placeholder="例如: 帮我制定一个角色状态栏，在对话开头显示角色的当前状态">${conversationHistory.getLatestUserInput()}</textarea>
                            <small style="color: var(--SmartThemeQuoteColor); font-size: 0.75rem;">
                                💡 提示：输入框已自动填入上次的对话内容，支持多轮对话
                            </small>
                        </div>

                        <!-- 对话历史管理 -->
                        <div class="form-group">
                            <div class="conversation-history-controls">
                                <button id="view-conversation-history" class="ai-history-btn" type="button">
                                    查看对话历史
                                </button>
                                <button id="clear-conversation-history" class="ai-clear-btn" type="button">
                                    清空历史
                                </button>
                                <span class="history-count">历史对话: ${conversationHistory.getHistory().length}条</span>
                            </div>
                        </div>

                        <!-- 生成按钮 -->
                        <div class="form-group">
                            <button id="generate-regex" class="ai-generate-btn">
                                生成正则表达式
                            </button>
                        </div>

                        <!-- AI生成结果展示 -->
                        <div class="ai-result-section" style="display: none;">
                            <div class="form-group">
                                <label for="ai-generated-pattern">AI生成的正则表达式:</label>
                                <textarea id="ai-generated-pattern" class="form-control" rows="4" readonly></textarea>
                            </div>

                            <div class="form-group">
                                <label for="ai-generated-replacement">AI生成的替换内容:</label>
                                <textarea id="ai-generated-replacement" class="form-control" rows="6" readonly></textarea>
                            </div>

                            <!-- 正文使用区域 -->
                            <div class="form-group">
                                <label for="demo-text">正文使用区域 (效果演示):</label>
                                <textarea id="demo-text" class="form-control" rows="8"
                                          placeholder="在这里输入示例正文，查看正则表达式的实际应用效果...">这是一段示例对话正文。

用户：今天感觉怎么样？

AI：我今天心情不错，准备和朋友一起出去逛街。你有什么计划吗？</textarea>
                                <small style="color: var(--SmartThemeQuoteColor); font-size: 0.75rem;">
                                    💡 在上方输入正文内容，点击"预览效果"查看正则表达式应用后的结果
                                </small>
                            </div>

                            <div class="form-group">
                                <button id="preview-ai-result" class="ai-preview-btn">
                                    预览应用效果
                                </button>
                            </div>

                            <div class="form-group">
                                <label for="demo-result">应用效果预览:</label>
                                <textarea id="demo-result" class="form-control" rows="10" readonly
                                          placeholder="应用正则表达式后的结果将显示在这里..."></textarea>
                            </div>

                            <div class="form-group">
                                <button id="apply-ai-result" class="ai-apply-btn">
                                    应用到手动创建页面
                                </button>
                            </div>
                        </div>

                        <!-- AI响应原文 -->
                        <div class="form-group">
                            <label for="ai-raw-response">AI原始回复:</label>
                            <textarea id="ai-raw-response" class="form-control" rows="6" readonly
                                      placeholder="AI的完整回复将显示在这里..."></textarea>
                        </div>
                    </div>
                </div>

                <!-- 第三个页面：变量页面 -->
                <div id="page-variables" class="page-content" style="display: none;">
                    <div class="variables-simple-container">
                        <!-- 会话信息显示 -->
                        <div class="form-group">
                            <div class="session-info-display">
                                <div class="session-item">
                                    <span class="session-label">当前会话ID:</span>
                                    <span class="session-value" id="current-session-id">未获取到会话ID</span>
                                </div>
                                <div class="session-item">
                                    <span class="session-label">变量数量:</span>
                                    <span class="session-value" id="variables-count">0</span>
                                </div>
                            </div>
                        </div>

                        <!-- 添加新变量区域 -->
                        <div class="add-variable-section">
                            <h4>添加新变量</h4>
                            <div class="form-row">
                                <div class="form-col">
                                    <label for="variable-name">变量名:</label>
                                    <input type="text" id="variable-name" class="form-control" 
                                           placeholder="例如: 角色状态">
                                </div>
                                <div class="form-col">
                                    <label for="variable-value">变量值:</label>
                                    <input type="text" id="variable-value" class="form-control" 
                                           placeholder="例如: 健康">
                                </div>
                                <div class="form-col">
                                    <label for="variable-type">变量类型:</label>
                                    <select id="variable-type" class="form-control">
                                        <option value="plugin">插件变量（含描述，嵌套JSON）</option>
                                        <option value="generic">通用变量（宏可用）</option>
                                        <option value="both">同时创建（插件+通用）</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="variable-description">变量作用:</label>
                                <textarea id="variable-description" class="form-control" rows="2" 
                                          placeholder="描述此变量的用途和作用..."></textarea>
                            </div>
                            <div class="form-group">
                                <button id="add-variable-btn" class="ai-generate-btn">
                                    添加变量
                                </button>
                            </div>
                        </div>

                        <!-- 变量管理区域 -->
                        <div class="variables-management-section">
                            <h4>变量管理</h4>
                            <div class="management-controls">
                                <button id="view-variables-btn" class="ai-apply-btn">
                                    查看变量
                                </button>
                                <div class="batch-controls">
                                    <button id="export-variables-btn" class="ai-preview-btn">
                                        导出变量
                                    </button>
                                    <button id="import-variables-btn" class="ai-preview-btn">
                                        导入变量
                                    </button>
                                    <input type="file" id="import-file-input" accept=".json" style="display: none;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="quick-regex-footer">
                    <div class="status-message" id="status-message"></div>
                </div>
            </div>
            
            <!-- 变量编辑器全屏覆盖层 -->
            <div id="variables-editor-overlay" class="variables-editor-overlay">
                <div class="variables-editor-container">
                    <div class="variables-editor-header">
                        <h3 class="variables-editor-title">变量编辑器</h3>
                        <div class="variables-editor-controls">
                            <button id="editor-refresh-btn" class="editor-control-btn">刷新</button>
                            <button id="editor-clear-all-btn" class="editor-control-btn">清空所有</button>
                            <button id="editor-close-btn" class="editor-control-btn editor-close-btn">关闭</button>
                        </div>
                    </div>
                    <div class="variables-editor-content">
                        <div class="variables-editor-search">
                            <input type="text" id="variables-search-input" class="variables-search-input" placeholder="搜索变量名/值/描述...">
                            <select id="variables-type-filter" class="variables-type-filter">
                                <option value="all">全部</option>
                                <option value="plugin">插件变量</option>
                                <option value="generic">通用变量</option>
                            </select>
                            <span class="search-count" id="editor-search-count">共 0 个变量</span>
                        </div>
                        <div id="variables-editor-table-container">
                            <!-- 变量表格将动态插入此处 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        console.log(`[${EXTENSION_NAME}] 快速正则工具内容创建完成，总长度: ${toolsContent.length}`);
        
        return toolsContent;
    }

    /**
     * 更新验证状态
     */
    function updateValidation(pattern, flags) {
        const validation = validateRegex(pattern, flags);
        const validationElement = document.getElementById('regex-validation');

        if (!validationElement) return validation;

        if (validation.isValid) {
            validationElement.innerHTML = '<span class="validation-success">✓ 正则表达式有效</span>';
            validationElement.className = 'validation-message success';
        } else {
            validationElement.innerHTML = `<span class="validation-error">✗ ${validation.error}</span>`;
            validationElement.className = 'validation-message error';
        }

        return validation;
    }

    /**
     * 更新预览结果
     */
    function updatePreview() {
        if (!extensionSettings.showPreview) return;

        const pattern = document.getElementById('regex-pattern')?.value || '';
        const flags = document.getElementById('regex-flags')?.value || 'g';
        const replacement = document.getElementById('regex-replacement')?.value || '';
        const testText = document.getElementById('test-text')?.value || '';
        const previewElement = document.getElementById('preview-result');

        if (!previewElement || !pattern || !testText) {
            if (previewElement) previewElement.innerHTML = '';
            return;
        }

        const testResult = testRegexMatch(pattern, flags, testText, replacement);

        if (testResult.success) {
            previewElement.innerHTML = `
                <div class="preview-success">
                    <strong>匹配结果:</strong> 找到 ${testResult.matchCount} 个匹配<br>
                    <strong>替换后:</strong><br>
                    <div class="preview-text">${testResult.result.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        } else {
            previewElement.innerHTML = `
                <div class="preview-error">
                    <strong>测试失败:</strong> ${testResult.error}
                </div>
            `;
        }
    }

    /**
     * 显示状态消息
     */
    function showStatus(message, isError = false) {
        const statusElement = document.getElementById('status-message');
        if (statusElement) {
            statusElement.innerHTML = message;
            statusElement.className = `status-message ${isError ? 'error' : 'success'}`;

            // 3秒后清除消息
            setTimeout(() => {
                if (statusElement) {
                    statusElement.innerHTML = '';
                    statusElement.className = 'status-message';
                }
            }, 3000);
        }
    }

    /**
     * 调用Gemini API (支持对话历史)
     */
    async function callGeminiAPI(prompt, apiKey, model) {
        console.log(`[${EXTENSION_NAME}] 调用Gemini API开始`);

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 构建系统提示词
        const systemPrompt = `你是一个专业的正则表达式专家，专门为角色扮演游戏创建状态栏文本处理规则。请根据用户的需求生成合适的正则表达式和替换内容。

🔥🔥🔥 强制性格式要求 - <state_bar> 标签必须包裹：
- 你生成的示例正文内容中，状态栏部分必须被 <state_bar></state_bar> 标签完整包裹
- 正则表达式必须匹配包含 <state_bar> 标签在内的完整结构
- 这是绝对不可违反的核心要求，任何情况下都不能遗漏

🔥 关键要求 - 标签一致性检查：
- 正则表达式中使用的标签名必须与示例正文内容中的标签名完全一致
- 生成完成后必须自我检查：每个捕获组的标签名是否在示例正文中都能找到对应的标签
- 如果发现不一致，必须修正其中一个使其保持一致
- 禁止使用不存在于示例正文中的标签名

强制性<state_bar>格式示例：
✅ 正确格式（必须这样）：
示例正文：
<state_bar>
<生命值>85/100</生命值>
<魔法值>42/60</魔法值>
<金钱>1250G</金钱>
</state_bar>
这是角色的对话内容...

❌ 错误格式（绝对禁止）：
示例正文：
<生命值>85/100</生命值>
<魔法值>42/60</魔法值>
<金钱>1250G</金钱>
这是角色的对话内容...

标签一致性验证示例：
❌ 错误示例：
   示例正文：<剩余资源>箭矢: 35/50</剩余资源>
   正则表达式：<剩余弹药>([^<]+)</剩余弹药>  ← 标签名不一致！

✅ 正确示例：
   示例正文：<剩余资源>箭矢: 35/50</剩余资源>
   正则表达式：<剩余资源>([^<]+)</剩余资源>  ← 标签名完全一致！

重要要求：
1. 你的回复必须严格按照以下格式，分为四个明确的部分：
   === 正则表达式 ===
   [在这里写正则表达式，使用捕获组()]

   === 状态栏XML格式 ===
   [在这里写原始状态栏XML结构，包含模板变量]

   === 示例正文内容 ===
   [在这里写包含状态栏的完整示例文本，供用户测试使用]

   === HTML美化内容 ===
   [在这里写美化后的HTML页面内容，使用$1,$2,$3等宏引用捕获组]

2. 禁止在每个部分使用代码块标记（如反引号代码块标记）
3. 禁止添加任何解释、说明、注释或额外的文字
4. 每个部分只包含纯粹的内容，不要包含任何描述性文字
5. 回复结束后不要添加任何说明文字或解释

关键规则 - 正则表达式：
- 正则表达式必须使用捕获组()来捕获需要提取的内容
- 每个捕获组对应一个数据片段，按照在HTML中使用的顺序排列
- 🔥 最重要：正则表达式中的每个标签名必须与示例正文内容中的标签名完全一致
- 🔥 正则表达式必须匹配包含<state_bar>标签的完整结构
- 例如：如果要匹配<state_bar><时间>09:00</时间><日期>2025-05-20</日期></state_bar>
- 正则应该写成：<state_bar>\\s*<时间>([^<]+)</时间>\\s*<日期>([^<]+)</日期>\\s*</state_bar>
- 这样$1就是时间值，$2就是日期值

关键规则 - 示例正文内容：
- 🔥🔥🔥 示例正文内容中的状态栏部分必须完整地被 <state_bar></state_bar> 标签包裹
- 🔥 示例正文内容中使用的所有标签名，必须与正则表达式中的标签名完全一致
- 所有数据值应该是合理的示例数据，便于用户测试
- 示例格式必须为：<state_bar>[状态栏内容]</state_bar>[其他正文内容]

关键规则 - HTML美化内容：
- HTML美化内容必须是纯净的HTML代码，不能包含任何解释文字或额外内容
- HTML美化内容必须以<!DOCTYPE html>开头，包含完整的html、head、body结构
- HTML美化内容必须使用$1,$2,$3等宏来引用正则表达式的捕获组
- 例如：如果正则有3个捕获组，HTML中就使用$1,$2,$3来引用对应的内容
- 绝对禁止在HTML美化内容中使用具体的数值，必须使用宏引用
- 禁止在HTML美化内容部分添加任何说明文字、注释或解释

标签一致性工作流程：
1. 首先确定需要的状态栏字段（如：生命值、魔法值、金钱等）
2. 为每个字段确定统一的标签名（如：<生命值>、<魔法值>、<金钱>）
3. 在示例正文内容中使用<state_bar>包裹这些确定的标签名
4. 在正则表达式中使用完全相同的标签名进行匹配（包括<state_bar>标签）
5. 在HTML美化内容中使用对应的$1,$2,$3等宏引用

宏引用示例（带state_bar标签）：
- 正则：<state_bar>\\s*<时间>([^<]+)</时间>\\s*<日期>([^<]+)</日期>\\s*<想法>([^<]+)</想法>\\s*</state_bar>
- 示例正文：<state_bar><时间>15:30</时间><日期>2025-01-15</日期><想法>今天天气真好</想法></state_bar>角色对话内容
- HTML中使用：<div class="time">$1</div><div class="date">$2</div><div class="thought">$3</div>

核心原则：
- 专门处理 <state_bar> 标签内容，或在没有状态栏时插入新的状态栏
- 根据用户需求生成对应的状态栏格式和内容
- 保持正文内容完全不变，只操作状态栏部分
- 🔥 确保正则表达式、示例正文、HTML美化内容三者之间的标签名完全一致
- 🔥🔥🔥 状态栏必须被<state_bar></state_bar>标签完整包裹

状态栏处理模式：
1. 替换现有状态栏：
   正则表达式：<state_bar>.*?</state_bar>

2. 如果没有状态栏则插入：
   正则表达式：^(?!.*<state_bar>)(.*)$
   HTML内容：<state_bar>[美化的HTML状态栏内容]</state_bar>\\n$1

3. 更新状态栏中的特定元素：
   正则表达式：<state_bar>\\s*<特定标签>.*?</特定标签>\\s*</state_bar>

用户需求示例理解：
如果用户说"帮我制定一个角色状态栏，显示角色的想法、衣着、身体状态和好感度"，

你应该生成：
1. 正则表达式（使用捕获组匹配各个标签的内容，包含<state_bar>标签）
2. XML格式如：
<state_bar>
<想法>{{江念雪当前内心的真实想法，20字以内概述，禁止上帝视角，禁止显示其他人的想法，无法获取应该显示为'暂无'}}</想法>
<衣着>{{江念雪当前衣着，20字以内概述}}</衣着>
<双乳状态>{{江念雪当前双乳的状态，20字以内概述}}</双乳状态>
<小穴状态>{{江念雪当前阴道的状态，20字以内概述}}</小穴状态>
<子宫状态>{{江念雪当前子宫内部的状态，20字以内概述}}</子宫状态>
<后穴状态>{{江念雪当前后穴（肛门）的状态，20字以内概述}}</后穴状态>
<好感度>{{江念雪.好感度：显示江念雪当前对<user>的好感度，仅显示阶段名+数值+数值变化，例如：师道尊严 (1/100) [+1]}}</好感度>
</state_bar>

3. 示例正文内容，包含被<state_bar></state_bar>包裹的真实数据完整示例
4. 完整的美化HTML页面，使用$1,$2,$3等宏引用捕获组的内容，不使用任何具体数值

注意事项：
- 状态栏内容应该使用模板变量格式，如 {{角色名.属性}}
- 时间相关建议使用固定格式标签：<时间>、<日期>、<星期>
- 选项建议使用：<Options_1>、<Options_2> 等格式
- HTML美化内容要是完整的HTML页面，包含样式和交互
- 根据用户的具体需求调整标签名称和数量
- 确保生成的内容符合用户的具体要求
- 🔥🔥🔥 最重要：状态栏必须被<state_bar></state_bar>标签完整包裹，正则表达式和HTML替换内容必须配套，捕获组数量要匹配，标签名必须一致`;

        // 构建对话历史上下文
        const historyMessages = conversationHistory.buildConversationContext(prompt, 'gemini');
        console.log(`[${EXTENSION_NAME}] 历史对话数量: ${historyMessages.length / 2}`);

        // 构建完整的对话内容 - Gemini格式
        const contents = [];

        // 添加系统提示作为第一条用户消息
        contents.push({
            role: "user",
            parts: [{ text: systemPrompt }]
        });

        // 添加一个模型回复表示理解系统提示
        contents.push({
            role: "model",
            parts: [{ text: "我理解了，我是一个专业的正则表达式专家，会按照您的要求生成状态栏处理规则。" }]
        });

        // 添加历史对话 - 已经是正确的Gemini格式
        for (const msg of historyMessages) {
            contents.push({
                role: msg.role, // 已经是 'user' 或 'model'
                parts: [{ text: msg.content }]
            });
        }

        // 添加当前用户输入
        contents.push({
            role: "user",
            parts: [{ text: `用户需求：${prompt}` }]
        });

        const requestBody = {
            contents: contents,
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 65000
            }
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态: ${response.status}`);
            }

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;

            console.log(`[${EXTENSION_NAME}] Gemini API回复:`, text);

            // 将对话添加到历史记录
            conversationHistory.addToHistory(prompt, text);

            return text;

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] Gemini API调用失败:`, error);
            
            // 增强错误信息
            let enhancedError = error.message;
            if (error.message.includes('HTTP 401')) {
                enhancedError = 'Gemini API Key无效或已过期，请检查您的API Key';
            } else if (error.message.includes('HTTP 403')) {
                enhancedError = 'Gemini API访问被拒绝，请检查API Key权限或配额';
            } else if (error.message.includes('HTTP 429')) {
                enhancedError = 'Gemini API请求过于频繁，请稍后再试';
            } else if (error.message.includes('HTTP 400')) {
                enhancedError = 'Gemini API请求格式错误，请检查模型名称或请求内容';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                enhancedError = '无法连接到Gemini API，请检查网络连接';
            }
            
            throw new Error(enhancedError);
        }
    }

    /**
     * 获取Gemini API的模型列表
     */
    async function fetchGeminiModels(apiKey) {
        console.log(`[${EXTENSION_NAME}] 获取Gemini模型列表`);

        try {
            const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            
            console.log(`[${EXTENSION_NAME}] 请求Gemini模型列表URL: ${modelsUrl.replace(/key=.+/, 'key=***')}`);

            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[${EXTENSION_NAME}] Gemini模型列表响应:`, data);

            // 解析Gemini模型列表
            if (data.models && Array.isArray(data.models)) {
                const models = data.models
                    .filter(model => {
                        // 过滤掉不支持生成内容的模型
                        return model.supportedGenerationMethods && 
                               model.supportedGenerationMethods.includes('generateContent');
                    })
                    .map(model => ({
                        id: model.name.replace('models/', ''), // 移除'models/'前缀
                        name: model.displayName || model.name.replace('models/', ''),
                        description: model.description,
                        version: model.version,
                        inputTokenLimit: model.inputTokenLimit,
                        outputTokenLimit: model.outputTokenLimit
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name)); // 按名称排序

                console.log(`[${EXTENSION_NAME}] 解析得到 ${models.length} 个可用的Gemini模型`);
                return models;
            } else {
                throw new Error('无法解析Gemini模型列表响应格式');
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取Gemini模型列表失败:`, error);
            
            // 增强错误信息
            let enhancedError = error.message;
            if (error.message.includes('HTTP 401')) {
                enhancedError = 'API Key无效或已过期，请检查您的Gemini API Key';
            } else if (error.message.includes('HTTP 403')) {
                enhancedError = 'API访问被拒绝，请检查API Key权限或配额';
            } else if (error.message.includes('HTTP 429')) {
                enhancedError = 'API请求过于频繁，请稍后再试';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                enhancedError = '网络连接失败，请检查网络设置或代理配置';
            }
            
            throw new Error(enhancedError);
        }
    }

    /**
     * 标准化API基础URL
     */
    function normalizeApiBaseUrl(baseUrl) {
        if (!baseUrl) return '';
        
        // 移除末尾的斜杠
        let normalized = baseUrl.trim().replace(/\/+$/, '');
        
        // 确保以http://或https://开头
        if (!normalized.match(/^https?:\/\//)) {
            normalized = 'https://' + normalized;
        }
        
        console.log(`[${EXTENSION_NAME}] 标准化API URL: ${baseUrl} -> ${normalized}`);
        return normalized;
    }

    // 持久化缓存API Key，避免页面刷新后重复设置
    const API_KEY_CACHE_KEY = 'stquickstatusbar_cached_api_key';
    
    // 缓存CSRF令牌，避免频繁获取
    let cachedCsrfToken = null;
    let csrfTokenCacheTime = 0;
    const CSRF_CACHE_DURATION = 60000; // 缓存1分钟

    /**
     * 获取缓存的API Key
     */
    function getCachedApiKey() {
        try {
            return localStorage.getItem(API_KEY_CACHE_KEY);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] 无法读取localStorage，使用内存缓存`);
            return null;
        }
    }

    /**
     * 设置缓存的API Key
     */
    function setCachedApiKey(apiKey) {
        try {
            localStorage.setItem(API_KEY_CACHE_KEY, apiKey);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] 无法写入localStorage`);
        }
    }

    /**
     * 清除缓存的API Key (当检测到Key失效时)
     */
    function clearCachedApiKey() {
        try {
            localStorage.removeItem(API_KEY_CACHE_KEY);
            console.log(`[${EXTENSION_NAME}] 已清除失效的API Key缓存`);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] 无法清除localStorage缓存`);
        }
    }

    /**
     * 获取CSRF令牌 (带缓存优化)
     */
    async function getCsrfToken() {
        const now = Date.now();
        
        // 如果缓存有效，直接返回缓存的令牌
        if (cachedCsrfToken && (now - csrfTokenCacheTime) < CSRF_CACHE_DURATION) {
            return cachedCsrfToken;
        }

        try {
            const response = await fetch('/csrf-token');
            const data = await response.json();
            
            // 更新缓存
            cachedCsrfToken = data.token;
            csrfTokenCacheTime = now;
            
            return data.token;
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取CSRF令牌失败:`, error);
            throw error;
        }
    }

    /**
     * 设置自定义API的API Key到SillyTavern secrets (简化版)
     */
    async function setCustomApiKey(apiKey) {
        // 检查缓存中的API Key
        const cachedApiKey = getCachedApiKey();
        
        // 如果API Key没有变化，跳过设置
        if (cachedApiKey === apiKey) {
            console.log(`[${EXTENSION_NAME}] API Key未变化，跳过设置 (来自缓存)`);
            return true;
        }

        try {
            const csrfToken = await getCsrfToken();
            
            const response = await fetch('/api/secrets/write', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    key: 'api_key_custom',
                    value: apiKey
                })
            });

            if (!response.ok) {
                throw new Error(`设置API Key失败: HTTP ${response.status}`);
            }

            // 更新缓存
            setCachedApiKey(apiKey);
            console.log(`[${EXTENSION_NAME}] 自定义API Key已设置并缓存`);
            return true;
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 设置API Key失败:`, error);
            return false;
        }
    }

    /**
     * 处理API调用失败，如果是认证错误则清除缓存
     */
    function handleApiFailure(error) {
        const errorMessage = error.message.toLowerCase();
        
        // 检查是否为认证相关错误（扩展检测范围）
        const isAuthError = errorMessage.includes('unauthorized') || 
                           errorMessage.includes('invalid api key') ||
                           errorMessage.includes('api key') ||
                           errorMessage.includes('401') ||
                           errorMessage.includes('403') ||
                           errorMessage.includes('authentication') ||
                           errorMessage.includes('access denied') ||
                           errorMessage.includes('forbidden') ||
                           errorMessage.includes('invalid key') ||
                           errorMessage.includes('key expired') ||
                           errorMessage.includes('key invalid');

        // 检测SillyTavern API的模糊错误情况
        const isSillyTavernApiError = errorMessage.includes('sillytavern api错误');

        if (isAuthError) {
            console.warn(`[${EXTENSION_NAME}] 检测到认证错误，清除API Key缓存:`, error.message);
            clearCachedApiKey();
        } else if (isSillyTavernApiError) {
            // 对于SillyTavern API的模糊错误，也尝试清除缓存以便重试
            console.warn(`[${EXTENSION_NAME}] SillyTavern API返回错误，清除缓存以便重试:`, error.message);
            clearCachedApiKey();
        }
        
        throw error;
    }

    /**
     * 获取自定义API的模型列表 (简化版)
     */
    async function fetchCustomModels(baseUrl, apiKey) {
        console.log(`[${EXTENSION_NAME}] 获取自定义API模型列表`);

        try {
            const normalizedUrl = normalizeApiBaseUrl(baseUrl);
            console.log(`[${EXTENSION_NAME}] 通过本地代理获取模型列表，目标API: ${normalizedUrl}`);

            // 设置API Key (有缓存则跳过)
            const keySetSuccess = await setCustomApiKey(apiKey);
            if (!keySetSuccess) {
                throw new Error('无法设置API Key到SillyTavern，请检查权限');
            }

            // 获取CSRF令牌
            const csrfToken = await getCsrfToken();

            // 调用SillyTavern本地API端点
            const response = await fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    chat_completion_source: 'custom',
                    custom_url: normalizedUrl
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[${EXTENSION_NAME}] 模型列表响应:`, data);

            // 检查是否有错误
            if (data.error) {
                console.error(`[${EXTENSION_NAME}] SillyTavern API错误:`, data);
                
                // 构建更详细的错误信息，包含可能的认证错误关键词
                let errorMessage = data.message || '未知错误';
                let errorDetails = '';
                
                // 检查具体的错误信息
                if (data.data && typeof data.data === 'object') {
                    if (data.data.error) {
                        errorDetails = ` - ${data.data.error}`;
                    }
                    if (data.data.message) {
                        errorDetails += ` - ${data.data.message}`;
                    }
                }
                
                const fullErrorMessage = `SillyTavern API错误: ${errorMessage}${errorDetails}`;
                console.error(`[${EXTENSION_NAME}] 完整错误信息:`, fullErrorMessage);
                
                throw new Error(fullErrorMessage);
            }

            // 解析模型列表
            if (data.data && Array.isArray(data.data)) {
                return data.data.map(model => ({
                    id: model.id,
                    name: model.id,
                    created: model.created
                }));
            } else if (Array.isArray(data)) {
                return data.map(model => ({
                    id: typeof model === 'string' ? model : model.id,
                    name: typeof model === 'string' ? model : model.id
                }));
            } else {
                throw new Error('无法解析模型列表响应格式');
            }

        } catch (error) {
            // 如果是认证错误，清除缓存
            handleApiFailure(error);
        }
    }

    /**
     * 调用自定义API (简化版)
     */
    async function callCustomAPI(prompt, apiBaseUrl, apiKey, model) {
        console.log(`[${EXTENSION_NAME}] 调用自定义API开始`);

        try {
            // 标准化基础URL
            const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
            console.log(`[${EXTENSION_NAME}] 通过本地代理调用API，目标API: ${normalizedBaseUrl}`);

            // 构建系统提示词
            const systemPrompt = `你是一个专业的正则表达式专家，专门为角色扮演游戏创建状态栏文本处理规则。请根据用户的需求生成合适的正则表达式和替换内容。

🔥🔥🔥 强制性格式要求 - <state_bar> 标签必须包裹：
- 你生成的示例正文内容中，状态栏部分必须被 <state_bar></state_bar> 标签完整包裹
- 正则表达式必须匹配包含 <state_bar> 标签在内的完整结构
- 这是绝对不可违反的核心要求，任何情况下都不能遗漏

🔥 关键要求 - 标签一致性检查：
- 正则表达式中使用的标签名必须与示例正文内容中的标签名完全一致
- 生成完成后必须自我检查：每个捕获组的标签名是否在示例正文中都能找到对应的标签
- 如果发现不一致，必须修正其中一个使其保持一致
- 禁止使用不存在于示例正文中的标签名

强制性<state_bar>格式示例：
✅ 正确格式（必须这样）：
示例正文：
<state_bar>
<生命值>85/100</生命值>
<魔法值>42/60</魔法值>
<金钱>1250G</金钱>
</state_bar>
这是角色的对话内容...

❌ 错误格式（绝对禁止）：
示例正文：
<生命值>85/100</生命值>
<魔法值>42/60</魔法值>
<金钱>1250G</金钱>
这是角色的对话内容...

标签一致性验证示例：
❌ 错误示例：
   示例正文：<剩余资源>箭矢: 35/50</剩余资源>
   正则表达式：<剩余弹药>([^<]+)</剩余弹药>  ← 标签名不一致！

✅ 正确示例：
   示例正文：<剩余资源>箭矢: 35/50</剩余资源>
   正则表达式：<剩余资源>([^<]+)</剩余资源>  ← 标签名完全一致！

重要要求：
1. 你的回复必须严格按照以下格式，分为四个明确的部分：
   === 正则表达式 ===
   [在这里写正则表达式，使用捕获组()]

   === 状态栏XML格式 ===
   [在这里写原始状态栏XML结构，包含模板变量]

   === 示例正文内容 ===
   [在这里写包含状态栏的完整示例文本，供用户测试使用]

   === HTML美化内容 ===
   [在这里写美化后的HTML页面内容，使用$1,$2,$3等宏引用捕获组]

2. 禁止在每个部分使用代码块标记（如反引号代码块标记）
3. 禁止添加任何解释、说明、注释或额外的文字
4. 每个部分只包含纯粹的内容，不要包含任何描述性文字
5. 回复结束后不要添加任何说明文字或解释

关键规则 - 正则表达式：
- 正则表达式必须使用捕获组()来捕获需要提取的内容
- 每个捕获组对应一个数据片段，按照在HTML中使用的顺序排列
- 🔥 最重要：正则表达式中的每个标签名必须与示例正文内容中的标签名完全一致
- 🔥 正则表达式必须匹配包含<state_bar>标签的完整结构
- 例如：如果要匹配<state_bar><时间>09:00</时间><日期>2025-05-20</日期></state_bar>
- 正则应该写成：<state_bar>\\s*<时间>([^<]+)</时间>\\s*<日期>([^<]+)</日期>\\s*</state_bar>
- 这样$1就是时间值，$2就是日期值

关键规则 - 示例正文内容：
- 🔥🔥🔥 示例正文内容中的状态栏部分必须完整地被 <state_bar></state_bar> 标签包裹
- 🔥 示例正文内容中使用的所有标签名，必须与正则表达式中的标签名完全一致
- 所有数据值应该是合理的示例数据，便于用户测试
- 示例格式必须为：<state_bar>[状态栏内容]</state_bar>[其他正文内容]

关键规则 - HTML美化内容：
- HTML美化内容必须是纯净的HTML代码，不能包含任何解释文字或额外内容
- HTML美化内容必须以<!DOCTYPE html>开头，包含完整的html、head、body结构
- HTML美化内容必须使用$1,$2,$3等宏来引用正则表达式的捕获组
- 例如：如果正则有3个捕获组，HTML中就使用$1,$2,$3来引用对应的内容
- 绝对禁止在HTML美化内容中使用具体的数值，必须使用宏引用
- 禁止在HTML美化内容部分添加任何说明文字、注释或解释

标签一致性工作流程：
1. 首先确定需要的状态栏字段（如：生命值、魔法值、金钱等）
2. 为每个字段确定统一的标签名（如：<生命值>、<魔法值>、<金钱>）
3. 在示例正文内容中使用<state_bar>包裹这些确定的标签名
4. 在正则表达式中使用完全相同的标签名进行匹配（包括<state_bar>标签）
5. 在HTML美化内容中使用对应的$1,$2,$3等宏引用

宏引用示例（带state_bar标签）：
- 正则：<state_bar>\\s*<时间>([^<]+)</时间>\\s*<日期>([^<]+)</日期>\\s*<想法>([^<]+)</想法>\\s*</state_bar>
- 示例正文：<state_bar><时间>15:30</时间><日期>2025-01-15</日期><想法>今天天气真好</想法></state_bar>角色对话内容
- HTML中使用：<div class="time">$1</div><div class="date">$2</div><div class="thought">$3</div>

核心原则：
- 专门处理 <state_bar> 标签内容，或在没有状态栏时插入新的状态栏
- 根据用户需求生成对应的状态栏格式和内容
- 保持正文内容完全不变，只操作状态栏部分
- 🔥 确保正则表达式、示例正文、HTML美化内容三者之间的标签名完全一致
- 🔥🔥🔥 状态栏必须被<state_bar></state_bar>标签完整包裹

状态栏处理模式：
1. 替换现有状态栏：
   正则表达式：<state_bar>.*?</state_bar>

2. 如果没有状态栏则插入：
   正则表达式：^(?!.*<state_bar>)(.*)$
   HTML内容：<state_bar>[美化的HTML状态栏内容]</state_bar>\\n$1

3. 更新状态栏中的特定元素：
   正则表达式：<state_bar>\\s*<特定标签>.*?</特定标签>\\s*</state_bar>

用户需求示例理解：
如果用户说"帮我制定一个角色状态栏，显示角色的想法、衣着、身体状态和好感度"，

你应该生成：
1. 正则表达式（使用捕获组匹配各个标签的内容，包含<state_bar>标签）
2. XML格式如：
<state_bar>
<想法>{{江念雪当前内心的真实想法，20字以内概述，禁止上帝视角，禁止显示其他人的想法，无法获取应该显示为'暂无'}}</想法>
<衣着>{{江念雪当前衣着，20字以内概述}}</衣着>
<双乳状态>{{江念雪当前双乳的状态，20字以内概述}}</双乳状态>
<小穴状态>{{江念雪当前阴道的状态，20字以内概述}}</小穴状态>
<子宫状态>{{江念雪当前子宫内部的状态，20字以内概述}}</子宫状态>
<后穴状态>{{江念雪当前后穴（肛门）的状态，20字以内概述}}</后穴状态>
<好感度>{{江念雪.好感度：显示江念雪当前对<user>的好感度，仅显示阶段名+数值+数值变化，例如：师道尊严 (1/100) [+1]}}</好感度>
</state_bar>

3. 示例正文内容，包含被<state_bar></state_bar>包裹的真实数据完整示例
4. 完整的美化HTML页面，使用$1,$2,$3等宏引用捕获组的内容，不使用任何具体数值

注意事项：
- 状态栏内容应该使用模板变量格式，如 {{角色名.属性}}
- 时间相关建议使用固定格式标签：<时间>、<日期>、<星期>
- 选项建议使用：<Options_1>、<Options_2> 等格式
- HTML美化内容要是完整的HTML页面，包含样式和交互
- 根据用户的具体需求调整标签名称和数量
- 确保生成的内容符合用户的具体要求
- 🔥🔥🔥 最重要：状态栏必须被<state_bar></state_bar>标签完整包裹，正则表达式和HTML替换内容必须配套，捕获组数量要匹配，标签名必须一致`;

            // 构建对话历史上下文
            const historyMessages = conversationHistory.buildConversationContext(prompt, 'openai');
            console.log(`[${EXTENSION_NAME}] 历史对话数量: ${historyMessages.length / 2}`);

            // 构建完整的消息数组
            const messages = [
                {
                    role: "system",
                    content: systemPrompt
                }
            ];

            // 添加历史对话
            messages.push(...historyMessages);

            // 添加当前用户输入
            messages.push({
                role: "user",
                content: prompt
            });

            // 设置API Key (有缓存则跳过)
            const keySetSuccess = await setCustomApiKey(apiKey);
            if (!keySetSuccess) {
                throw new Error('无法设置API Key到SillyTavern，请检查权限');
            }

            // 获取CSRF令牌
            const csrfToken = await getCsrfToken();

            // 调用SillyTavern本地API端点
            const response = await fetch('/api/backends/chat-completions/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    chat_completion_source: 'custom',
                    custom_url: normalizedBaseUrl,
                    model: model,
                    messages: messages,
                    temperature: 0,
                    max_tokens: 23000
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
            }

            const data = await response.json();
            console.log(`[${EXTENSION_NAME}] 自定义API响应:`, data);
            
            // 检查是否有错误
            if (data.error) {
                console.error(`[${EXTENSION_NAME}] SillyTavern API错误:`, data);
                
                // 构建更详细的错误信息
                let errorMessage = data.message || '未知错误';
                let errorDetails = '';
                
                if (data.data && typeof data.data === 'object') {
                    if (data.data.error) {
                        errorDetails = ` - ${data.data.error}`;
                    }
                    if (data.data.message) {
                        errorDetails += ` - ${data.data.message}`;
                    }
                }
                
                const fullErrorMessage = `SillyTavern API错误: ${errorMessage}${errorDetails}`;
                throw new Error(fullErrorMessage);
            }
            
            const text = data.choices[0].message.content;

            console.log(`[${EXTENSION_NAME}] 自定义API回复:`, text);

            // 将对话添加到历史记录
            conversationHistory.addToHistory(prompt, text);

            return text;

        } catch (error) {
            // 如果是认证错误，清除缓存
            handleApiFailure(error);
        }
    }

    /**
     * 解析AI回复，提取正则表达式和替换内容
     */
    function parseAIResponse(responseText) {
        console.log(`[${EXTENSION_NAME}] 解析AI回复:`, responseText);

        let regexPattern = '';
        let xmlContent = '';
        let exampleContent = '';
        let htmlContent = '';

        // 尝试按照指定格式解析四个部分
        const regexMatch = responseText.match(/===\s*正则表达式\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*状态栏XML格式\s*===|$)/);
        const xmlMatch = responseText.match(/===\s*状态栏XML格式\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*示例正文内容\s*===|$)/);
        const exampleMatch = responseText.match(/===\s*示例正文内容\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*HTML美化内容\s*===|$)/);
        const htmlMatch = responseText.match(/===\s*HTML美化内容\s*===\s*\n([\s\S]*?)(?=\n\s*===|$)/);

        if (regexMatch) {
            regexPattern = regexMatch[1].trim();
            console.log(`[${EXTENSION_NAME}] 解析到正则表达式:`, regexPattern);
        }

        if (xmlMatch) {
            xmlContent = xmlMatch[1].trim();
            console.log(`[${EXTENSION_NAME}] 解析到XML内容:`, xmlContent.substring(0, 100) + '...');
        }

        if (exampleMatch) {
            exampleContent = exampleMatch[1].trim();
            console.log(`[${EXTENSION_NAME}] 解析到示例内容:`, exampleContent.substring(0, 100) + '...');
            
            // 🔥 格式检查：确保示例正文包含<state_bar>标签包裹
            if (!exampleContent.includes('<state_bar>') || !exampleContent.includes('</state_bar>')) {
                console.warn(`[${EXTENSION_NAME}] ⚠️ 格式检查警告：示例正文内容缺少<state_bar>标签包裹！`);
                console.warn(`[${EXTENSION_NAME}] 当前示例内容:`, exampleContent);
                
                // 尝试自动修复：如果内容中有状态栏相关标签但没有被<state_bar>包裹，则自动添加
                const hasStatusTags = /<[^>]+>.*?<\/[^>]+>/.test(exampleContent);
                if (hasStatusTags && !exampleContent.includes('<state_bar>')) {
                    console.log(`[${EXTENSION_NAME}] 尝试自动修复：为示例内容添加<state_bar>标签`);
                    
                    // 查找第一个XML标签的位置
                    const firstTagMatch = exampleContent.match(/(<[^>]+>.*?<\/[^>]+>)/);
                    if (firstTagMatch) {
                        const insertPoint = exampleContent.indexOf(firstTagMatch[1]);
                        exampleContent = exampleContent.slice(0, insertPoint) + 
                                        '<state_bar>\n' + 
                                        exampleContent.slice(insertPoint).replace(/(\n|$)/, '\n</state_bar>$1');
                        console.log(`[${EXTENSION_NAME}] 自动修复后的示例内容:`, exampleContent.substring(0, 200) + '...');
                    }
                }
            } else {
                console.log(`[${EXTENSION_NAME}] ✅ 格式检查通过：示例正文包含正确的<state_bar>标签包裹`);
            }
        }

        if (htmlMatch) {
            htmlContent = htmlMatch[1].trim();
            console.log(`[${EXTENSION_NAME}] 解析到HTML内容:`, htmlContent.substring(0, 100) + '...');
        }

        // 如果没有找到四个部分的标准格式，尝试解析三个部分的格式（向下兼容）
        if (!regexPattern || !htmlContent) {
            console.log(`[${EXTENSION_NAME}] 尝试解析三个部分格式...`);
            const oldRegexMatch = responseText.match(/===\s*正则表达式\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*状态栏XML格式\s*===|$)/);
            const oldXmlMatch = responseText.match(/===\s*状态栏XML格式\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*HTML美化内容\s*===|$)/);
            const oldHtmlMatch = responseText.match(/===\s*HTML美化内容\s*===\s*\n([\s\S]*?)(?=\n\s*===|$)/);

            if (oldRegexMatch) {
                regexPattern = oldRegexMatch[1].trim();
            }
            if (oldXmlMatch) {
                xmlContent = oldXmlMatch[1].trim();
            }
            if (oldHtmlMatch) {
                htmlContent = oldHtmlMatch[1].trim();
            }
        }

        // 如果没有找到标准格式，尝试解析两个部分的旧格式（向下兼容）
        if (!regexPattern || !htmlContent) {
            console.log(`[${EXTENSION_NAME}] 尝试解析旧格式（两个部分）...`);
            const oldRegexMatch = responseText.match(/===\s*正则表达式\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*替换内容\s*===|$)/);
            const oldReplacementMatch = responseText.match(/===\s*替换内容\s*===\s*\n([\s\S]*?)(?=\n\s*===|$)/);

            if (oldRegexMatch) {
                regexPattern = oldRegexMatch[1].trim();
            }

            if (oldReplacementMatch) {
                htmlContent = oldReplacementMatch[1].trim();
                // 如果是"(删除)"，转换为空字符串
                if (htmlContent === '(删除)') {
                    htmlContent = '';
                }
            }
        }

        // 如果没有找到标准格式，尝试其他解析方式
        if (!regexPattern && !htmlContent) {
            console.log(`[${EXTENSION_NAME}] 尝试备用解析方式...`);
            // 简单的备用解析逻辑
            const lines = responseText.split('\n');
            let foundRegex = false;
            let foundReplacement = false;

            for (let line of lines) {
                if (line.includes('正则') || line.includes('regex') || line.includes('pattern')) {
                    const match = line.match(/[:\-]\s*(.+)$/);
                    if (match && !foundRegex) {
                        regexPattern = match[1].trim();
                        foundRegex = true;
                    }
                } else if (line.includes('替换') || line.includes('replace') || line.includes('replacement') || line.includes('HTML')) {
                    const match = line.match(/[:\-]\s*(.+)$/);
                    if (match && !foundReplacement) {
                        htmlContent = match[1].trim();
                        foundReplacement = true;
                    }
                }
            }
        }

        console.log(`[${EXTENSION_NAME}] 最终解析结果:`, {
            regexPattern: regexPattern ? regexPattern.substring(0, 50) + '...' : 'null',
            xmlContent: xmlContent ? xmlContent.substring(0, 50) + '...' : 'null',
            exampleContent: exampleContent ? exampleContent.substring(0, 50) + '...' : 'null',
            htmlContent: htmlContent ? htmlContent.substring(0, 50) + '...' : 'null'
        });

        return {
            regexPattern,
            xmlContent,
            exampleContent,
            replacementContent: htmlContent  // 保持旧的属性名用于兼容性
        };
    }

    /**
     * 处理AI生成正则表达式
     */
    async function handleAIGenerate() {
        console.log(`[${EXTENSION_NAME}] 开始AI生成正则表达式`);

        try {
            // 获取配置
            const provider = document.getElementById('ai-provider')?.value || 'gemini';
            const prompt = document.getElementById('ai-prompt')?.value;

            if (!prompt || prompt.trim() === '') {
                showStatus('❌ 请输入你想要的正则功能描述', true);
                return;
            }

            // 显示生成中状态
            const generateBtn = document.getElementById('generate-regex');
            const originalText = generateBtn.textContent;
            generateBtn.textContent = '生成中...';
            generateBtn.disabled = true;

            let responseText = '';

            if (provider === 'gemini') {
                const apiKey = document.getElementById('gemini-api-key')?.value;
                const model = document.getElementById('gemini-model')?.value || 'gemini-1.5-flash';

                if (!apiKey) {
                    throw new Error('请输入Gemini API Key');
                }

                responseText = await callGeminiAPI(prompt, apiKey, model);

            } else if (provider === 'custom') {
                const apiUrl = document.getElementById('custom-api-url')?.value;
                const apiKey = document.getElementById('custom-api-key')?.value;
                const model = document.getElementById('custom-model')?.value;

                if (!apiUrl || !apiKey) {
                    throw new Error('请输入API URL和API Key');
                }

                responseText = await callCustomAPI(prompt, apiUrl, apiKey, model);
            }

            // 显示原始回复
            const rawResponseElement = document.getElementById('ai-raw-response');
            if (rawResponseElement) {
                rawResponseElement.value = responseText;
            }

            // 解析回复
            const { regexPattern, replacementContent, exampleContent } = parseAIResponse(responseText);

            // 显示解析结果
            const patternElement = document.getElementById('ai-generated-pattern');
            const replacementElement = document.getElementById('ai-generated-replacement');

            if (patternElement) {
                patternElement.value = regexPattern;
            }
            if (replacementElement) {
                replacementElement.value = replacementContent;
            }

            // 如果有示例内容，自动填入正文使用区域
            if (exampleContent) {
                const contentTextarea = document.getElementById('demo-text');
                if (contentTextarea) {
                    contentTextarea.value = exampleContent;
                    console.log(`[${EXTENSION_NAME}] 已自动填入示例内容到正文使用区域`);
                }
            }

            // 显示结果区域
            const resultSection = document.querySelector('.ai-result-section');
            if (resultSection) {
                resultSection.style.display = 'block';
            }

            showStatus('✅ AI生成完成，示例内容已自动填入正文区域');
            
            // 显示成功的toast提示
            if (toastr) {
                const provider = document.getElementById('ai-provider')?.value || 'gemini';
                if (provider === 'gemini') {
                    toastr.success('Gemini API生成成功', '生成完成');
                } else if (provider === 'custom') {
                    toastr.success('自定义API生成成功', '生成完成');
                } else {
                    toastr.success('AI正则表达式生成完成', '生成完成');
                }
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] AI生成失败:`, error);
            
            // 根据API提供商生成详细的错误信息
            const provider = document.getElementById('ai-provider')?.value || 'gemini';
            let errorTitle = '';
            let troubleshootingSteps = [];
            
            if (provider === 'gemini') {
                errorTitle = 'Gemini API调用失败';
                troubleshootingSteps = [
                    '• 检查Gemini API Key是否正确',
                    '• 确认API Key权限和配额是否充足',
                    '• 检查网络连接是否正常',
                    '• 确认Gemini API服务是否可用'
                ];
            } else if (provider === 'custom') {
                errorTitle = '自定义API调用失败';
                troubleshootingSteps = [
                    '• 检查API基础URL是否正确',
                    '• 确认API Key是否有效',
                    '• 检查网络连接是否正常',
                    '• 确认API服务是否支持OpenAI格式'
                ];
            }
            
            // 增强错误信息
            let enhancedError = error.message;
            if (error.message.includes('请输入')) {
                // 配置缺失错误，不需要弹窗
                showStatus(`❌ ${error.message}`, true);
                return;
            } else if (error.message.includes('HTTP 401')) {
                enhancedError = 'API Key无效或已过期';
            } else if (error.message.includes('HTTP 403')) {
                enhancedError = 'API访问被拒绝，请检查权限或配额';
            } else if (error.message.includes('HTTP 429')) {
                enhancedError = 'API请求过于频繁，请稍后再试';
            } else if (error.message.includes('Failed to fetch')) {
                if (error.stack && error.stack.includes('ERR_CERT')) {
                    enhancedError = 'SSL证书验证失败，请检查API地址';
                } else {
                    enhancedError = '网络连接失败，请检查网络或API地址';
                }
            }
            
            // 生成详细的错误弹窗内容
            const errorMessage = `${errorTitle}：\n\n${enhancedError}\n\n请检查：\n${troubleshootingSteps.join('\n')}`;
            
            console.log(`[${EXTENSION_NAME}] 准备显示生成错误弹窗，callGenericPopup可用性:`, typeof callGenericPopup);
            if (callGenericPopup) {
                console.log(`[${EXTENSION_NAME}] 调用生成错误弹窗，错误信息:`, errorMessage);
                callGenericPopup(errorMessage, POPUP_TYPE.TEXT, '', {
                    wide: false,
                    large: false,
                    allowVerticalScrolling: true
                }).then(() => {
                    console.log(`[${EXTENSION_NAME}] 生成错误弹窗已显示`);
                }).catch(popupError => {
                    console.error(`[${EXTENSION_NAME}] 生成错误弹窗显示失败:`, popupError);
                });
            } else {
                console.warn(`[${EXTENSION_NAME}] callGenericPopup不可用，使用alert代替`);
                alert(errorMessage);
            }
            
            // 显示toast提示
            console.log(`[${EXTENSION_NAME}] 准备显示生成错误toast，toastr可用性:`, typeof toastr);
            if (toastr) {
                if (provider === 'gemini') {
                    toastr.error('Gemini API调用失败', '生成错误');
                } else if (provider === 'custom') {
                    toastr.error('自定义API调用失败', '生成错误');
                } else {
                    toastr.error('AI生成正则表达式失败', '生成错误');
                }
                console.log(`[${EXTENSION_NAME}] 生成错误toast已显示`);
            } else {
                console.warn(`[${EXTENSION_NAME}] toastr不可用`);
            }
            
            showStatus(`❌ AI生成失败: ${enhancedError}`, true);
        } finally {
            // 恢复按钮状态
            const generateBtn = document.getElementById('generate-regex');
            if (generateBtn) {
                generateBtn.textContent = '生成正则表达式';
                generateBtn.disabled = false;
            }
        }
    }

    /**
     * 预览AI生成的结果应用效果 - 内联展示版本
     */
    function previewAIResult() {
        console.log(`[${EXTENSION_NAME}] 预览AI生成的结果效果 - 内联模式`);

        try {
            const aiPattern = document.getElementById('ai-generated-pattern')?.value || '';
            const aiReplacement = document.getElementById('ai-generated-replacement')?.value || '';
            let demoText = document.getElementById('demo-text')?.value || '';

            if (!aiPattern) {
                showStatus('❌ 没有AI生成的正则表达式可以预览', true);
                return;
            }

            if (!demoText.trim()) {
                // 如果用户没有输入示例文本，使用默认的随机正文
                demoText = generateRandomDemoText();
                // 更新demo-text输入框内容
                const demoTextElement = document.getElementById('demo-text');
                if (demoTextElement) {
                    demoTextElement.value = demoText;
                }
            }

            // 验证正则表达式
            let regex;
            try {
                regex = new RegExp(aiPattern, 'gms'); // 使用全局多行单行模式
            } catch (error) {
                showStatus(`❌ 正则表达式无效: ${error.message}`, true);
                return;
            }

            // 应用正则表达式
            let result;
            try {
                result = demoText.replace(regex, aiReplacement);
                console.log(`[${EXTENSION_NAME}] 正则替换结果:`, result);
            } catch (error) {
                showStatus(`❌ 应用正则表达式失败: ${error.message}`, true);
                return;
            }

            // 显示内联预览
            showInlinePreview(aiReplacement, demoText, result);

            // 显示统计信息
            const matches = Array.from(demoText.matchAll(regex));
            const matchCount = matches.length;

            if (matchCount > 0) {
                showStatus('预览已显示，找到 ${matchCount} 个匹配并应用了替换');
            } else {
                showStatus('内联预览已显示，但没有找到匹配的内容', false);
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 预览AI结果失败:`, error);
            showStatus(`❌ 预览失败: ${error.message}`, true);
        }
    }

    /**
     * 显示内联预览
     */
    function showInlinePreview(aiGeneratedReplacement, originalText, fullResult) {
        console.log(`[${EXTENSION_NAME}] 显示内联预览`);

        // 查找或创建内联预览容器
        let inlineContainer = document.getElementById('inline-preview-container');
        if (!inlineContainer) {
            // 创建内联预览容器
            inlineContainer = createInlinePreviewContainer();
        }

        // 显示容器
        inlineContainer.style.display = 'block';
        inlineContainer.classList.add('active');

        // 更新预览内容
        updateInlinePreviewContent(inlineContainer, aiGeneratedReplacement, originalText, fullResult);

        // 滚动到预览区域
        setTimeout(() => {
            inlineContainer.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
        }, 100);

        console.log(`[${EXTENSION_NAME}] 内联预览已显示`);
    }

    /**
     * 创建内联预览容器
     */
    function createInlinePreviewContainer() {
        console.log(`[${EXTENSION_NAME}] 创建内联预览容器`);

        // 找到AI结果区域的父容器
        const aiResultSection = document.querySelector('.ai-result-section');
        if (!aiResultSection) {
            console.error(`[${EXTENSION_NAME}] 找不到AI结果区域，无法创建内联预览`);
            return null;
        }

        // 创建内联预览容器
        const inlineContainer = document.createElement('div');
        inlineContainer.id = 'inline-preview-container';
        inlineContainer.className = 'inline-preview-container';
        inlineContainer.style.display = 'none';

        // 创建预览HTML结构
        inlineContainer.innerHTML = `
            <div class="inline-preview-header">
                <h4>预览效果</h4>
                <div class="inline-preview-controls">
                    <button id="toggle-preview-mode" class="preview-control-btn" title="切换预览模式">
                        HTML渲染
                    </button>
                    <button id="close-inline-preview" class="preview-close-btn" title="关闭预览">
                        ✕
                    </button>
                </div>
            </div>
            
            <div class="inline-preview-content">
                <!-- 渲染效果区域 -->
                <div class="preview-render-section" id="preview-render-section">
                    <div class="preview-mode-tabs">
                        <button class="preview-tab active" data-mode="html">HTML渲染</button>
                        <button class="preview-tab" data-mode="text">文本对比</button>
                    </div>
                    
                    <!-- HTML渲染模式 -->
                    <div class="preview-mode-content active" id="html-preview-mode">
                        <div class="html-render-container" id="inline-html-render-container">
                            <!-- HTML内容将动态插入这里 -->
                        </div>
                    </div>
                    
                    <!-- 文本对比模式 -->
                    <div class="preview-mode-content" id="text-preview-mode">
                        <div class="text-comparison-grid">
                            <div class="before-column">
                                <h5>应用前：</h5>
                                <div class="text-display-container">
                                    <pre class="text-display" id="before-text-display"></pre>
                                </div>
                            </div>
                            <div class="after-column">
                                <h5>应用后：</h5>
                                <div class="text-display-container">
                                    <pre class="text-display" id="after-text-display"></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 将容器插入到AI结果区域之后
        aiResultSection.parentNode.insertBefore(inlineContainer, aiResultSection.nextSibling);

        // 绑定事件
        bindInlinePreviewEvents(inlineContainer);

        console.log(`[${EXTENSION_NAME}] 内联预览容器创建完成`);
        return inlineContainer;
    }

    /**
     * 绑定内联预览事件
     */
    function bindInlinePreviewEvents(container) {
        // 关闭预览
        const closeBtn = container.querySelector('#close-inline-preview');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                hideInlinePreview();
            });
        }

        // 模式切换标签
        const modeTabs = container.querySelectorAll('.preview-tab');
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                switchPreviewMode(mode);
            });
        });

        // 键盘事件
        container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideInlinePreview();
            }
        });

        console.log(`[${EXTENSION_NAME}] 内联预览事件绑定完成`);
    }

    /**
     * 更新内联预览内容
     */
    function updateInlinePreviewContent(container, aiGeneratedReplacement, originalText, fullResult) {
        console.log(`[${EXTENSION_NAME}] 更新内联预览内容`);

        // 更新HTML渲染内容
        updateInlineHTMLPreview(container, aiGeneratedReplacement);

        // 更新文本对比内容
        updateInlineTextComparison(container, originalText, fullResult);
    }

    /**
     * 更新内联HTML预览
     */
    function updateInlineHTMLPreview(container, aiGeneratedReplacement) {
        const htmlContainer = container.querySelector('#inline-html-render-container');
        if (!htmlContainer) return;

        try {
            if (aiGeneratedReplacement && aiGeneratedReplacement.trim()) {
                // 清理AI生成的HTML内容
                const cleanedHtml = cleanAIGeneratedHTML(aiGeneratedReplacement);
                console.log(`[${EXTENSION_NAME}] 内联HTML内容已清理`);

                // 使用iframe渲染完整HTML文档
                renderHTMLInInlineIframe(htmlContainer, cleanedHtml);
            } else {
                htmlContainer.innerHTML = `
                    <div class="no-html-content">
                        <div class="no-content-message">
                            <h3>📝 无HTML内容</h3>
                            <p>没有找到AI生成的HTML美化内容</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 内联HTML预览更新失败:`, error);
            htmlContainer.innerHTML = `
                <div class="error-content">
                    <div class="error-message">
                        <h3>⚠️ HTML渲染失败</h3>
                        <p>AI生成的HTML内容无法正确渲染</p>
                        <details>
                            <summary>错误详情</summary>
                            <pre>${escapeHtml(error.message)}</pre>
                        </details>
                    </div>
                </div>
            `;
        }
    }

    /**
     * 在内联iframe中渲染HTML
     */
    function renderHTMLInInlineIframe(container, htmlContent) {
        console.log(`[${EXTENSION_NAME}] 开始在内联iframe中渲染HTML`);

        // 清空容器
        container.innerHTML = '';

        // 创建iframe元素
        const iframe = document.createElement('iframe');
        iframe.className = 'inline-preview-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '25rem';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.backgroundColor = '#ffffff';

        // 将iframe添加到容器
        container.appendChild(iframe);

        // 获取iframe的document对象
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        // 写入HTML内容
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        // 监听iframe加载完成
        iframe.onload = () => {
            console.log(`[${EXTENSION_NAME}] 内联iframe HTML渲染完成`);

            // 自动调整iframe高度以适应内容
            try {
                const iframeBody = iframe.contentDocument.body;
                if (iframeBody) {
                    const contentHeight = Math.max(
                        iframeBody.scrollHeight,
                        iframeBody.offsetHeight,
                        iframe.contentDocument.documentElement.scrollHeight,
                        iframe.contentDocument.documentElement.offsetHeight
                    );

                    // 设置合理的高度范围
                    const finalHeight = Math.min(Math.max(contentHeight + 20, 200), 500);
                    iframe.style.height = (finalHeight / 16) + 'rem';

                    console.log(`[${EXTENSION_NAME}] 内联iframe高度调整为: ${(finalHeight / 16)}rem`);
                }
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 无法自动调整内联iframe高度:`, error);
            }
        };
    }

    /**
     * 更新内联文本对比
     */
    function updateInlineTextComparison(container, originalText, fullResult) {
        const beforeDisplay = container.querySelector('#before-text-display');
        const afterDisplay = container.querySelector('#after-text-display');

        if (beforeDisplay) {
            beforeDisplay.textContent = originalText || '（无原始内容）';
        }

        if (afterDisplay) {
            afterDisplay.textContent = fullResult || '（无结果内容）';
        }
    }

    /**
     * 切换预览模式
     */
    function switchPreviewMode(mode) {
        console.log(`[${EXTENSION_NAME}] 切换预览模式到: ${mode}`);

        const container = document.getElementById('inline-preview-container');
        if (!container) return;

        // 更新标签状态
        const tabs = container.querySelectorAll('.preview-tab');
        tabs.forEach(tab => {
            if (tab.dataset.mode === mode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // 更新内容显示
        const contents = container.querySelectorAll('.preview-mode-content');
        contents.forEach(content => {
            if (content.id === `${mode}-preview-mode`) {
                content.classList.add('active');
                content.style.display = 'block';
            } else {
                content.classList.remove('active');
                content.style.display = 'none';
            }
        });
    }

    /**
     * 隐藏内联预览
     */
    function hideInlinePreview() {
        console.log(`[${EXTENSION_NAME}] 隐藏内联预览`);

        const container = document.getElementById('inline-preview-container');
        if (container) {
            container.style.display = 'none';
            container.classList.remove('active');
        }
    }

    /**
     * 生成随机演示文本
     */
    function generateRandomDemoText() {
        const randomTexts = [
            `<state_bar><姓名>艾拉</姓名><称号>风之语者</称号><时间>午后</时间><地点>微风镇</地点><想法>今天的阳光真好。</想法><状态>轻松愉快</状态><好感度>友好 (50/100)</好感度><金钱>120G</金钱></state_bar>
你走进了微风镇的酒馆，阳光从窗户斜射进来，落在木质的地板上。酒馆老板正在擦拭着一个杯子，看到你进来，他抬起头笑了笑。

"欢迎光临！今天想喝点什么吗？"`,

            `<state_bar><姓名>雷恩</姓名><称号>剑士</称号><时间>黄昏</时间><地点>训练场</地点><想法>需要更多的练习。</想法><状态>专注</状态><好感度>中立 (30/100)</好感度><金钱>75G</金钱><体力>充沛</体力><等级>15</等级></state_bar>
训练场上，雷恩正在专心致志地练习剑术。汗水从他的额头滴落，但他的眼神依然坚定。

用户：你练得怎么样？

雷恩：还需要更多的努力。成为真正的剑士不是一朝一夕的事。`,

            `早上好！今天天气不错呢。

用户：今天有什么计划吗？

AI助手：我想我们可以一起去公园走走，或者在家里看看电影。你更喜欢哪个？

用户：去公园听起来不错。

AI助手：太好了！那我们准备一下就出发吧。`,

            `<state_bar><姓名>莉娜</姓名><称号>魔法师</称号><时间>深夜</时间><地点>法师塔</地点><想法>这个咒文很复杂。</想法><状态>思考中</状态><好感度>信任 (70/100)</好感度><金钱>200G</金钱><魔力>丰富</魔力><职业>高级法师</职业></state_bar>
夜晚的法师塔内，烛光摇曳。莉娜正在翻阅一本古老的魔法书，眉头微皱。

"这个传送咒文的核心原理竟然是..."她轻声自语道。`,

            `夜晚降临，城市开始亮起灯火。

角色：今天真是充实的一天。

系统：角色回到了自己的房间，准备休息。

角色：明天又会是新的开始。`
        ];

        return randomTexts[Math.floor(Math.random() * randomTexts.length)];
    }

    /**
     * 打开预览效果弹窗 - 保留旧版本以兼容其他地方的调用
     * 注意：现在主要使用内联预览 showInlinePreview() 函数
     */
    function openPreviewPopup(stateBarContent, mainContent, originalText, fullResult) {
        console.log(`[${EXTENSION_NAME}] 预览弹窗数据:`, {
            stateBarContent: stateBarContent ? stateBarContent.substring(0, 100) + '...' : 'null',
            mainContentLength: mainContent ? mainContent.length : 0,
            originalTextLength: originalText ? originalText.length : 0,
            fullResultLength: fullResult ? fullResult.length : 0
        });

        // 获取AI生成的HTML美化内容
        const aiGeneratedReplacement = document.getElementById('ai-generated-replacement')?.value || '';
        console.log(`[${EXTENSION_NAME}] AI生成的HTML美化内容:`, aiGeneratedReplacement.substring(0, 200) + '...');

        // 从 fullResult 中重新提取真实的状态栏和正文内容
        const realStateBarMatch = fullResult.match(/<state_bar>(.*?)<\/state_bar>/s);
        const realStateBarContent = realStateBarMatch ? realStateBarMatch[1] : '';
        const realMainContent = fullResult.replace(/<state_bar>.*?<\/state_bar>/s, '').trim();

        console.log(`[${EXTENSION_NAME}] 真实状态栏内容:`, realStateBarContent);
        console.log(`[${EXTENSION_NAME}] 真实正文内容:`, realMainContent);

        // 解析真实的状态栏内容
        const parsedStateBar = parseStateBarContent(realStateBarContent);
        console.log(`[${EXTENSION_NAME}] 解析后的状态栏HTML:`, parsedStateBar.html);

        // 创建弹窗HTML
        const popupHtml = `
            <div class="preview-popup-container">
                <div class="preview-popup-header">
                    <h3>预览效果</h3>
                </div>

                <div class="preview-content">
                    <!-- 统一渲染区域：直接渲染AI生成的HTML美化内容 -->
                    <div class="unified-content-section">
                        <h4>📱 渲染效果 (AI生成的HTML页面效果)</h4>
                        <div class="html-render-frame" id="html-render-container">
                            <!-- HTML内容将通过JavaScript动态插入 -->
                        </div>
                    </div>

                    <!-- 原始对比 -->
                    <div class="comparison-section">
                        <h4>🔍 效果对比</h4>
                        <div class="comparison-grid">
                            <div class="before-section">
                                <h5>应用前：</h5>
                                <div class="content-display-wrapper">
                                    <pre class="content-display">${escapeHtml(originalText)}</pre>
                                </div>
                            </div>
                            <div class="after-section">
                                <h5>应用后：</h5>
                                <div class="content-display-wrapper">
                                    <pre class="content-display">${escapeHtml(fullResult)}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 使用SillyTavern的弹窗系统
        if (callGenericPopup) {
            console.log(`[${EXTENSION_NAME}] 调用弹窗系统`);
            callGenericPopup(popupHtml, POPUP_TYPE.TEXT, '', {
                wide: true,
                large: true,
                allowVerticalScrolling: true,
                okButton: '关闭预览',
                onOpen: () => {
                    console.log(`[${EXTENSION_NAME}] 预览弹窗已打开，开始插入HTML内容`);

                    // 延迟插入HTML内容，确保DOM已渲染
                    setTimeout(() => {
                        const htmlContainer = document.getElementById('html-render-container');
                        if (htmlContainer && aiGeneratedReplacement) {
                            console.log(`[${EXTENSION_NAME}] 找到HTML容器，开始插入内容`);

                            try {
                                // 清理AI生成的HTML内容
                                const cleanedHtml = cleanAIGeneratedHTML(aiGeneratedReplacement);
                                console.log(`[${EXTENSION_NAME}] HTML内容已清理:`, cleanedHtml.substring(0, 200) + '...');

                                // 使用iframe渲染完整HTML文档
                                renderHTMLInIframe(htmlContainer, cleanedHtml);
                                console.log(`[${EXTENSION_NAME}] HTML内容已在iframe中渲染`);
                            } catch (error) {
                                console.error(`[${EXTENSION_NAME}] HTML内容插入失败:`, error);
                                htmlContainer.innerHTML = `
                                    <div style="padding: 1.25rem; color: #dc3545; text-align: center;">
                                        <h3>⚠️ HTML渲染失败</h3>
                                        <p>AI生成的HTML内容无法正确渲染</p>
                                        <pre style="background: #f8f9fa; padding: 0.625rem; border-radius: 4px; overflow: auto; max-height: 12.5rem; text-align: left;">
                                            ${escapeHtml(aiGeneratedReplacement)}
                                        </pre>
                                    </div>
                                `;
                            }
                        } else if (htmlContainer) {
                            console.warn(`[${EXTENSION_NAME}] 没有AI生成的HTML内容可以插入`);
                            htmlContainer.innerHTML = `
                                <div style="padding: 1.25rem; color: #6c757d; text-align: center;">
                                    <h3>📝 无HTML内容</h3>
                                    <p>没有找到AI生成的HTML美化内容</p>
                                </div>
                            `;
                        } else {
                            console.error(`[${EXTENSION_NAME}] 找不到HTML容器元素`);
                        }
                    }, 100);
                }
            });
        } else {
            console.error(`[${EXTENSION_NAME}] callGenericPopup 不可用`);
        }
    }

    /**
     * 在iframe中渲染完整HTML文档
     */
    function renderHTMLInIframe(container, htmlContent) {
        console.log(`[${EXTENSION_NAME}] 开始在iframe中渲染HTML`);

        // 清空容器
        container.innerHTML = '';

        // 创建iframe元素
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.minHeight = '400px';
        iframe.style.backgroundColor = '#ffffff';

        // 将iframe添加到容器
        container.appendChild(iframe);

        // 获取iframe的document对象
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        // 写入HTML内容
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        // 监听iframe加载完成
        iframe.onload = () => {
            console.log(`[${EXTENSION_NAME}] iframe HTML渲染完成`);

            // 自动调整iframe高度以适应内容
            try {
                const iframeBody = iframe.contentDocument.body;
                if (iframeBody) {
                    const contentHeight = Math.max(
                        iframeBody.scrollHeight,
                        iframeBody.offsetHeight,
                        iframe.contentDocument.documentElement.scrollHeight,
                        iframe.contentDocument.documentElement.offsetHeight
                    );

                    // 设置合理的高度范围
                    const finalHeight = Math.min(Math.max(contentHeight + 20, 200), 600);
                    iframe.style.height = (finalHeight / 16) + 'rem';

                    console.log(`[${EXTENSION_NAME}] iframe高度调整为: ${(finalHeight / 16)}rem`);
                }
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 无法自动调整iframe高度:`, error);
            }
        };

        console.log(`[${EXTENSION_NAME}] iframe创建并渲染完成`);
    }

    /**
     * 提取HTML文档中的body内容和样式
     */
    function extractBodyContent(htmlContent) {
        console.log(`[${EXTENSION_NAME}] 开始提取body内容`);

        if (!htmlContent || typeof htmlContent !== 'string') {
            console.warn(`[${EXTENSION_NAME}] HTML内容为空或格式无效`);
            return '<div style="padding: 1.25rem; color: #6c757d; text-align: center;">无HTML内容</div>';
        }

        // 创建临时DOM来解析HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // 提取样式
        let styles = '';
        const styleElements = tempDiv.querySelectorAll('style');
        styleElements.forEach(styleEl => {
            styles += styleEl.innerHTML + '\n';
        });

        // 提取body内容
        let bodyContent = '';
        const bodyElement = tempDiv.querySelector('body');
        if (bodyElement) {
            bodyContent = bodyElement.innerHTML;
            console.log(`[${EXTENSION_NAME}] 成功提取body内容`);
        } else {
            // 如果没有body标签，使用整个内容（但排除head内容）
            const headElement = tempDiv.querySelector('head');
            if (headElement) {
                headElement.remove();
            }
            bodyContent = tempDiv.innerHTML;
            console.log(`[${EXTENSION_NAME}] 没有找到body标签，使用整个内容`);
        }

        // 组合样式和内容
        let result = '';
        if (styles.trim()) {
            result += `<style>\n${styles}</style>\n`;
            console.log(`[${EXTENSION_NAME}] 添加了提取的CSS样式`);
        }
        result += bodyContent;

        console.log(`[${EXTENSION_NAME}] Body内容提取完成，最终长度:`, result.length);
        return result;
    }

    /**
     * 清理AI生成的HTML内容，移除额外的文本和格式
     */
    function cleanAIGeneratedHTML(htmlContent) {
        console.log(`[${EXTENSION_NAME}] 开始清理HTML内容`);

        if (!htmlContent || typeof htmlContent !== 'string') {
            console.warn(`[${EXTENSION_NAME}] HTML内容为空或格式无效`);
            return '';
        }

        let cleaned = htmlContent.trim();

        // 首先，分离HTML代码和正文内容
        // 查找HTML结束标签后的正文内容
        const htmlEndMatch = cleaned.match(/<\/html>\s*(.+)$/s);
        let separatedText = '';
        if (htmlEndMatch && htmlEndMatch[1]) {
            separatedText = htmlEndMatch[1].trim();
            // 移除HTML后的正文内容，只保留HTML部分
            cleaned = cleaned.replace(/<\/html>\s*(.+)$/s, '</html>');
            console.log(`[${EXTENSION_NAME}] 发现并分离了HTML后的正文内容:`, separatedText.substring(0, 100) + '...');
        }

        // 查找DOCTYPE声明的开始
        const doctypeIndex = cleaned.search(/<!DOCTYPE\s+html/i);
        if (doctypeIndex > 0) {
            // 如果DOCTYPE前面有其他内容，移除它们
            cleaned = cleaned.substring(doctypeIndex);
            console.log(`[${EXTENSION_NAME}] 移除了DOCTYPE前的额外内容`);
        } else if (doctypeIndex === -1) {
            // 如果没有DOCTYPE，查找<html>标签
            const htmlIndex = cleaned.search(/<html/i);
            if (htmlIndex > 0) {
                cleaned = cleaned.substring(htmlIndex);
                console.log(`[${EXTENSION_NAME}] 移除了<html>前的额外内容`);
            } else if (htmlIndex === -1) {
                // 如果没有完整HTML结构，查找主要内容
                const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) {
                    // 如果找到body内容，包装成完整HTML
                    cleaned = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        /* 响应式设计优化 */
        @media screen and (max-width: 480px) {
            .form-control {
                font-size: 1rem !important;
                padding: 0.75rem !important;
            }
            .ai-generate-btn {
                padding: 0.75rem 1rem !important;
                font-size: 0.9rem !important;
            }
            small {
                font-size: 0.8rem !important;
            }
        }
        
        @media screen and (min-width: 481px) and (max-width: 768px) {
            .form-control {
                font-size: 0.95rem !important;
            }
            .ai-generate-btn {
                font-size: 0.85rem !important;
            }
        }
        
        /* 高DPI设备优化 */
        @media screen and (-webkit-min-device-pixel-ratio: 2) {
            .form-control, .ai-generate-btn {
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
            }
        }
        
        /* 确保按钮和输入框在所有设备上有足够的触摸区域 */
        .ai-generate-btn, .form-control {
            min-height: 2.75rem;
            touch-action: manipulation;
        }
    </style>
    <title>状态栏预览</title>
</head>
<body>
${bodyMatch[1]}
</body>
</html>`;
                    console.log(`[${EXTENSION_NAME}] 提取并包装了body内容`);
                }
            }
        }

        // 查找HTML结束标签
        const htmlEndIndex = cleaned.lastIndexOf('</html>');
        if (htmlEndIndex !== -1) {
            // 确保HTML结构完整，不需要额外处理
            console.log(`[${EXTENSION_NAME}] HTML结构完整`);
        } else {
            // 如果HTML不完整，尝试自动补全
            if (cleaned.includes('<body>') && !cleaned.includes('</body>')) {
                cleaned += '</body></html>';
            } else if (cleaned.includes('<html>') && !cleaned.includes('</html>')) {
                cleaned += '</html>';
            }
            console.log(`[${EXTENSION_NAME}] 自动补全了HTML结构`);
        }

        // 移除可能的代码块标记
        cleaned = cleaned.replace(/^```html\s*/i, '').replace(/\s*```$/, '');

        // 移除JavaScript代码（出于安全考虑）
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');

        console.log(`[${EXTENSION_NAME}] HTML清理完成，最终长度:`, cleaned.length);
        console.log(`[${EXTENSION_NAME}] 清理后的HTML预览:`, cleaned.substring(0, 200) + '...');

        return cleaned;
    }

    /**
     * HTML转义函数
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 解析状态栏内容，支持更多标签类型
     */
    function parseStateBarContent(stateBarContent) {
        console.log(`[${EXTENSION_NAME}] 解析状态栏内容:`, stateBarContent);

        if (!stateBarContent || stateBarContent.trim() === '') {
            console.log(`[${EXTENSION_NAME}] 状态栏内容为空`);
            return { html: '<div class="no-status-bar">无状态栏内容</div>' };
        }

        let html = '<div class="status-bar-container">';
        let foundAnyItem = false;

        // 定义所有支持的状态栏标签及其图标
        const statusTags = [
            { tag: '角色', icon: '👤', class: 'name-item' },
            { tag: '姓名', icon: '👤', class: 'name-item' },
            { tag: '称号', icon: '🎭', class: 'title-item' },
            { tag: '时间', icon: '🕐', class: 'time-item' },
            { tag: '日期', icon: '📅', class: 'date-item' },
            { tag: '星期', icon: '📆', class: 'week-item' },
            { tag: '地点', icon: '📍', class: 'location-item' },
            { tag: '想法', icon: '💭', class: 'thought-item' },
            { tag: '状态', icon: '😊', class: 'mood-item' },
            { tag: '好感度', icon: '❤️', class: 'affection-item' },
            { tag: '金钱', icon: '💰', class: 'money-item' },
            { tag: '体力', icon: '💪', class: 'stamina-item' },
            { tag: '心情', icon: '🌟', class: 'emotion-item' },
            { tag: '等级', icon: '⭐', class: 'level-item' },
            { tag: '职业', icon: '⚔️', class: 'job-item' },
            { tag: '血量', icon: '🩸', class: 'hp-item' },
            { tag: '生命值', icon: '🩸', class: 'hp-item' },
            { tag: '魔力', icon: '🔮', class: 'mp-item' },
            { tag: '法力值', icon: '🔮', class: 'mp-item' }
        ];

        // 创建主要信息区域
        html += '<div class="main-status-items">';

        // 解析各种状态标签
        statusTags.forEach(({ tag, icon, class: className }) => {
            const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'g');
            const match = stateBarContent.match(regex);
            if (match) {
                const content = match[0].replace(new RegExp(`<${tag}>(.*?)<\/${tag}>`), '$1');
                html += `<div class="status-item ${className}">
                    <span class="status-icon">${icon}</span>
                    <span class="status-label">${tag}:</span>
                    <span class="status-value">${escapeHtml(content)}</span>
                </div>`;
                foundAnyItem = true;
                console.log(`[${EXTENSION_NAME}] 找到${tag}:`, content);
            }
        });

        html += '</div>';

        // 解析选项标签
        const optionMatches = stateBarContent.match(/<Options_\d+>(.*?)<\/Options_\d+>/g);
        if (optionMatches && optionMatches.length > 0) {
            html += '<div class="options-section"><h5>🎯 可选行动：</h5><div class="options-list">';
            optionMatches.forEach((match, index) => {
                const optionContent = match.replace(/<Options_\d+>(.*?)<\/Options_\d+>/, '$1');
                html += `<div class="option-item" data-option="${index + 1}">
                    <span class="option-number">${index + 1}</span>
                    <span class="option-text">${escapeHtml(optionContent)}</span>
                </div>`;
                foundAnyItem = true;
            });
            html += '</div></div>';
            console.log(`[${EXTENSION_NAME}] 找到 ${optionMatches.length} 个选项`);
        }

        html += '</div>';

        // 如果没有找到任何标准标签，显示原始内容
        if (!foundAnyItem) {
            console.log(`[${EXTENSION_NAME}] 未找到标准标签，显示原始内容`);
            html = `
                <div class="raw-state-bar">
                    <div class="raw-content-label">原始状态栏内容：</div>
                    <div class="raw-content-display">${escapeHtml(stateBarContent)}</div>
                </div>
            `;
        }

        console.log(`[${EXTENSION_NAME}] 最终状态栏HTML:`, html);
        return { html };
    }

    /**
     * 格式化正文内容
     */
    function formatMainContent(content) {
        if (!content.trim()) {
            return '<div class="empty-content">正文内容为空</div>';
        }

        // 简单的格式化：处理换行和对话
        return content
            .split('\n')
            .map(line => {
                const trimmed = line.trim();
                if (!trimmed) return '<br>';

                // 检查是否是对话格式
                if (trimmed.includes('：') || trimmed.includes(':')) {
                    const parts = trimmed.split(/：|:/);
                    if (parts.length >= 2) {
                        const speaker = parts[0].trim();
                        const content = parts.slice(1).join(':').trim();
                        return `<div class="dialogue-line">
                            <span class="speaker">${speaker}：</span>
                            <span class="content">${content}</span>
                        </div>`;
                    }
                }

                return `<div class="text-line">${trimmed}</div>`;
            })
            .join('');
    }

    /**
     * 为内容添加代码块包裹
     */
    function wrapWithCodeBlocks(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }

        const trimmedContent = content.trim();

        // 如果已经有代码块包裹，直接返回
        if (trimmedContent.startsWith('```') && trimmedContent.endsWith('```')) {
            console.log(`[${EXTENSION_NAME}] 内容已有代码块包裹，保持原样`);
            return content;
        }

        // 检测内容类型并添加适当的代码块包裹
        let wrappedContent;

        if (trimmedContent.toLowerCase().includes('<!doctype html') ||
            trimmedContent.toLowerCase().includes('<html') ||
            (trimmedContent.includes('<') && trimmedContent.includes('</') && trimmedContent.includes('>'))) {
            // HTML内容
            wrappedContent = '```html\n' + trimmedContent + '\n```';
            console.log(`[${EXTENSION_NAME}] 检测为HTML内容，添加html代码块包裹`);
        } else if (trimmedContent.includes('{') && trimmedContent.includes('}')) {
            // 可能是JSON或CSS内容
            wrappedContent = '```\n' + trimmedContent + '\n```';
            console.log(`[${EXTENSION_NAME}] 检测为结构化内容，添加普通代码块包裹`);
        } else {
            // 普通文本内容
            wrappedContent = '```\n' + trimmedContent + '\n```';
            console.log(`[${EXTENSION_NAME}] 添加普通代码块包裹`);
        }

        return wrappedContent;
    }

    /**
     * 应用AI生成的结果到手动创建页面
     */
    function applyAIResult() {
        console.log(`[${EXTENSION_NAME}] 应用AI生成的结果`);

        try {
            const aiPattern = document.getElementById('ai-generated-pattern')?.value || '';
            let aiReplacement = document.getElementById('ai-generated-replacement')?.value || '';

            if (!aiPattern) {
                showStatus('❌ 没有AI生成的正则表达式可以应用', true);
                return;
            }

            // 为替换内容添加代码块包裹
            if (aiReplacement) {
                aiReplacement = wrapWithCodeBlocks(aiReplacement);
                console.log(`[${EXTENSION_NAME}] 替换内容已处理，长度: ${aiReplacement.length}`);
            }

            // 切换到手动创建页面
            switchToPage('manual');

            // 填充到手动创建页面的表单
            const manualPattern = document.getElementById('regex-pattern');
            const manualReplacement = document.getElementById('regex-replacement');

            if (manualPattern) {
                manualPattern.value = aiPattern;
            }
            if (manualReplacement) {
                manualReplacement.value = aiReplacement;
            }

            // 触发验证
            if (manualPattern) {
                const event = new Event('input', { bubbles: true });
                manualPattern.dispatchEvent(event);
            }

            showStatus('✅ AI生成的结果已应用到手动创建页面（替换内容已添加代码块包裹）');

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 应用AI结果失败:`, error);
            showStatus(`❌ 应用失败: ${error.message}`, true);
        }
    }

    /**
     * 切换页面
     */
    function switchToPage(pageId) {
        console.log(`[${EXTENSION_NAME}] 切换到页面: ${pageId}`);

        // 增强移动端调试信息
        const isMobile = isMobileDevice();
        if (isMobile) {
            console.log(`[${EXTENSION_NAME}] 移动端页面切换开始`);
        }

        // 隐藏所有页面
        const pages = document.querySelectorAll('.page-content');
        console.log(`[${EXTENSION_NAME}] 找到 ${pages.length} 个页面内容区域`);
        pages.forEach((page, index) => {
            page.style.display = 'none';
            page.classList.remove('active');
            if (isMobile) {
                console.log(`[${EXTENSION_NAME}] 隐藏页面 ${index + 1}: ${page.id}`);
            }
        });

        // 显示目标页面
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.style.display = 'block';
            targetPage.classList.add('active');
            console.log(`[${EXTENSION_NAME}] 目标页面 page-${pageId} 已显示`);

            if (isMobile) {
                // 移动端额外检查页面可见性
                const rect = targetPage.getBoundingClientRect();
                console.log(`[${EXTENSION_NAME}] 移动端页面位置信息:`, {
                    visible: rect.height > 0 && rect.width > 0,
                    top: rect.top,
                    height: rect.height,
                    display: window.getComputedStyle(targetPage).display
                });
            }
        } else {
            console.error(`[${EXTENSION_NAME}] 找不到目标页面: page-${pageId}`);
        }

        // 更新标签状态
        const tabs = document.querySelectorAll('.tab-button');
        console.log(`[${EXTENSION_NAME}] 找到 ${tabs.length} 个标签按钮`);
        tabs.forEach((tab, index) => {
            tab.classList.remove('active');
            if (isMobile) {
                console.log(`[${EXTENSION_NAME}] 移除标签 ${index + 1} 的active状态: ${tab.id}`);
            }
        });

        const targetTab = document.getElementById(`tab-${pageId}`);
        if (targetTab) {
            targetTab.classList.add('active');
            console.log(`[${EXTENSION_NAME}] 目标标签 tab-${pageId} 已激活`);

            if (isMobile) {
                // 移动端检查标签按钮状态
                const tabRect = targetTab.getBoundingClientRect();
                console.log(`[${EXTENSION_NAME}] 移动端标签按钮状态:`, {
                    classes: targetTab.className,
                    visible: tabRect.height > 0 && tabRect.width > 0,
                    styles: {
                        background: window.getComputedStyle(targetTab).backgroundColor,
                        color: window.getComputedStyle(targetTab).color,
                        transform: window.getComputedStyle(targetTab).transform
                    }
                });
            }
        } else {
            console.error(`[${EXTENSION_NAME}] 找不到目标标签: tab-${pageId}`);
        }

        // 保存AI设置（如果在AI页面）
        if (pageId === 'ai') {
            saveAISettings();
        }

        // 更新变量显示（如果切换到变量页面）
        if (pageId === 'variables') {
            setTimeout(async () => {
                await variablesManager.updateVariablesDisplay();
            }, 100);
        }

        if (isMobile) {
            console.log(`[${EXTENSION_NAME}] 移动端页面切换完成: ${pageId}`);
        }
    }

    /**
     * 自动保存API配置到浏览器存储
     */
    function autoSaveAPIConfig() {
        try {
            const provider = document.getElementById('ai-provider')?.value;
            const geminiKey = document.getElementById('gemini-api-key')?.value;
            const geminiModel = document.getElementById('gemini-model')?.value;
            const customUrl = document.getElementById('custom-api-url')?.value;
            const customKey = document.getElementById('custom-api-key')?.value;
            const customModel = document.getElementById('custom-model')?.value;

            // 构建配置对象
            const config = {
                aiProvider: provider || extensionSettings.aiProvider,
                geminiApiKey: geminiKey || extensionSettings.geminiApiKey,
                defaultModel: geminiModel || extensionSettings.defaultModel,
                customApiUrl: customUrl || extensionSettings.customApiUrl,
                customApiKey: customKey || extensionSettings.customApiKey,
                customModel: customModel || extensionSettings.customModel,
                lastSaved: new Date().toISOString()
            };

            // 立即保存到localStorage作为临时缓存
            const localStorageKey = `${EXTENSION_NAME}_APIConfig`;
            localStorage.setItem(localStorageKey, JSON.stringify(config));

            // 更新内存中的设置
            if (provider) extensionSettings.aiProvider = provider;
            if (geminiKey) extensionSettings.geminiApiKey = geminiKey;
            if (geminiModel) extensionSettings.defaultModel = geminiModel;
            if (customUrl) extensionSettings.customApiUrl = customUrl;
            if (customKey) extensionSettings.customApiKey = customKey;
            if (customModel) extensionSettings.customModel = customModel;

            // 保存到SillyTavern全局设置
            saveSettings();

            // 显示保存成功指示器
            showAutoSaveIndicator(true);
            console.log(`[${EXTENSION_NAME}] API配置已自动保存`);
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 自动保存API配置失败:`, error);
            showAutoSaveIndicator(false);
        }
    }

    /**
     * 从浏览器存储加载API配置
     */
    function loadAPIConfigFromBrowser() {
        try {
            const localStorageKey = `${EXTENSION_NAME}_APIConfig`;
            const savedConfig = localStorage.getItem(localStorageKey);

            if (savedConfig) {
                const config = JSON.parse(savedConfig);
                console.log(`[${EXTENSION_NAME}] 从浏览器加载API配置:`, config);

                // 将保存的配置合并到extensionSettings
                Object.assign(extensionSettings, {
                    aiProvider: config.aiProvider || extensionSettings.aiProvider,
                    geminiApiKey: config.geminiApiKey || extensionSettings.geminiApiKey,
                    defaultModel: config.defaultModel || extensionSettings.defaultModel,
                    customApiUrl: config.customApiUrl || extensionSettings.customApiUrl,
                    customApiKey: config.customApiKey || extensionSettings.customApiKey,
                    customModel: config.customModel || extensionSettings.customModel
                });

                return true;
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 从浏览器加载API配置失败:`, error);
        }
        return false;
    }

    /**
     * 显示自动保存指示器
     */
    function showAutoSaveIndicator(success = true) {
        const indicator = document.getElementById('api-save-indicator');
        if (!indicator) return;

        indicator.style.display = 'inline-block';
        indicator.className = `save-indicator ${success ? 'success' : 'error'}`;
        indicator.textContent = success ? '✓ 已保存' : '✗ 保存失败';

        // 2秒后隐藏指示器
        setTimeout(() => {
            if (indicator) {
                indicator.style.display = 'none';
            }
        }, 2000);
    }

    /**
     * 保存AI设置（保持向后兼容）
     */
    function saveAISettings() {
        autoSaveAPIConfig();
    }

    /**
     * 显示对话历史
     */
    function showConversationHistory() {
        console.log(`[${EXTENSION_NAME}] 显示对话历史`);

        try {
            const history = conversationHistory.getHistory();

            if (history.length === 0) {
                showStatus('📝 暂无对话历史记录');
                return;
            }

            // 构建历史对话显示内容
            let historyHtml = `
                <div class="conversation-history-display">
                    <h4>💬 对话历史 (共${history.length}条)</h4>
                    <div class="history-list">
            `;

            history.forEach((entry, index) => {
                const date = new Date(entry.timestamp).toLocaleString('zh-CN');
                historyHtml += `
                    <div class="history-item">
                        <div class="history-header">
                            <span class="history-index">#${index + 1}</span>
                            <span class="history-time">${date}</span>
                        </div>
                        <div class="history-content">
                            <div class="user-prompt">
                                <strong>👤 用户：</strong>
                                <div class="prompt-text">${escapeHtml(entry.userPrompt)}</div>
                            </div>
                            <div class="ai-response">
                                <strong>🤖 AI：</strong>
                                <div class="response-text">${escapeHtml(entry.aiResponse.substring(0, 200))}${entry.aiResponse.length > 200 ? '...' : ''}</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            historyHtml += `
                    </div>
                </div>
            `;

            // 使用弹窗显示历史记录
            if (callGenericPopup) {
                callGenericPopup(historyHtml, POPUP_TYPE.TEXT, '', {
                    wide: true,
                    large: true,
                    allowVerticalScrolling: true,
                    okButton: '关闭'
                });
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 显示对话历史失败:`, error);
            showStatus('❌ 显示对话历史失败', true);
        }
    }

    /**
     * 清空对话历史
     */
    function clearConversationHistory() {
        console.log(`[${EXTENSION_NAME}] 清空对话历史`);

        try {
            const history = conversationHistory.getHistory();

            if (history.length === 0) {
                showStatus('📝 暂无对话历史记录');
                return;
            }

            // 确认清空
            if (callGenericPopup) {
                callGenericPopup(
                    `确定要清空所有对话历史吗？这将删除${history.length}条历史记录，此操作无法撤销。`,
                    POPUP_TYPE.CONFIRM,
                    '',
                    {
                        okButton: '确认清空',
                        cancelButton: '取消'
                    }
                ).then(result => {
                    if (result) {
                        conversationHistory.clearHistory();
                        showStatus('✅ 对话历史已清空');

                        // 触发历史显示更新
                        conversationHistory.updateHistoryDisplay();

                        // 清空AI提示输入框
                        const aiPrompt = document.getElementById('ai-prompt');
                        if (aiPrompt) {
                            aiPrompt.value = '';
                        }
                    }
                });
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 清空对话历史失败:`, error);
            showStatus('❌ 清空对话历史失败', true);
        }
    }

    /**
     * 检测是否为移动设备
     */
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    /**
     * 使用预先获取的表单数据处理插入正则表达式
     */
    async function handleInsertRegexWithData(formData, characterInfo) {
        console.log(`[${EXTENSION_NAME}] handleInsertRegexWithData 开始执行`);
        console.log(`[${EXTENSION_NAME}] 表单数据:`, formData);
        console.log(`[${EXTENSION_NAME}] 角色信息:`, characterInfo);

        try {
            // 1. 验证角色信息
            if (!characterInfo) {
                throw new Error('角色信息无效');
            }

            // 2. 验证表单数据（最小化验证，允许用户输入各种内容）
            const { scriptName, pattern, replacement, flags, affects } = formData;

            // 只做基本的存在性检查，不检查内容是否为"空"
            if (scriptName === undefined || scriptName === null) {
                throw new Error('脚本名称不能为undefined');
            }

            if (pattern === undefined || pattern === null) {
                throw new Error('正则表达式不能为undefined');
            }

            // 3. 验证正则表达式
            const validation = validateRegex(pattern, flags);
            console.log(`[${EXTENSION_NAME}] 正则验证结果:`, validation);
            if (!validation.isValid) {
                throw new Error(`正则表达式无效: ${validation.error}`);
            }

            // 4. 创建正则脚本对象
            console.log(`[${EXTENSION_NAME}] 创建正则脚本对象`);
            const regexScript = createRegexScript(scriptName, pattern, replacement);
            console.log(`[${EXTENSION_NAME}] 基础脚本对象:`, regexScript);

            // 5. 设置影响范围
            console.log(`[${EXTENSION_NAME}] 设置影响范围 (${affects})`);
            switch (affects) {
                case 'user':
                    regexScript.placement = [1]; // 仅用户输入
                    break;
                case 'ai':
                    regexScript.placement = [2]; // 仅AI输出
                    break;
                case 'all':
                    regexScript.placement = [1, 2, 3, 5]; // 所有内容
                    break;
                default:
                    regexScript.placement = [1, 2]; // 用户输入和AI输出
            }
            console.log(`[${EXTENSION_NAME}] 最终脚本对象:`, regexScript);

            // 6. 保存到角色
            console.log(`[${EXTENSION_NAME}] 保存正则脚本到角色`);
            await saveRegexScriptToCharacter(regexScript);
            console.log(`[${EXTENSION_NAME}] 正则脚本保存成功`);

            // 7. 保存用户偏好
            if (extensionSettings.rememberLastValues) {
                console.log(`[${EXTENSION_NAME}] 保存用户输入偏好`);
                extensionSettings.lastRegexPattern = pattern;
                extensionSettings.lastReplacement = replacement;
                extensionSettings.lastFlags = flags;
                saveSettings();
                console.log(`[${EXTENSION_NAME}] 用户偏好已保存`);
            }

            // 8. 显示成功状态
            console.log(`[${EXTENSION_NAME}] 显示成功状态`);

            // 显示成功提示
            if (toastr) {
                toastr.success(`正则脚本 "${scriptName}" 已添加到 ${characterInfo.name}`, '成功');
                console.log(`[${EXTENSION_NAME}] toastr成功提示已显示`);
            } else {
                console.warn(`[${EXTENSION_NAME}] toastr不可用`);
            }

            console.log(`[${EXTENSION_NAME}] 插入正则表达式流程完成，返回成功`);
            return true;

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 插入正则表达式失败:`, error);
            console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);

            if (toastr) {
                toastr.error(`保存失败: ${error.message}`, '错误');
            }

            return false;
        }
    }

    /**
     * 切换抽屉展开/收起状态
     */
    function toggleDrawer(element) {
        const drawer = element.parentElement;
        const content = drawer.querySelector('.inline-drawer-content');
        const icon = drawer.querySelector('.inline-drawer-icon');
        
        if (drawer.classList.contains('closed')) {
            // 展开
            drawer.classList.remove('closed');
            content.style.display = 'block';
            if (icon) {
                icon.style.transform = 'rotate(0deg)';
            }
        } else {
            // 收起
            drawer.classList.add('closed');
            content.style.display = 'none';
            if (icon) {
                icon.style.transform = 'rotate(-90deg)';
            }
        }
    }
    
    // 将toggleDrawer函数暴露到全局作用域，以便HTML onclick可以访问
    window.toggleDrawer = toggleDrawer;

    /**
     * 创建用户界面
     */
    function createUI() {
        console.log(`[${EXTENSION_NAME}] 创建用户界面`);
        
        // 创建设置面板HTML
        const settingsHtml = `
            <div id="${EXTENSION_NAME}-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-header" onclick="toggleDrawer(this)">
                        <h3>ST快速状态栏 - 正则表达式工具</h3>
                        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon"></div>
                    </div>
                    <div class="inline-drawer-content" style="display: block;">
                        <!-- 快速正则工具区域 -->
                        <div id="quick-regex-tools-container"></div>
                        
                        <!-- 基础设置 -->
                        <div class="marginBot5">
                            <label class="checkbox_label" for="STQuickStatusBar-enabled">
                                <input type="checkbox" id="STQuickStatusBar-enabled">
                                启用快速状态栏工具
                            </label>
                        </div>
                        
                        <div class="marginBot5">
                            <label class="checkbox_label" for="STQuickStatusBar-showPreview">
                                <input type="checkbox" id="STQuickStatusBar-showPreview">
                                显示测试预览功能
                            </label>
                        </div>
                        
                        <div class="marginBot5">
                            <label class="checkbox_label" for="STQuickStatusBar-rememberValues">
                                <input type="checkbox" id="STQuickStatusBar-rememberValues">
                                记住上次的输入值
                            </label>
                        </div>
                        
                        <small class="notes">
                            💡 提示：此扩展提供快速为当前角色添加正则表达式规则的功能，支持手动创建和AI生成两种模式。
                        </small>
                    </div>
                </div>
            </div>
        `;
        
        // 将设置面板添加到扩展设置页面
        $('#extensions_settings').append(settingsHtml);
        
        // 绑定设置项事件
        $('#STQuickStatusBar-enabled').prop('checked', extensionSettings.enabled).on('change', function() {
            extensionSettings.enabled = this.checked;
            updateUIState();
            saveSettings();
        });
        
        $('#STQuickStatusBar-showPreview').prop('checked', extensionSettings.showPreview).on('change', function() {
            extensionSettings.showPreview = this.checked;
            saveSettings();
        });
        
        $('#STQuickStatusBar-rememberValues').prop('checked', extensionSettings.rememberLastValues).on('change', function() {
            extensionSettings.rememberLastValues = this.checked;
            saveSettings();
        });
        
        // 初始化UI状态
        updateUIState();
        
        // 初始化快速正则工具
        initializeQuickRegexTools();
        
        console.log(`[${EXTENSION_NAME}] 用户界面创建完成`);
    }
    
    /**
     * 更新UI状态
     */
    function updateUIState() {
        const isEnabled = extensionSettings.enabled;
        
        // 更新工具区域的可见性
        const toolsContainer = document.getElementById('quick-regex-tools-container');
        if (toolsContainer) {
            if (isEnabled) {
                refreshQuickRegexTools();
            } else {
                toolsContainer.innerHTML = '<div style="text-align: center; padding: 1.25rem; color: var(--SmartThemeQuoteColor);">扩展已禁用</div>';
            }
        }
        
        console.log(`[${EXTENSION_NAME}] UI状态已更新，扩展状态: ${isEnabled ? '启用' : '禁用'}`);
    }
    
    /**
     * 初始化快速正则工具
     */
    function initializeQuickRegexTools() {
        console.log(`[${EXTENSION_NAME}] 初始化快速正则工具`);
        
        if (!extensionSettings.enabled) {
            console.log(`[${EXTENSION_NAME}] 扩展未启用，跳过工具初始化`);
            return;
        }
        
        refreshQuickRegexTools();
    }
    
    /**
     * 刷新快速正则工具内容
     */
    function refreshQuickRegexTools() {
        console.log(`[${EXTENSION_NAME}] 刷新快速正则工具`);
        
        const toolsContainer = document.getElementById('quick-regex-tools-container');
        if (!toolsContainer) {
            console.error(`[${EXTENSION_NAME}] 找不到工具容器元素`);
            return;
        }
        
        // 获取当前角色信息
        const characterInfo = getCurrentCharacterInfo();
        
        // 创建工具内容
        const toolsContent = createQuickRegexToolsContent(characterInfo);
        
        // 更新容器内容
        toolsContainer.innerHTML = toolsContent;
        
        // 绑定事件
        bindQuickRegexToolsEvents();
        
        // 更新历史记录显示
        setTimeout(() => {
            conversationHistory.updateHistoryDisplay();
        }, 100);
        
        console.log(`[${EXTENSION_NAME}] 快速正则工具内容已刷新`);
    }
    
    /**
     * 调试角色状态 - 帮助诊断角色检测问题
     */
    function debugCharacterState() {
        console.log(`[${EXTENSION_NAME}] === 角色状态调试信息 ===`);
        console.log(`this_chid:`, this_chid);
        console.log(`this_chid 类型:`, typeof this_chid);
        console.log(`characters 数组:`, characters);
        console.log(`characters 长度:`, characters?.length);
        console.log(`characters 是否为数组:`, Array.isArray(characters));
        
        if (typeof getContext === 'function') {
            try {
                const context = getContext();
                console.log(`getContext() 结果:`, context);
                console.log(`context.characterId:`, context.characterId);
                console.log(`context.characterId 类型:`, typeof context.characterId);
            } catch (error) {
                console.error(`调用 getContext() 失败:`, error);
            }
        } else {
            console.warn(`getContext 函数不可用`);
        }
        
        // 检查当前选择的角色
        if (this_chid !== undefined && this_chid !== null && characters && characters[this_chid]) {
            console.log(`当前角色 (通过 this_chid):`, characters[this_chid]);
            console.log(`角色名称:`, characters[this_chid].name);
            console.log(`角色头像:`, characters[this_chid].avatar);
        } else {
            console.warn(`无法通过 this_chid 获取角色`);
            
            // 尝试显示所有可用角色
            if (characters && Array.isArray(characters)) {
                console.log(`所有可用角色:`, characters.map((char, index) => ({
                    index,
                    name: char?.name,
                    avatar: char?.avatar
                })));
            }
        }
        
        console.log(`[${EXTENSION_NAME}] === 调试信息结束 ===`);
    }

    /**
     * 强制刷新角色信息（用于调试和手动刷新）
     */
    function forceRefreshCharacterInfo() {
        console.log(`[${EXTENSION_NAME}] 🔄 强制刷新角色信息`);
        
        // 重置缓存的角色信息
        if (typeof getContext === 'function') {
            const context = getContext();
            console.log(`[${EXTENSION_NAME}] 强制刷新 - 当前context:`, {
                characterId: context?.characterId,
                name2: context?.name2,
                chatId: context?.chatId
            });
        }
        
        console.log(`[${EXTENSION_NAME}] 强制刷新 - this_chid:`, this_chid);
        console.log(`[${EXTENSION_NAME}] 强制刷新 - characters长度:`, characters?.length);
        
        // 强制更新显示
        updateCharacterInfoDisplay();
        
        // 如果工具已经打开，也刷新工具内容
        const toolsContainer = document.getElementById('quick-regex-tools-container');
        if (toolsContainer && extensionSettings.enabled) {
            refreshQuickRegexTools();
        }
    }

    /**
     * 更新角色信息显示
     */
    function updateCharacterInfoDisplay() {
        console.log(`[${EXTENSION_NAME}] 更新角色信息显示`);
        
        // 调试输出
        debugCharacterState();
        
        // 如果工具已初始化，刷新内容
        const toolsContainer = document.getElementById('quick-regex-tools-container');
        if (toolsContainer && extensionSettings.enabled) {
            console.log(`[${EXTENSION_NAME}] 工具容器存在，开始刷新内容`);
            
            // 获取角色信息并记录
            const characterInfo = getCurrentCharacterInfo();
            console.log(`[${EXTENSION_NAME}] 获取到的角色信息:`, characterInfo);
            
            if (characterInfo) {
                console.log(`[${EXTENSION_NAME}] 角色检测成功 - ${characterInfo.name}`);
            } else {
                console.warn(`[${EXTENSION_NAME}] 角色检测失败 - 无角色信息`);
            }
            
            refreshQuickRegexTools();
            
            // 角色切换后，尝试恢复AI结果（延迟执行，确保UI更新完成）
            setTimeout(() => {
                restoreLatestAIResult();
            }, 300);

            // 更新变量页面显示（如果当前在变量页面）
            setTimeout(async () => {
                await variablesManager.updateVariablesDisplay();
            }, 400);
        } else {
            console.log(`[${EXTENSION_NAME}] 工具容器不存在或扩展未启用`);
        }
    }
    
    /**
     * 绑定快速正则工具事件
     */
    function bindQuickRegexToolsEvents() {
        console.log(`[${EXTENSION_NAME}] 绑定快速正则工具事件`);
        
        // 页面切换事件
        $(document).off('click', '#quick-regex-tools .tab-button').on('click', '#quick-regex-tools .tab-button', function() {
            const pageId = $(this).data('page');
            switchToPage(pageId);
        });
        
        // 表单验证事件
        $(document).off('input', '#regex-pattern, #regex-flags').on('input', '#regex-pattern, #regex-flags', function() {
            if (extensionSettings.autoValidate) {
                const pattern = $('#regex-pattern').val() || '';
                const flags = $('#regex-flags').val() || 'g';
                updateValidation(pattern, flags);
                if (extensionSettings.showPreview) {
                    updatePreview();
                }
            }
        });
        
        // 测试文本变化事件
        $(document).off('input', '#test-text').on('input', '#test-text', function() {
            if (extensionSettings.showPreview) {
                updatePreview();
            }
        });
        
        // 插入正则表达式按钮
        $(document).off('click', '#insert-regex-btn').on('click', '#insert-regex-btn', function() {
            handleInsertRegex();
        });
        
        // AI相关事件
        bindAIEvents();
        
        // 变量页面相关事件
        bindVariablesEvents();
        
        console.log(`[${EXTENSION_NAME}] 事件绑定完成`);
    }
    
    /**
     * 创建模型选择下拉菜单
     */
    function createModelSelectDropdown(models, modelType = 'custom') {
        console.log(`[${EXTENSION_NAME}] 创建模型选择下拉菜单，模型数量: ${models.length}，类型: ${modelType}`);

        const modelInputId = modelType === 'gemini' ? 'gemini-model' : 'custom-model';
        const modelInput = document.getElementById(modelInputId);
        if (!modelInput) {
            console.error(`[${EXTENSION_NAME}] 找不到模型隐藏输入框: ${modelInputId}`);
            return;
        }

        // 找到模型输入框的容器
        const modelContainer = modelInput.parentElement;
        if (!modelContainer) {
            console.error(`[${EXTENSION_NAME}] 找不到模型输入框的容器`);
            return;
        }

        // 移除旧的下拉菜单（如果存在）
        const existingSelect = modelContainer.querySelector('.model-select-dropdown');
        if (existingSelect) {
            existingSelect.remove();
        }

        // 创建下拉菜单
        const selectElement = document.createElement('select');
        selectElement.className = 'form-control model-select-dropdown';
        selectElement.id = `${modelType}-model-select-dropdown`;
        selectElement.style.marginTop = '0.3125rem';

        // 添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 请选择模型 --';
        selectElement.appendChild(defaultOption);

        // 添加模型选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name || model.id;
            
            // 如果模型有描述或额外信息，添加到title属性
            let titleInfo = [];
            if (model.description) {
                titleInfo.push(`描述: ${model.description}`);
            }
            if (model.version) {
                titleInfo.push(`版本: ${model.version}`);
            }
            if (model.inputTokenLimit) {
                titleInfo.push(`输入Token限制: ${model.inputTokenLimit}`);
            }
            if (model.created) {
                const createdDate = new Date(model.created * 1000).toLocaleDateString();
                titleInfo.push(`创建时间: ${createdDate}`);
            }
            
            if (titleInfo.length > 0) {
                option.title = titleInfo.join('\n');
            }
            
            selectElement.appendChild(option);
        });

        // 如果当前隐藏输入框有值，尝试在下拉菜单中选中对应项
        const currentValue = modelInput.value.trim();
        if (currentValue) {
            const matchingOption = Array.from(selectElement.options).find(opt => opt.value === currentValue);
            if (matchingOption) {
                selectElement.value = currentValue;
            }
        }

        // 添加选择事件监听
        selectElement.addEventListener('change', function() {
            const selectedValue = this.value;
            if (selectedValue) {
                modelInput.value = selectedValue;
                console.log(`[${EXTENSION_NAME}] 用户选择了${modelType}模型: ${selectedValue}`);
                
                // 触发隐藏输入框的change事件以保存配置
                const changeEvent = new Event('change', { bubbles: true });
                modelInput.dispatchEvent(changeEvent);
                
                showStatus(`✅ 已选择模型: ${selectedValue}`, false);
            } else {
                modelInput.value = '';
            }
        });

        // 在按钮后面插入下拉菜单
        const fetchButtonId = modelType === 'gemini' ? 'fetch-gemini-models' : 'fetch-custom-models';
        const fetchButton = document.getElementById(fetchButtonId);
        if (fetchButton && fetchButton.nextSibling) {
            modelContainer.insertBefore(selectElement, fetchButton.nextSibling);
        } else {
            modelContainer.appendChild(selectElement);
        }

        // 移除旧的说明文字（如果存在）
        const existingHelp = modelContainer.querySelector('.model-select-help');
        if (existingHelp) {
            existingHelp.remove();
        }

        console.log(`[${EXTENSION_NAME}] ${modelType}模型选择下拉菜单创建完成`);
    }

    /**
     * 处理获取Gemini模型列表
     */
    async function handleFetchGeminiModels() {
        console.log(`[${EXTENSION_NAME}] 开始获取Gemini模型列表`);

        try {
            const geminiKey = document.getElementById('gemini-api-key')?.value?.trim();
            const fetchButton = document.getElementById('fetch-gemini-models');
            
            if (!geminiKey) {
                showStatus('❌ 请先输入Gemini API Key', true);
                return;
            }

            // 显示加载状态
            const originalText = fetchButton.textContent;
            fetchButton.textContent = '获取中...';
            fetchButton.disabled = true;

            // 调用获取模型函数
            const models = await fetchGeminiModels(geminiKey);
            console.log(`[${EXTENSION_NAME}] 获取到 ${models.length} 个Gemini模型`);

            if (models.length === 0) {
                showStatus('⚠️ 未找到任何可用的Gemini模型', false);
            } else {
                // 创建模型选择下拉菜单
                createModelSelectDropdown(models, 'gemini');
                
                // 显示成功的toast提示
                if (toastr) {
                    toastr.success(`成功获取 ${models.length} 个Gemini模型`, '成功');
                }
                
                showStatus(`✅ 获取到 ${models.length} 个Gemini模型，请从下拉菜单中选择`);
                
                // 自动保存配置
                autoSaveAPIConfig();
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取Gemini模型列表失败:`, error);
            
            // 显示详细的错误弹窗
            const errorMessage = `获取Gemini模型列表失败：\n\n${error.message}\n\n请检查：\n• API Key是否正确\n• 网络连接是否正常\n• Gemini API服务是否可用`;
            
            console.log(`[${EXTENSION_NAME}] 准备显示弹窗，callGenericPopup可用性:`, typeof callGenericPopup);
            if (callGenericPopup) {
                console.log(`[${EXTENSION_NAME}] 调用弹窗，错误信息:`, errorMessage);
                callGenericPopup(errorMessage, POPUP_TYPE.TEXT, '', {
                    wide: false,
                    large: false,
                    allowVerticalScrolling: true
                }).then(() => {
                    console.log(`[${EXTENSION_NAME}] 弹窗已显示`);
                }).catch(popupError => {
                    console.error(`[${EXTENSION_NAME}] 弹窗显示失败:`, popupError);
                });
            } else {
                console.warn(`[${EXTENSION_NAME}] callGenericPopup不可用，使用alert代替`);
                alert(errorMessage);
            }
            
            // 显示toast提示
            console.log(`[${EXTENSION_NAME}] 准备显示toast，toastr可用性:`, typeof toastr);
            if (toastr) {
                toastr.error('获取Gemini模型失败', '错误');
                console.log(`[${EXTENSION_NAME}] toast已显示`);
            } else {
                console.warn(`[${EXTENSION_NAME}] toastr不可用`);
            }
            
            showStatus(`❌ 获取Gemini模型失败: ${error.message}`, true);
        } finally {
            // 恢复按钮状态
            const fetchButton = document.getElementById('fetch-gemini-models');
            if (fetchButton) {
                fetchButton.textContent = '获取Gemini模型列表';
                fetchButton.disabled = false;
            }
        }
    }

    /**
     * 处理获取自定义模型列表
     */
    async function handleFetchCustomModels() {
        console.log(`[${EXTENSION_NAME}] 开始获取自定义模型列表`);

        try {
            const customUrl = document.getElementById('custom-api-url')?.value?.trim();
            const customKey = document.getElementById('custom-api-key')?.value?.trim();
            const fetchButton = document.getElementById('fetch-custom-models');
            
            if (!customUrl) {
                showStatus('❌ 请先输入API基础URL', true);
                return;
            }
            
            if (!customKey) {
                showStatus('❌ 请先输入API Key', true);
                return;
            }

            // 显示加载状态
            const originalText = fetchButton.textContent;
            fetchButton.textContent = '获取中...';
            fetchButton.disabled = true;

            // 调用获取模型函数
            const models = await fetchCustomModels(customUrl, customKey);
            console.log(`[${EXTENSION_NAME}] 获取到 ${models.length} 个模型`);

            if (models.length === 0) {
                showStatus('⚠️ 未找到任何可用模型', false);
            } else {
                // 创建模型选择下拉菜单
                createModelSelectDropdown(models, 'custom');
                
                // 显示成功的toast提示
                if (toastr) {
                    toastr.success(`成功获取 ${models.length} 个自定义API模型`, '成功');
                }
                
                showStatus(`✅ 获取到 ${models.length} 个模型，请从下拉菜单中选择`);
                
                // 自动保存配置
                autoSaveAPIConfig();
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取模型列表失败:`, error);
            
            // 显示详细的错误弹窗
            const errorMessage = `获取自定义API模型列表失败：\n\n${error.message}\n\n请检查：\n• API基础URL是否正确\n• API Key是否有效\n• 网络连接是否正常\n• API服务是否支持/models端点`;
            
            console.log(`[${EXTENSION_NAME}] 准备显示弹窗，callGenericPopup可用性:`, typeof callGenericPopup);
            if (callGenericPopup) {
                console.log(`[${EXTENSION_NAME}] 调用弹窗，错误信息:`, errorMessage);
                callGenericPopup(errorMessage, POPUP_TYPE.TEXT, '', {
                    wide: false,
                    large: false,
                    allowVerticalScrolling: true
                }).then(() => {
                    console.log(`[${EXTENSION_NAME}] 弹窗已显示`);
                }).catch(popupError => {
                    console.error(`[${EXTENSION_NAME}] 弹窗显示失败:`, popupError);
                });
            } else {
                console.warn(`[${EXTENSION_NAME}] callGenericPopup不可用，使用alert代替`);
                alert(errorMessage);
            }
            
            // 显示toast提示
            console.log(`[${EXTENSION_NAME}] 准备显示toast，toastr可用性:`, typeof toastr);
            if (toastr) {
                toastr.error('获取自定义API模型失败', '错误');
                console.log(`[${EXTENSION_NAME}] toast已显示`);
            } else {
                console.warn(`[${EXTENSION_NAME}] toastr不可用`);
            }
            
            showStatus(`❌ 获取模型失败: ${error.message}`, true);
        } finally {
            // 恢复按钮状态
            const fetchButton = document.getElementById('fetch-custom-models');
            if (fetchButton) {
                fetchButton.textContent = '获取模型列表';
                fetchButton.disabled = false;
            }
        }
    }

    /**
     * 绑定AI相关事件
     */
    function bindAIEvents() {
        // API提供商切换
        $(document).off('change', '#ai-provider').on('change', '#ai-provider', function() {
            const provider = $(this).val();
            switchAPIProvider(provider);
            autoSaveAPIConfig();
        });
        
        // API配置自动保存
        const apiConfigSelectors = '#gemini-api-key, #gemini-model, #custom-api-url, #custom-api-key, #custom-model';
        $(document).off('input change', apiConfigSelectors).on('input change', apiConfigSelectors, function() {
            autoSaveAPIConfig();
        });
        
        // AI生成按钮
        $(document).off('click', '#generate-regex').on('click', '#generate-regex', function() {
            handleAIGenerate();
        });
        
        // 预览AI结果
        $(document).off('click', '#preview-ai-result').on('click', '#preview-ai-result', function() {
            previewAIResult();
        });
        
        // 应用AI结果
        $(document).off('click', '#apply-ai-result').on('click', '#apply-ai-result', function() {
            applyAIResult();
        });
        
        // 获取Gemini模型列表
        $(document).off('click', '#fetch-gemini-models').on('click', '#fetch-gemini-models', function() {
            handleFetchGeminiModels();
        });
        
        // 获取自定义模型列表
        $(document).off('click', '#fetch-custom-models').on('click', '#fetch-custom-models', function() {
            handleFetchCustomModels();
        });
        
        // 对话历史管理
        $(document).off('click', '#view-conversation-history').on('click', '#view-conversation-history', function() {
            showConversationHistory();
        });
        
        $(document).off('click', '#clear-conversation-history').on('click', '#clear-conversation-history', function() {
            clearConversationHistory();
        });
    }
    
    /**
     * 绑定变量页面相关事件
     */
    function bindVariablesEvents() {
        // 添加变量按钮
        $(document).off('click', '#add-variable-btn').on('click', '#add-variable-btn', function() {
            handleAddVariable();
        });
        
        // 查看变量按钮
        $(document).off('click', '#view-variables-btn').on('click', '#view-variables-btn', async function() {
            await variablesManager.openVariablesEditor();
        });
        
        // 导出变量按钮
        $(document).off('click', '#export-variables-btn').on('click', '#export-variables-btn', async function() {
            await handleExportVariables();
        });
        
        // 导入变量按钮
        $(document).off('click', '#import-variables-btn').on('click', '#import-variables-btn', function() {
            document.getElementById('import-file-input').click();
        });
        
        // 文件选择事件
        $(document).off('change', '#import-file-input').on('change', '#import-file-input', function(event) {
            handleImportVariables(event);
        });
        
        // 编辑器关闭按钮
        $(document).off('click', '#editor-close-btn').on('click', '#editor-close-btn', function() {
            variablesManager.closeVariablesEditor();
        });
        
        // 编辑器刷新按钮
        $(document).off('click', '#editor-refresh-btn').on('click', '#editor-refresh-btn', function() {
            variablesManager.renderVariablesToEditor();
            showStatus('变量列表已刷新');
        });
        
        // 编辑器清空所有按钮
        $(document).off('click', '#editor-clear-all-btn').on('click', '#editor-clear-all-btn', async function() {
            await handleClearAllVariables();
        });
        
        // 编辑器搜索输入
        $(document).off('input', '#variables-search-input').on('input', '#variables-search-input', async function() {
            const searchText = this.value;
            await variablesManager.searchVariables(searchText);
        });
        // 类型过滤
        $(document).off('change', '#variables-type-filter').on('change', '#variables-type-filter', async function() {
            const searchText = $('#variables-search-input').val() || '';
            await variablesManager.renderVariablesToEditor(String(searchText));
        });
        
        // 点击编辑器覆盖层关闭编辑器（点击背景关闭）
        $(document).off('click', '#variables-editor-overlay').on('click', '#variables-editor-overlay', function(event) {
            if (event.target === this) {
                variablesManager.closeVariablesEditor();
            }
        });
        
        // 页面切换到变量页面时更新显示
        $(document).off('click', '#tab-variables').on('click', '#tab-variables', function() {
            setTimeout(async () => {
                await variablesManager.updateVariablesDisplay();
            }, 100);
        });
    }

    /**
     * 处理添加变量 - 支持异步
     */
    async function handleAddVariable() {
        try {
            const name = document.getElementById('variable-name')?.value?.trim();
            const value = document.getElementById('variable-value')?.value || '';
            const description = document.getElementById('variable-description')?.value?.trim() || '';
            const insertType = (document.getElementById('variable-type')?.value || 'plugin').toLowerCase();

            if (!name) {
                showStatus('变量名不能为空', true);
                return;
            }

            const variable = await variablesManager.addVariable(name, value, description, insertType);
            if (variable) {
                // 清空表单
                document.getElementById('variable-name').value = '';
                document.getElementById('variable-value').value = '';
                document.getElementById('variable-description').value = '';
                // 类型不清空，便于连续添加同类
                
                const typeLabel = insertType === 'generic' ? '通用变量' : (insertType === 'both' ? '插件+通用变量' : '插件变量');
                showStatus(`变量 "${name}" 已添加（${typeLabel}）`);
                
                if (toastr) {
                    toastr.success(`变量 "${name}" 已添加（${typeLabel}）`, '成功');
                }
            } else {
                showStatus('添加变量失败', true);
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 添加变量失败:`, error);
            const msg = error?.message ? `添加变量失败：${error.message}` : '添加变量失败';
            showStatus(msg, true);
        }
    }

    /**
     * 处理清空所有变量
     */
    async function handleClearAllVariables() {
        try {
            const variables = await variablesManager.getSessionVariables();
            
            if (variables.length === 0) {
                showStatus('📝 当前会话暂无变量');
                return;
            }

            if (callGenericPopup) {
                callGenericPopup(
                    `确定要清空当前会话的所有 ${variables.length} 个变量吗？此操作无法撤销。`,
                    POPUP_TYPE.CONFIRM,
                    '',
                    {
                        okButton: '清空',
                        cancelButton: '取消'
                    }
                ).then(async result => {
                    if (result) {
                        const success = await variablesManager.clearSessionVariables();
                        if (success) {
                            showStatus('所有变量已清空');
                            if (toastr) {
                                toastr.success('所有变量已清空', '成功');
                            }
                        } else {
                            showStatus('清空变量失败', true);
                        }
                    }
                });
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 清空变量失败:`, error);
            showStatus('清空变量失败', true);
        }
    }

    /**
     * 处理导出变量
     */
    async function handleExportVariables() {
        try {
            const variables = await variablesManager.getSessionVariables();
            
            if (variables.length === 0) {
                showStatus('当前会话暂无变量可导出');
                return;
            }

            const success = variablesManager.exportSessionVariables();
            if (success) {
                showStatus(`已导出 ${variables.length} 个变量`);
                if (toastr) {
                    toastr.success(`已导出 ${variables.length} 个变量`, '导出成功');
                }
            } else {
                showStatus('导出变量失败', true);
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 导出变量失败:`, error);
            showStatus('导出变量失败', true);
        }
    }

    /**
     * 处理导入变量
     */
    function handleImportVariables(event) {
        try {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
                showStatus('请选择 JSON 格式的文件', true);
                return;
            }

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const jsonData = e.target.result;
                    const importCount = await variablesManager.importVariables(jsonData);
                    
                    if (importCount > 0) {
                        showStatus(`成功导入 ${importCount} 个变量`);
                        if (toastr) {
                            toastr.success(`成功导入 ${importCount} 个变量`, '导入成功');
                        }
                    } else {
                        showStatus('⚠️ 没有导入任何变量', false);
                    }
                } catch (error) {
                    console.error(`[${EXTENSION_NAME}] 解析导入文件失败:`, error);
                    showStatus('导入文件格式错误', true);
                }
            };
            
            reader.onerror = function() {
                showStatus('读取文件失败', true);
            };
            
            reader.readAsText(file);
            
            // 清空文件选择器
            event.target.value = '';
            
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 导入变量失败:`, error);
            showStatus('导入变量失败', true);
        }
    }
    
    /**
     * 切换API提供商
     */
    function switchAPIProvider(provider) {
        $('.api-config').hide();
        if (provider === 'gemini') {
            $('#gemini-config').show();
        } else if (provider === 'custom') {
            $('#custom-config').show();
        }
    }
    
    /**
     * 处理插入正则表达式
     */
    async function handleInsertRegex() {
        console.log(`[${EXTENSION_NAME}] 处理插入正则表达式`);
        
        try {
            // 获取当前角色信息
            const characterInfo = getCurrentCharacterInfo();
            if (!characterInfo) {
                showStatus('请先选择一个角色', true);
                return;
            }
            
            // 收集表单数据
            const formData = {
                scriptName: $('#regex-script-name').val() || '',
                pattern: $('#regex-pattern').val() || '',
                replacement: $('#regex-replacement').val() || '',
                flags: $('#regex-flags').val() || 'g',
                affects: $('#regex-affects').val() || 'both'
            };
            
            // 调用处理函数
            const success = await handleInsertRegexWithData(formData, characterInfo);
            
            if (success) {
                showStatus('正则表达式已成功添加');
                
                // 清空表单（可选）
                if (!extensionSettings.rememberLastValues) {
                    $('#regex-script-name').val('快速正则' + Date.now());
                    $('#regex-pattern').val('');
                    $('#regex-replacement').val('');
                }
            }
            
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 插入正则表达式失败:`, error);
            showStatus(`插入失败: ${error.message}`, true);
        }
    }

    /**
     * 注册斜杠命令
     */
    function registerSlashCommands() {
        if (typeof SlashCommandParser === 'undefined') {
            console.warn(`[${EXTENSION_NAME}] 斜杠命令系统不可用`);
            return;
        }

        SlashCommandParser.addCommandObject({
            name: 'st-status-bar',
            callback: () => {
                if (extensionSettings.enabled) {
                    // 直接滚动到设置页面的快速正则工具区域
                    const toolsSection = document.getElementById('quick-regex-tools');
                    if (toolsSection) {
                        toolsSection.scrollIntoView({ behavior: 'smooth' });
                        return 'ST快速状态栏工具已定位到设置页面';
                    } else {
                        return 'ST快速状态栏工具未找到，请检查扩展设置';
                    }
                } else {
                    return 'ST快速状态栏已禁用';
                }
            },
            returns: 'string',
            helpString: '定位到ST快速状态栏工具设置',
        });

        console.log(`[${EXTENSION_NAME}] 斜杠命令已注册: /st-status-bar`);
    }

    /**
     * 初始化角色切换事件监听（纯事件驱动版本）
     */
    function initializeCharacterEventListeners() {
        console.log(`[${EXTENSION_NAME}] 初始化角色切换事件监听器（纯事件驱动模式）`);
        
        // 清除所有之前的监听器
        $(document).off('.STQuickStatusBar');
        
        // 检查事件系统是否可用
        if (!eventSource || !event_types) {
            console.error(`[${EXTENSION_NAME}] eventSource 或 event_types 未导入，无法设置标准事件监听`);
            console.log(`[${EXTENSION_NAME}] eventSource:`, typeof eventSource);
            console.log(`[${EXTENSION_NAME}] event_types:`, typeof event_types); 
            return;
        }

        // 使用SillyTavern标准事件系统
        console.log(`[${EXTENSION_NAME}] 设置SillyTavern标准事件监听`);
        
        // 1. 监听聊天切换事件 - 最重要的事件
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                console.log(`[${EXTENSION_NAME}] ✅ 检测到聊天切换事件 (CHAT_CHANGED)`);
                setTimeout(() => updateCharacterInfoDisplay(), 150);
            });
        }
        
        // 2. 监听角色选择事件
        eventSource.on('character_selected', () => {
            console.log(`[${EXTENSION_NAME}] ✅ 检测到角色选择事件 (character_selected)`);
            setTimeout(() => updateCharacterInfoDisplay(), 100);
        });
        
        // 3. 监听角色加载事件
        eventSource.on('character_loaded', () => {
            console.log(`[${EXTENSION_NAME}] ✅ 检测到角色加载事件 (character_loaded)`);
            setTimeout(() => updateCharacterInfoDisplay(), 200);
        });
        
        // 4. 监听角色编辑事件
        eventSource.on('character_edited', () => {
            console.log(`[${EXTENSION_NAME}] ✅ 检测到角色编辑事件 (character_edited)`);
            updateCharacterInfoDisplay();
        });
        
        // 5. 作为备用的jQuery事件监听（保持兼容性）
        console.log(`[${EXTENSION_NAME}] 设置备用jQuery事件监听`);
        
        $(document).on('character_selected.STQuickStatusBar', () => {
            console.log(`[${EXTENSION_NAME}] 🔄 jQuery备用: character_selected`);
            setTimeout(() => updateCharacterInfoDisplay(), 150);
        });
        
        $(document).on('chat_changed.STQuickStatusBar', () => {
            console.log(`[${EXTENSION_NAME}] 🔄 jQuery备用: chat_changed`);
            setTimeout(() => updateCharacterInfoDisplay(), 150);
        });
        
        $(document).on('character_edited.STQuickStatusBar', () => {
            console.log(`[${EXTENSION_NAME}] 🔄 jQuery备用: character_edited`);
            updateCharacterInfoDisplay();
        });
        
        $(document).on('character_loaded.STQuickStatusBar', () => {
            console.log(`[${EXTENSION_NAME}] 🔄 jQuery备用: character_loaded`);
            setTimeout(() => updateCharacterInfoDisplay(), 200);
        });
        
        console.log(`[${EXTENSION_NAME}] ✅ 角色事件监听器初始化完成 - 纯事件驱动模式`);
        console.log(`[${EXTENSION_NAME}] 🚫 已完全移除所有定时器、轮询和MutationObserver`);
        console.log(`[${EXTENSION_NAME}] 📋 依赖SillyTavern标准事件系统进行角色切换检测`);
    }

    /**
     * 清理事件监听器（纯事件驱动版本）
     */
    function cleanupEventListeners() {
        console.log(`[${EXTENSION_NAME}] 清理事件监听器`);
        
        // 清理jQuery事件监听器
        $(document).off('.STQuickStatusBar');
        
        // 清理eventSource事件监听器
        if (eventSource && typeof eventSource.off === 'function') {
            // 清理SillyTavern标准事件
            if (event_types && event_types.CHAT_CHANGED) {
                eventSource.off(event_types.CHAT_CHANGED);
            }
            eventSource.off('character_selected');
            eventSource.off('character_loaded');
            eventSource.off('character_edited');
            console.log(`[${EXTENSION_NAME}] eventSource事件监听器已清理`);
        }
        
        console.log(`[${EXTENSION_NAME}] 所有事件监听器已清理 - 无定时器需要清理`);
    }

    /**
     * 恢复最新的AI生成结果
     */
    function restoreLatestAIResult() {
        console.log(`[${EXTENSION_NAME}] 检查是否需要恢复AI生成结果`);

        try {
            // 检查是否启用了历史记录功能
            if (!extensionSettings.enableConversationHistory) {
                console.log(`[${EXTENSION_NAME}] 历史记录功能未启用，跳过恢复`);
                return;
            }

            // 获取最新的历史记录
            const history = conversationHistory.getHistory();
            if (history.length === 0) {
                console.log(`[${EXTENSION_NAME}] 没有历史记录，跳过恢复`);
                return;
            }

            const latestEntry = history[0]; // 最新的记录在数组开头
            console.log(`[${EXTENSION_NAME}] 找到最新历史记录:`, {
                id: latestEntry.id,
                timestamp: latestEntry.timestamp,
                hasUserPrompt: !!latestEntry.userPrompt,
                hasAIResponse: !!latestEntry.aiResponse
            });

            if (!latestEntry.aiResponse || !latestEntry.aiResponse.trim()) {
                console.log(`[${EXTENSION_NAME}] 最新记录没有AI回复，跳过恢复`);
                return;
            }

            // 恢复AI提示输入框内容
            const aiPromptElement = document.getElementById('ai-prompt');
            if (aiPromptElement && latestEntry.userPrompt) {
                aiPromptElement.value = latestEntry.userPrompt;
                console.log(`[${EXTENSION_NAME}] 已恢复AI提示输入框内容`);
            }

            // 恢复AI原始回复
            const rawResponseElement = document.getElementById('ai-raw-response');
            if (rawResponseElement) {
                rawResponseElement.value = latestEntry.aiResponse;
                console.log(`[${EXTENSION_NAME}] 已恢复AI原始回复内容`);
            }

            // 使用parseAIResponse函数解析AI回复
            const { regexPattern, replacementContent, exampleContent } = parseAIResponse(latestEntry.aiResponse);
            console.log(`[${EXTENSION_NAME}] 解析AI回复结果:`, {
                hasRegexPattern: !!regexPattern,
                hasReplacementContent: !!replacementContent,
                hasExampleContent: !!exampleContent
            });

            // 恢复AI生成的正则表达式
            const patternElement = document.getElementById('ai-generated-pattern');
            if (patternElement && regexPattern) {
                patternElement.value = regexPattern;
                console.log(`[${EXTENSION_NAME}] 已恢复AI生成的正则表达式`);
            }

            // 恢复AI生成的替换内容
            const replacementElement = document.getElementById('ai-generated-replacement');
            if (replacementElement && replacementContent) {
                replacementElement.value = replacementContent;
                console.log(`[${EXTENSION_NAME}] 已恢复AI生成的替换内容`);
            }

            // 恢复示例正文内容
            const demoTextElement = document.getElementById('demo-text');
            if (demoTextElement && exampleContent) {
                // 只有在当前为空或者是默认内容时才恢复
                const currentContent = demoTextElement.value.trim();
                const defaultContent = "这是一段示例对话正文。\n\n用户：今天感觉怎么样？\n\nAI：我今天心情不错，准备和朋友一起出去逛街。你有什么计划吗？";
                if (!currentContent || currentContent === defaultContent) {
                    demoTextElement.value = exampleContent;
                    console.log(`[${EXTENSION_NAME}] 已恢复示例正文内容`);
                } else {
                    console.log(`[${EXTENSION_NAME}] 保留现有的正文内容，不覆盖`);
                }
            }

            // 显示AI结果区域
            const resultSection = document.querySelector('.ai-result-section');
            if (resultSection) {
                resultSection.style.display = 'block';
                console.log(`[${EXTENSION_NAME}] 已显示AI结果区域`);
            }

            // 更新历史记录显示
            conversationHistory.updateHistoryDisplay();

            // 显示恢复成功的状态
            showStatus('🔄 已自动恢复上次的AI生成结果', false);
            console.log(`[${EXTENSION_NAME}] ✅ AI结果恢复完成`);

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 恢复AI结果时发生错误:`, error);
            showStatus(`❌ 恢复AI结果失败: ${error.message}`, true);
        }
    }

    /**
     * 初始化扩展
     */
    async function initializeExtension() {
        if (isInitialized) {
            console.warn(`[${EXTENSION_NAME}] 扩展已经初始化过了`);
            return;
        }

        console.log(`[${EXTENSION_NAME}] 开始初始化扩展...`);

        try {
            // 导入SillyTavern模块
            const moduleImportSuccess = await importSillyTavernModules();
            if (!moduleImportSuccess) {
                throw new Error('无法导入必要的SillyTavern模块');
            }

            // 初始化变量存储（与核心宏一致）
            try {
                variablesManager.initializeStorage();
                console.log(`[${EXTENSION_NAME}] 变量管理器初始化完成`);
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] 变量管理器初始化失败:`, error);
            }

            // 加载设置
            loadSettings();

            // 创建用户界面
            createUI();

            // 初始化角色事件监听
            initializeCharacterEventListeners();

            // 注册斜杠命令
            registerSlashCommands();

            // 尝试恢复最新的AI生成结果
            setTimeout(() => {
                restoreLatestAIResult();
            }, 500); // 延迟执行，确保UI完全加载

            isInitialized = true;
            console.log(`[${EXTENSION_NAME}] 扩展初始化完成`);

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 初始化失败:`, error);
        }
    }

    /**
     * 清理扩展资源
     */
    function cleanup() {
        // 清理UI元素
        $(`#${EXTENSION_NAME}-settings`).remove();
        
        // 清理事件监听器
        cleanupEventListeners();
        
        // 重置初始化状态
        isInitialized = false;
        
        console.log(`[${EXTENSION_NAME}] 扩展资源已清理`);
    }

    // 扩展模块导出
    window[EXTENSION_NAME] = {
        name: EXTENSION_NAME,
        displayName: EXTENSION_DISPLAY_NAME,
        version: '1.0.0',
        settings: extensionSettings,
        initialize: initializeExtension,
        cleanup: cleanup,
        isInitialized: () => isInitialized,
        // 新增的工具函数
        updateCharacterInfo: updateCharacterInfoDisplay,
        refreshTools: refreshQuickRegexTools,
        restoreAIResult: restoreLatestAIResult, // 新增：恢复AI结果功能
        // 调试函数 - 用户可以在控制台调用 STQuickStatusBar.debug() 来诊断问题
        debug: debugCharacterState,
        // 手动获取角色信息 - 用于测试
        getCurrentCharacter: getCurrentCharacterInfo,
        // 强制刷新角色信息 - 用于调试角色切换问题
        forceRefresh: forceRefreshCharacterInfo,
        // 历史对话管理 - 用于测试和调试
        conversationHistory: conversationHistory,
        // 测试历史对话功能
        testHistoryFunction: () => {
            console.log(`[${EXTENSION_NAME}] 测试历史对话功能`);
            console.log(`当前历史记录数量: ${conversationHistory.getHistory().length}`);
            conversationHistory.addToHistory("测试用户输入", "测试AI回复");
            console.log(`添加测试记录后数量: ${conversationHistory.getHistory().length}`);
            conversationHistory.updateHistoryDisplay();
            return '历史对话功能测试完成，请检查控制台日志和UI显示';
        }
    };

    // 当DOM准备就绪时初始化扩展
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        setTimeout(initializeExtension, 100);
    }

    // 当页面卸载时清理资源
    window.addEventListener('beforeunload', cleanup);

	console.log(`[${EXTENSION_NAME}] 扩展脚本已加载`);

})();
            

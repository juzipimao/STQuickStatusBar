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
        maxHistoryLength: 10
    };

    // 扩展是否已初始化
    let isInitialized = false;

    /**
     * 对话历史管理类
     */
    class ConversationHistoryManager {
        constructor() {
            this.storageKey = 'STQuickStatusBar_ConversationHistory';
            this.maxHistory = extensionSettings.maxHistoryLength || 10;
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
                if (!extensionSettings.enableConversationHistory) {
                    return;
                }

                if (!userPrompt?.trim() || !aiResponse?.trim()) {
                    return;
                }

                const history = this.getHistory();
                const newEntry = {
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    userPrompt: userPrompt.trim(),
                    aiResponse: aiResponse.trim()
                };

                // 添加到历史开头
                history.unshift(newEntry);

                // 限制历史长度
                if (history.length > this.maxHistory) {
                    history.splice(this.maxHistory);
                }

                localStorage.setItem(this.storageKey, JSON.stringify(history));
                console.log(`[${EXTENSION_NAME}] 对话已添加到历史，当前历史长度: ${history.length}`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] 添加历史对话失败:`, error);
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

            // 添加历史对话（最近的5条，避免token过多）
            const recentHistory = history.slice(0, 5);
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
            this.maxHistory = newMax;

            // 如果当前历史超过新的限制，进行截断
            const history = this.getHistory();
            if (history.length > newMax) {
                history.splice(newMax);
                localStorage.setItem(this.storageKey, JSON.stringify(history));
            }
        }
    }

    // 创建历史管理实例
    const conversationHistory = new ConversationHistoryManager();

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
            console.log(`[${EXTENSION_NAME}] 扩展模块导入成功:`, {
                getContext: typeof getContext,
                writeExtensionField: typeof writeExtensionField
            });

            // 导入脚本主模块
            console.log(`[${EXTENSION_NAME}] 导入主脚本模块: /script.js`);
            const scriptModule = await import('/script.js');
            characters = scriptModule.characters;
            this_chid = scriptModule.this_chid;
            reloadCurrentChat = scriptModule.reloadCurrentChat;
            getCurrentChatId = scriptModule.getCurrentChatId;
            console.log(`[${EXTENSION_NAME}] 主脚本模块导入成功:`, {
                characters: typeof characters,
                this_chid: typeof this_chid,
                reloadCurrentChat: typeof reloadCurrentChat,
                getCurrentChatId: typeof getCurrentChatId
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
        // 确保全局扩展设置对象存在
        if (!window.extension_settings) {
            window.extension_settings = {};
            console.log(`[${EXTENSION_NAME}] 初始化 window.extension_settings 对象`);
        }

        if (window.extension_settings && window.extension_settings[EXTENSION_NAME]) {
            Object.assign(extensionSettings, window.extension_settings[EXTENSION_NAME]);
        }

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
        if (!window.extension_settings) {
            window.extension_settings = {};
        }

        window.extension_settings[EXTENSION_NAME] = extensionSettings;

        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        }

        console.log(`[${EXTENSION_NAME}] 设置已保存`);
    }

    /**
     * 获取当前选择的角色信息
     */
    function getCurrentCharacterInfo() {
        try {
            const context = getContext();
            const characterId = context.characterId;

            if (characterId === undefined || characterId === null) {
                return null;
            }

            const character = characters[characterId];
            if (!character) {
                return null;
            }

            return {
                id: characterId,
                name: character.name || '未知角色',
                avatar: character.avatar || '',
                description: character.description || ''
            };
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取角色信息失败:`, error);
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
     * 创建模态框HTML内容
     */
    function createModalContent(characterInfo) {
        console.log(`[${EXTENSION_NAME}] 创建模态框内容，内容长度检查开始`);
        const isMobile = isMobileDevice();
        console.log(`[${EXTENSION_NAME}] 设备类型: ${isMobile ? '移动设备' : '桌面设备'}`);
        
        const modalContent = `
            <div id="quick-regex-modal" class="quick-regex-container">
                <div class="quick-regex-header">
                    <h3>📝 ${EXTENSION_DISPLAY_NAME}</h3>
                    ${characterInfo ? `
                        <div class="character-info">
                            <img src="/characters/${characterInfo.avatar}" alt="${characterInfo.name}" class="character-avatar">
                            <span class="character-name">当前角色: ${characterInfo.name}</span>
                        </div>
                    ` : '<div class="no-character">⚠️ 未选择角色</div>'}

                    <!-- 页面切换标签 -->
                    <div class="page-tabs">
                        <button id="tab-manual" class="tab-button active" data-page="manual"${isMobile ? ' data-mobile="true"' : ''}>
                            🔧 手动创建
                        </button>
                        <button id="tab-ai" class="tab-button" data-page="ai"${isMobile ? ' data-mobile="true"' : ''}>
                            🤖 AI生成
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
                            <small style="color: var(--SmartThemeQuoteColor); font-size: 12px;">
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
                                <label for="gemini-model">模型:</label>
                                <input type="text" id="gemini-model" class="form-control"
                                       placeholder="模型名称" value="${extensionSettings.defaultModel}">
                            </div>
                        </div>

                        <!-- 自定义API配置 -->
                        <div id="custom-config" class="api-config" ${extensionSettings.aiProvider !== 'custom' ? 'style="display: none;"' : ''}>
                            <div class="form-group">
                                <label for="custom-api-url">API URL:</label>
                                <input type="text" id="custom-api-url" class="form-control"
                                       placeholder="https://api.example.com/v1/chat/completions" value="${extensionSettings.customApiUrl}">
                            </div>
                            <div class="form-group">
                                <label for="custom-api-key">API Key:</label>
                                <input type="password" id="custom-api-key" class="form-control"
                                       placeholder="输入你的API密钥" value="${extensionSettings.customApiKey}">
                            </div>
                            <div class="form-group">
                                <label for="custom-model">模型:</label>
                                <input type="text" id="custom-model" class="form-control"
                                       placeholder="模型名称" value="${extensionSettings.customModel}">
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
                            <small style="color: var(--SmartThemeQuoteColor); font-size: 12px;">
                                💡 提示：输入框已自动填入上次的对话内容，支持多轮对话
                            </small>
                        </div>

                        <!-- 对话历史管理 -->
                        <div class="form-group">
                            <div class="conversation-history-controls">
                                <button id="view-conversation-history" class="ai-history-btn" type="button">
                                    📚 查看对话历史
                                </button>
                                <button id="clear-conversation-history" class="ai-clear-btn" type="button">
                                    🗑️ 清空历史
                                </button>
                                <span class="history-count">历史对话: ${conversationHistory.getHistory().length}条</span>
                            </div>
                        </div>

                        <!-- 生成按钮 -->
                        <div class="form-group">
                            <button id="generate-regex" class="ai-generate-btn">
                                🤖 生成正则表达式
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
                                <small style="color: var(--SmartThemeQuoteColor); font-size: 12px;">
                                    💡 在上方输入正文内容，点击"预览效果"查看正则表达式应用后的结果
                                </small>
                            </div>

                            <div class="form-group">
                                <button id="preview-ai-result" class="ai-preview-btn">
                                    👁️ 预览应用效果
                                </button>
                            </div>

                            <div class="form-group">
                                <label for="demo-result">应用效果预览:</label>
                                <textarea id="demo-result" class="form-control" rows="10" readonly
                                          placeholder="应用正则表达式后的结果将显示在这里..."></textarea>
                            </div>

                            <div class="form-group">
                                <button id="apply-ai-result" class="ai-apply-btn">
                                    ✅ 应用到手动创建页面
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

                <div class="quick-regex-footer">
                    <div class="status-message" id="status-message"></div>
                </div>
            </div>
        `;
        
        console.log(`[${EXTENSION_NAME}] 模态框内容创建完成，总长度: ${modalContent.length}`);
        console.log(`[${EXTENSION_NAME}] 包含标签按钮: ${modalContent.includes('tab-button') ? '是' : '否'}`);
        console.log(`[${EXTENSION_NAME}] 移动端标记: ${modalContent.includes('data-mobile') ? '是' : '否'}`);
        
        return modalContent;
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

🔥 关键要求 - 标签一致性检查：
- 正则表达式中使用的标签名必须与示例正文内容中的标签名完全一致
- 生成完成后必须自我检查：每个捕获组的标签名是否在示例正文中都能找到对应的标签
- 如果发现不一致，必须修正其中一个使其保持一致
- 禁止使用不存在于示例正文中的标签名

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
- 例如：如果要匹配<时间>09:00</时间><日期>2025-05-20</日期>
- 正则应该写成：<时间>([^<]+)</时间><日期>([^<]+)</日期>
- 这样$1就是时间值，$2就是日期值

关键规则 - 示例正文内容：
- 🔥 示例正文内容中使用的所有标签名，必须与正则表达式中的标签名完全一致
- 示例正文必须包含完整的 <state_bar> 标签结构
- 所有数据值应该是合理的示例数据，便于用户测试

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
3. 在示例正文内容中使用这些确定的标签名
4. 在正则表达式中使用完全相同的标签名进行匹配
5. 在HTML美化内容中使用对应的$1,$2,$3等宏引用

宏引用示例：
- 正则：<时间>([^<]+)</时间><日期>([^<]+)</日期><想法>([^<]+)</想法>
- 示例正文：<时间>15:30</时间><日期>2025-01-15</日期><想法>今天天气真好</想法>
- HTML中使用：<div class="time">$1</div><div class="date">$2</div><div class="thought">$3</div>

核心原则：
- 专门处理 <state_bar> 标签内容，或在没有状态栏时插入新的状态栏
- 根据用户需求生成对应的状态栏格式和内容
- 保持正文内容完全不变，只操作状态栏部分
- 🔥 确保正则表达式、示例正文、HTML美化内容三者之间的标签名完全一致

状态栏处理模式：
1. 替换现有状态栏：
   正则表达式：<state_bar>.*?</state_bar>

2. 如果没有状态栏则插入：
   正则表达式：^(?!.*<state_bar>)(.*)$
   HTML内容：[美化的HTML页面]\\n$1

3. 更新状态栏中的特定元素：
   正则表达式：<特定标签>.*?</特定标签>

用户需求示例理解：
如果用户说"帮我制定一个角色状态栏，显示角色的想法、衣着、身体状态和好感度"，

你应该生成：
1. 正则表达式（使用捕获组匹配各个标签的内容）
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

3. 示例正文内容，包含真实数据的完整示例
4. 完整的美化HTML页面，使用$1,$2,$3等宏引用捕获组的内容，不使用任何具体数值

注意事项：
- 状态栏内容应该使用模板变量格式，如 {{角色名.属性}}
- 时间相关建议使用固定格式标签：<时间>、<日期>、<星期>
- 选项建议使用：<Options_1>、<Options_2> 等格式
- HTML美化内容要是完整的HTML页面，包含样式和交互
- 根据用户的具体需求调整标签名称和数量
- 确保生成的内容符合用户的具体要求
- 🔥 最重要：正则表达式和HTML替换内容必须配套，捕获组数量要匹配，标签名必须一致`;

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
            throw error;
        }
    }

    /**
     * 调用自定义API (OpenAI格式, 支持对话历史)
     */
    async function callCustomAPI(prompt, apiUrl, apiKey, model) {
        console.log(`[${EXTENSION_NAME}] 调用自定义API开始`);

        // 构建系统提示词
        const systemPrompt = `你是一个专业的正则表达式专家，专门为角色扮演游戏创建状态栏文本处理规则。请根据用户的需求生成合适的正则表达式和替换内容。

🔥 关键要求 - 标签一致性检查：
- 正则表达式中使用的标签名必须与示例正文内容中的标签名完全一致
- 生成完成后必须自我检查：每个捕获组的标签名是否在示例正文中都能找到对应的标签
- 如果发现不一致，必须修正其中一个使其保持一致
- 禁止使用不存在于示例正文中的标签名

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
- 例如：如果要匹配<时间>09:00</时间><日期>2025-05-20</日期>
- 正则应该写成：<时间>([^<]+)</时间><日期>([^<]+)</日期>
- 这样$1就是时间值，$2就是日期值

关键规则 - 示例正文内容：
- 🔥 示例正文内容中使用的所有标签名，必须与正则表达式中的标签名完全一致
- 示例正文必须包含完整的 <state_bar> 标签结构
- 所有数据值应该是合理的示例数据，便于用户测试

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
3. 在示例正文内容中使用这些确定的标签名
4. 在正则表达式中使用完全相同的标签名进行匹配
5. 在HTML美化内容中使用对应的$1,$2,$3等宏引用

宏引用示例：
- 正则：<时间>([^<]+)</时间><日期>([^<]+)</日期><想法>([^<]+)</想法>
- 示例正文：<时间>15:30</时间><日期>2025-01-15</日期><想法>今天天气真好</想法>
- HTML中使用：<div class="time">$1</div><div class="date">$2</div><div class="thought">$3</div>

核心原则：
- 专门处理 <state_bar> 标签内容，或在没有状态栏时插入新的状态栏
- 根据用户需求生成对应的状态栏格式和内容
- 保持正文内容完全不变，只操作状态栏部分
- 🔥 确保正则表达式、示例正文、HTML美化内容三者之间的标签名完全一致

状态栏处理模式：
1. 替换现有状态栏：
   正则表达式：<state_bar>.*?</state_bar>

2. 如果没有状态栏则插入：
   正则表达式：^(?!.*<state_bar>)(.*)$
   HTML内容：[美化的HTML页面]\\n$1

3. 更新状态栏中的特定元素：
   正则表达式：<特定标签>.*?</特定标签>

用户需求示例理解：
如果用户说"帮我制定一个角色状态栏，显示角色的想法、衣着、身体状态和好感度"，

你应该生成：
1. 正则表达式（使用捕获组匹配各个标签的内容）
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

3. 示例正文内容，包含真实数据的完整示例
4. 完整的美化HTML页面，使用$1,$2,$3等宏引用捕获组的内容，不使用任何具体数值

注意事项：
- 状态栏内容应该使用模板变量格式，如 {{角色名.属性}}
- 时间相关建议使用固定格式标签：<时间>、<日期>、<星期>
- 选项建议使用：<Options_1>、<Options_2> 等格式
- HTML美化内容要是完整的HTML页面，包含样式和交互
- 根据用户的具体需求调整标签名称和数量
- 确保生成的内容符合用户的具体要求
- 🔥 最重要：正则表达式和HTML替换内容必须配套，捕获组数量要匹配，标签名必须一致`;

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

        const requestBody = {
            model: model,
            messages: messages,
            temperature: 0,
            max_tokens: 23000
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态: ${response.status}`);
            }

            const data = await response.json();
            const text = data.choices[0].message.content;

            console.log(`[${EXTENSION_NAME}] 自定义API回复:`, text);

            // 将对话添加到历史记录
            conversationHistory.addToHistory(prompt, text);

            return text;

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 自定义API调用失败:`, error);
            throw error;
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
            generateBtn.textContent = '🔄 生成中...';
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

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] AI生成失败:`, error);
            showStatus(`❌ AI生成失败: ${error.message}`, true);
        } finally {
            // 恢复按钮状态
            const generateBtn = document.getElementById('generate-regex');
            if (generateBtn) {
                generateBtn.textContent = '🤖 生成正则表达式';
                generateBtn.disabled = false;
            }
        }
    }

    /**
     * 预览AI生成的结果应用效果
     */
    function previewAIResult() {
        console.log(`[${EXTENSION_NAME}] 预览AI生成的结果效果`);

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

            // 提取状态栏和正文
            const stateBarMatch = result.match(/<state_bar>.*?<\/state_bar>/s);
            const stateBarContent = stateBarMatch ? stateBarMatch[0] : '';
            const mainContent = result.replace(/<state_bar>.*?<\/state_bar>/s, '').trim();

            console.log(`[${EXTENSION_NAME}] 提取的状态栏内容:`, stateBarContent);
            console.log(`[${EXTENSION_NAME}] 提取的正文内容:`, mainContent);

            // 打开弹窗显示预览效果
            openPreviewPopup(stateBarContent, mainContent, demoText, result);

            // 显示统计信息
            const matches = Array.from(demoText.matchAll(regex));
            const matchCount = matches.length;

            if (matchCount > 0) {
                showStatus(`✅ 预览已打开，找到 ${matchCount} 个匹配并应用了替换`);
            } else {
                showStatus('⚠️ 预览已打开，但没有找到匹配的内容', false);
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 预览AI结果失败:`, error);
            showStatus(`❌ 预览失败: ${error.message}`, true);
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
     * 打开预览效果弹窗
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
                    <h3>🎭 预览效果</h3>
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
                                    <div style="padding: 20px; color: #dc3545; text-align: center;">
                                        <h3>⚠️ HTML渲染失败</h3>
                                        <p>AI生成的HTML内容无法正确渲染</p>
                                        <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow: auto; max-height: 200px; text-align: left;">
                                            ${escapeHtml(aiGeneratedReplacement)}
                                        </pre>
                                    </div>
                                `;
                            }
                        } else if (htmlContainer) {
                            console.warn(`[${EXTENSION_NAME}] 没有AI生成的HTML内容可以插入`);
                            htmlContainer.innerHTML = `
                                <div style="padding: 20px; color: #6c757d; text-align: center;">
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
                    iframe.style.height = finalHeight + 'px';

                    console.log(`[${EXTENSION_NAME}] iframe高度调整为: ${finalHeight}px`);
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
            return '<div style="padding: 20px; color: #6c757d; text-align: center;">无HTML内容</div>';
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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

                        // 更新历史计数显示
                        const historyCount = document.querySelector('.history-count');
                        if (historyCount) {
                            historyCount.textContent = `历史对话: 0条`;
                        }

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
     * 绑定模态框事件
     */
    function bindModalEvents() {
        console.log(`[${EXTENSION_NAME}] 开始绑定模态框事件`);

        // === 页面切换事件 ===
        const tabButtons = document.querySelectorAll('.tab-button');
        const isMobile = isMobileDevice();
        console.log(`[${EXTENSION_NAME}] 检测到设备类型: ${isMobile ? '移动设备' : '桌面设备'}`);
        console.log(`[${EXTENSION_NAME}] 找到 ${tabButtons.length} 个标签按钮`);

        tabButtons.forEach((button, index) => {
            const pageId = button.getAttribute('data-page');
            const isMobileButton = button.getAttribute('data-mobile') === 'true';
            console.log(`[${EXTENSION_NAME}] 绑定第${index + 1}个标签按钮: ${pageId}, 移动标记: ${isMobileButton}`);

            if (isMobile) {
                // 移动设备：优先使用触摸事件，同时保留点击事件作为后备
                let touchStarted = false;
                let touchStartTime = 0;

                // 触摸开始
                button.addEventListener('touchstart', (e) => {
                    console.log(`[${EXTENSION_NAME}] 移动端触摸开始: ${pageId}`);
                    touchStarted = true;
                    touchStartTime = Date.now();
                    
                    // 添加视觉反馈
                    button.style.transform = 'scale(0.95)';
                    button.style.backgroundColor = 'var(--st-accent-blue, #4299e1)';
                    
                    e.preventDefault(); // 防止触发点击事件
                }, { passive: false });

                // 触摸结束
                button.addEventListener('touchend', (e) => {
                    console.log(`[${EXTENSION_NAME}] 移动端触摸结束: ${pageId}`);
                    
                    // 恢复视觉效果
                    button.style.transform = '';
                    button.style.backgroundColor = '';
                    
                    if (touchStarted) {
                        const touchDuration = Date.now() - touchStartTime;
                        console.log(`[${EXTENSION_NAME}] 触摸持续时间: ${touchDuration}ms`);
                        
                        // 只有在短按(小于500ms)情况下才处理为点击
                        if (touchDuration < 500 && pageId) {
                            console.log(`[${EXTENSION_NAME}] 通过触摸切换到页面: ${pageId}`);
                            
                            // 延迟执行，确保视觉反馈完成
                            setTimeout(() => {
                                switchToPage(pageId);
                            }, 50);
                        }
                        
                        touchStarted = false;
                        e.preventDefault(); // 防止触发点击事件
                    }
                }, { passive: false });

                // 触摸取消
                button.addEventListener('touchcancel', () => {
                    console.log(`[${EXTENSION_NAME}] 移动端触摸取消: ${pageId}`);
                    touchStarted = false;
                    
                    // 恢复视觉效果
                    button.style.transform = '';
                    button.style.backgroundColor = '';
                });

                // 添加点击事件作为后备（对于某些移动浏览器）
                button.addEventListener('click', (e) => {
                    console.log(`[${EXTENSION_NAME}] 移动端点击后备触发: ${pageId}, touchStarted: ${touchStarted}`);
                    
                    if (!touchStarted && pageId) { // 只有在没有触摸事件时才处理点击
                        console.log(`[${EXTENSION_NAME}] 移动端点击后备切换: ${pageId}`);
                        switchToPage(pageId);
                    }
                    e.preventDefault();
                });
                
            } else {
                // 桌面设备：使用标准点击事件
                button.addEventListener('click', (e) => {
                    console.log(`[${EXTENSION_NAME}] 桌面端点击切换到页面: ${pageId}`);
                    if (pageId) {
                        switchToPage(pageId);
                    }
                    e.preventDefault();
                });
            }
        });

        // === AI页面事件 ===
        // API提供商切换
        const providerSelect = document.getElementById('ai-provider');
        if (providerSelect) {
            providerSelect.addEventListener('change', () => {
                const provider = providerSelect.value;
                const geminiConfig = document.getElementById('gemini-config');
                const customConfig = document.getElementById('custom-config');

                if (provider === 'gemini') {
                    if (geminiConfig) geminiConfig.style.display = 'block';
                    if (customConfig) customConfig.style.display = 'none';
                } else if (provider === 'custom') {
                    if (geminiConfig) geminiConfig.style.display = 'none';
                    if (customConfig) customConfig.style.display = 'block';
                }

                // 保存设置
                saveAISettings();
            });
        }

        // AI生成按钮
        const generateBtn = document.getElementById('generate-regex');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleAIGenerate);
        }

        // 应用AI结果按钮
        const applyBtn = document.getElementById('apply-ai-result');
        if (applyBtn) {
            applyBtn.addEventListener('click', applyAIResult);
        }

        // 预览AI结果按钮
        const previewBtn = document.getElementById('preview-ai-result');
        if (previewBtn) {
            previewBtn.addEventListener('click', previewAIResult);
        }

        // 查看对话历史按钮
        const viewHistoryBtn = document.getElementById('view-conversation-history');
        if (viewHistoryBtn) {
            viewHistoryBtn.addEventListener('click', showConversationHistory);
        }

        // 清空对话历史按钮
        const clearHistoryBtn = document.getElementById('clear-conversation-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', clearConversationHistory);
        }

        // AI配置字段自动保存（实时保存）
        const aiConfigFields = [
            'ai-provider', 'gemini-api-key', 'gemini-model',
            'custom-api-url', 'custom-api-key', 'custom-model'
        ];

        aiConfigFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // 添加实时保存监听器
                field.addEventListener('input', autoSaveAPIConfig);
                field.addEventListener('change', autoSaveAPIConfig);
                field.addEventListener('blur', autoSaveAPIConfig);
                console.log(`[${EXTENSION_NAME}] 为字段 ${fieldId} 添加了自动保存监听器`);
            }
        });

        // === 手动创建页面事件 ===
        // 实时验证正则表达式
        const patternInput = document.getElementById('regex-pattern');
        const flagsSelect = document.getElementById('regex-flags');

        if (patternInput && extensionSettings.autoValidate) {
            patternInput.addEventListener('input', () => {
                const pattern = patternInput.value;
                const flags = flagsSelect?.value || 'g';
                updateValidation(pattern, flags);
                updatePreview();
            });
        }

        if (flagsSelect) {
            flagsSelect.addEventListener('change', () => {
                const pattern = patternInput?.value || '';
                const flags = flagsSelect.value;
                updateValidation(pattern, flags);
                updatePreview();
            });
        }

        // 实时预览
        if (extensionSettings.showPreview) {
            const testTextArea = document.getElementById('test-text');
            const replacementArea = document.getElementById('regex-replacement');

            [testTextArea, replacementArea].forEach(element => {
                if (element) {
                    element.addEventListener('input', updatePreview);
                }
            });
        }

        // 初始验证
        if (patternInput?.value) {
            updateValidation(patternInput.value, flagsSelect?.value || 'g');
            updatePreview();
        }

        console.log(`[${EXTENSION_NAME}] 模态框事件绑定完成`);
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
     * 打开快速正则工具模态框
     */
    async function openQuickRegexModal() {
        console.log(`[${EXTENSION_NAME}] openQuickRegexModal 被调用`);

        // 用于存储表单数据的变量
        let formData = null;

        try {
            // 1. 检查弹窗模块
            console.log(`[${EXTENSION_NAME}] 检查弹窗模块可用性`);
            if (!callGenericPopup) {
                console.error(`[${EXTENSION_NAME}] callGenericPopup 不可用`);
                throw new Error('弹窗模块未加载');
            }
            console.log(`[${EXTENSION_NAME}] callGenericPopup 可用`);

            // 2. 获取角色信息
            console.log(`[${EXTENSION_NAME}] 获取当前角色信息`);
            const characterInfo = getCurrentCharacterInfo();
            console.log(`[${EXTENSION_NAME}] 角色信息:`, characterInfo);

            // 3. 创建模态框内容
            console.log(`[${EXTENSION_NAME}] 创建模态框内容`);
            const modalContent = createModalContent(characterInfo);
            console.log(`[${EXTENSION_NAME}] 模态框内容长度:`, modalContent.length);

            // 4. 调用弹窗
            console.log(`[${EXTENSION_NAME}] 调用 callGenericPopup`);
            const result = await callGenericPopup(modalContent, POPUP_TYPE.TEXT, '', {
                wide: true,
                okButton: '插入正则表达式',
                cancelButton: '取消',
                customButtons: extensionSettings.showPreview ? [{
                    text: '测试正则',
                    action: () => {
                        console.log(`[${EXTENSION_NAME}] 测试正则按钮被点击`);
                        updatePreview();
                    }
                }] : [],
                onOpen: () => {
                    console.log(`[${EXTENSION_NAME}] 模态框已打开`);

                    // 延迟绑定事件，确保DOM已完全渲染
                    setTimeout(() => {
                        console.log(`[${EXTENSION_NAME}] 开始绑定模态框事件`);

                        // 检查模态框DOM结构
                        console.log(`[${EXTENSION_NAME}] 检查模态框DOM结构`);
                        const modalContainer = document.querySelector('#quick-regex-modal');
                        console.log(`[${EXTENSION_NAME}] 模态框容器:`, modalContainer ? '找到' : '未找到');

                        if (modalContainer) {
                            const allInputs = modalContainer.querySelectorAll('input, select, textarea');
                            console.log(`[${EXTENSION_NAME}] 模态框中找到 ${allInputs.length} 个表单元素`);
                            allInputs.forEach((element, index) => {
                                console.log(`[${EXTENSION_NAME}] 元素${index + 1}:`, {
                                    tagName: element.tagName,
                                    id: element.id,
                                    type: element.type,
                                    value: element.value
                                });
                            });
                        } else {
                            // 如果找不到模态框容器，尝试查找整个文档中的表单元素
                            console.log(`[${EXTENSION_NAME}] 在整个文档中查找表单元素`);
                            const scriptNameEl = document.getElementById('regex-script-name');
                            const patternEl = document.getElementById('regex-pattern');
                            console.log(`[${EXTENSION_NAME}] 文档中的元素检查:`, {
                                scriptNameEl: scriptNameEl ? '存在' : '不存在',
                                patternEl: patternEl ? '存在' : '不存在'
                            });
                        }

                        bindModalEvents();
                    }, 100);
                },
                onClosing: (popup) => {
                    console.log(`[${EXTENSION_NAME}] 模态框即将关闭，获取表单数据`);

                    // 在模态框关闭前获取表单数据
                    try {
                        const scriptNameElement = document.getElementById('regex-script-name');
                        const patternElement = document.getElementById('regex-pattern');
                        const replacementElement = document.getElementById('regex-replacement');
                        const flagsElement = document.getElementById('regex-flags');
                        const affectsElement = document.getElementById('regex-affects');

                        if (scriptNameElement && patternElement) {
                            formData = {
                                scriptName: scriptNameElement.value, // 不做trim，保持原始内容
                                pattern: patternElement.value, // 不做trim，保持原始内容
                                replacement: replacementElement?.value || '',
                                flags: flagsElement?.value || 'g',
                                affects: affectsElement?.value || 'both'
                            };

                            console.log(`[${EXTENSION_NAME}] 成功获取表单数据:`, {
                                scriptName: `"${formData.scriptName}"`,
                                pattern: `"${formData.pattern}"`,
                                replacement: `"${formData.replacement}"`,
                                patternLength: formData.pattern?.length,
                                replacementLength: formData.replacement?.length,
                                patternHasNewlines: formData.pattern?.includes('\n'),
                                replacementHasNewlines: formData.replacement?.includes('\n'),
                                replacementPreview: formData.replacement?.substring(0, 200) + '...'
                            });
                        } else {
                            console.warn(`[${EXTENSION_NAME}] 无法获取表单数据，元素不存在`);
                            formData = null;
                        }
                    } catch (error) {
                        console.error(`[${EXTENSION_NAME}] 获取表单数据时出错:`, error);
                        formData = null;
                    }

                    return true; // 允许模态框关闭
                }
            });

            // 5. 处理结果
            console.log(`[${EXTENSION_NAME}] 模态框返回结果:`, result);
            console.log(`[${EXTENSION_NAME}] POPUP_RESULT.AFFIRMATIVE:`, POPUP_RESULT.AFFIRMATIVE);
            console.log(`[${EXTENSION_NAME}] 获取的表单数据:`, formData);

            if (result === POPUP_RESULT.AFFIRMATIVE && formData) {
                console.log(`[${EXTENSION_NAME}] 用户点击了确认按钮，开始处理插入正则`);
                const success = await handleInsertRegexWithData(formData, characterInfo);
                console.log(`[${EXTENSION_NAME}] handleInsertRegexWithData 返回结果:`, success);
                if (success) {
                    console.log(`[${EXTENSION_NAME}] 正则表达式插入成功`);
                }
            } else if (result === POPUP_RESULT.AFFIRMATIVE && !formData) {
                console.error(`[${EXTENSION_NAME}] 用户确认但表单数据为空`);
                if (toastr) {
                    toastr.error('无法获取表单数据，请重试', '错误');
                }
            } else {
                console.log(`[${EXTENSION_NAME}] 用户取消或关闭了模态框`);
            }

        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 打开模态框失败:`, error);
            console.error(`[${EXTENSION_NAME}] 错误堆栈:`, error.stack);
            if (toastr) {
                toastr.error(`无法打开正则工具: ${error.message}`, '错误');
            }
        }
    }

    /**
     * 创建扩展的用户界面
     */
    function createUI() {
        const settingsHtml = `
            <div id="${EXTENSION_NAME}-settings" class="extension-settings">
                <h3>${EXTENSION_DISPLAY_NAME}</h3>
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>工具设置</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <label class="checkbox_label">
                            <input id="${EXTENSION_NAME}-enabled" type="checkbox" ${extensionSettings.enabled ? 'checked' : ''}>
                            <span>启用扩展</span>
                        </label>
                        <br>
                        <label class="checkbox_label">
                            <input id="${EXTENSION_NAME}-preview" type="checkbox" ${extensionSettings.showPreview ? 'checked' : ''}>
                            <span>显示预览功能</span>
                        </label>
                        <br>
                        <label class="checkbox_label">
                            <input id="${EXTENSION_NAME}-remember" type="checkbox" ${extensionSettings.rememberLastValues ? 'checked' : ''}>
                            <span>记住上次的输入</span>
                        </label>
                        <br>
                        <div class="quick-regex-action">
                            <button id="${EXTENSION_NAME}-open-tool" class="menu_button"
                                    ${!extensionSettings.enabled ? 'disabled' : ''}>
                                <i class="fa-solid fa-magic"></i>
                                <span>打开快速正则工具</span>
                            </button>
                        </div>
                        <br>
                        <small class="notes">点击上方按钮打开模态框，快速为当前角色添加正则表达式规则。</small>
                    </div>
                </div>
            </div>
        `;

        $('#extensions_settings').append(settingsHtml);

        // 绑定设置事件
        $(`#${EXTENSION_NAME}-enabled`).on('change', function() {
            extensionSettings.enabled = $(this).prop('checked');
            saveSettings();

            const button = $(`#${EXTENSION_NAME}-open-tool`);
            if (extensionSettings.enabled) {
                button.prop('disabled', false);
            } else {
                button.prop('disabled', true);
            }
        });

        $(`#${EXTENSION_NAME}-preview`).on('change', function() {
            extensionSettings.showPreview = $(this).prop('checked');
            saveSettings();
        });

        $(`#${EXTENSION_NAME}-remember`).on('change', function() {
            extensionSettings.rememberLastValues = $(this).prop('checked');
            saveSettings();
        });

        // 绑定工具按钮事件
        $(`#${EXTENSION_NAME}-open-tool`).on('click', function() {
            if (extensionSettings.enabled) {
                openQuickRegexModal();
            }
        });

        console.log(`[${EXTENSION_NAME}] UI 已创建`);
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
                    openQuickRegexModal();
                    return 'ST快速状态栏已打开';
                } else {
                    return 'ST快速状态栏已禁用';
                }
            },
            returns: 'string',
            helpString: '打开ST快速状态栏模态框',
        });

        console.log(`[${EXTENSION_NAME}] 斜杠命令已注册: /st-status-bar`);
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

            // 加载设置
            loadSettings();

            // 创建用户界面
            createUI();

            // 注册斜杠命令
            registerSlashCommands();

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
        $(`#${EXTENSION_NAME}-settings`).remove();
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
        openModal: openQuickRegexModal,
        isInitialized: () => isInitialized,
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

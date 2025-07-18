/**
 * STQuickStatusBar 可视化设计器
 * 版本: 1.0.0
 * 描述: 可视化HTML设计器，支持拖拽式界面设计、AI驱动的动态数值系统和世界书集成
 */

(function() {
    'use strict';

    // 插件配置
    const PLUGIN_NAME = 'STQuickStatusBar';
    const VERSION = '1.0.0';
    let isInitialized = false;
    let currentTemplate = null;
    let statusDisplay = null;

    // 安全地访问SillyTavern的全局对象
    function getSillyTavernGlobals() {
        try {
            const globals = {
                eventSource: window.eventSource,
                event_types: window.event_types,
                chat: window.chat,
                characters: window.characters,
                this_chid: window.this_chid,
                extension_settings: window.extension_settings,
                saveSettingsDebounced: window.saveSettingsDebounced,
                getRequestHeaders: window.getRequestHeaders,
                getContext: window.getContext,
                SillyTavern: window.SillyTavern
            };

            // 如果直接访问失败，尝试从SillyTavern对象获取
            if (!globals.getRequestHeaders && window.SillyTavern) {
                try {
                    const context = window.SillyTavern.getContext();
                    if (context && context.getRequestHeaders) {
                        globals.getRequestHeaders = context.getRequestHeaders;
                    }
                } catch (e) {
                    console.debug('[STQuickStatusBar] 无法从SillyTavern.getContext()获取getRequestHeaders');
                }
            }

            return globals;
        } catch (error) {
            console.error('[STQuickStatusBar] 获取SillyTavern全局对象失败:', error);
            return {};
        }
    }

    // 默认设置
    const defaultSettings = {
        enabled: true,
        showInQuickBar: true,
        autoSaveState: true,
        animationEnabled: true,
        debugMode: false,
        templates: [],
        currentState: {}
    };

    // 插件主类
    class STQuickStatusBarPlugin {
        constructor() {
            this.settings = { ...defaultSettings };
            this.aiResponseParser = null;
            this.dynamicRenderer = null;
            this.worldInfoIntegrator = null;
            this.extendedControls = null;
            this.designerModal = null;
            this.statusDisplay = null;

            this.log('插件初始化开始');
        }

        // 日志记录
        log(...args) {
            if (this.settings.debugMode) {
                console.log(`[${PLUGIN_NAME}]`, ...args);
            }
        }

        // 错误记录
        error(...args) {
            console.error(`[${PLUGIN_NAME}]`, ...args);
        }

        // 强制日志记录（用于调试）
        forceLog(...args) {
            console.log(`[${PLUGIN_NAME}]`, ...args);
        }

        // 初始化插件
        async init() {
            try {
                this.log('开始初始化插件');

                // 加载设置
                this.loadSettings();

                // 初始化核心组件
                this.initializeComponents();

                // 创建快速状态栏按钮
                this.createQuickBarButton();

                // 注册事件监听器
                this.registerEventListeners();

                // 初始化实时状态显示
                this.initializeStatusDisplay();

                isInitialized = true;
                this.log('插件初始化完成');

            } catch (error) {
                this.error('插件初始化失败:', error);
                throw error;
            }
        }

        // 加载设置
        loadSettings() {
            const globals = getSillyTavernGlobals();
            if (globals.extension_settings) {
                const savedSettings = globals.extension_settings[PLUGIN_NAME] || {};
                this.settings = { ...defaultSettings, ...savedSettings };
                this.log('设置已加载:', this.settings);
            } else {
                this.settings = { ...defaultSettings };
                this.log('extension_settings未定义，使用默认设置');
            }
        }

        // 保存设置
        saveSettings() {
            const globals = getSillyTavernGlobals();
            if (globals.extension_settings) {
                globals.extension_settings[PLUGIN_NAME] = this.settings;
                if (globals.saveSettingsDebounced) {
                    globals.saveSettingsDebounced();
                }
                this.log('设置已保存');
            } else {
                this.log('extension_settings未定义，无法保存设置');
            }
        }

        // 初始化核心组件
        initializeComponents() {
            this.log('初始化核心组件');

            // 初始化扩展控件库
            this.extendedControls = new ExtendedControlLibrary();

            // 初始化AI回复解析器
            this.aiResponseParser = new AIResponseParser();

            // 初始化动态渲染引擎
            this.dynamicRenderer = new DynamicRenderEngine();

            // 初始化世界书集成器
            this.worldInfoIntegrator = new WorldInfoIntegrator();

            // 初始化设计器模态框
            this.designerModal = new DesignerModal(this);

            this.log('核心组件初始化完成');
        }

        // 创建快速状态栏按钮
        createQuickBarButton() {
            this.forceLog('开始创建快速状态栏按钮');

            if (!this.settings.showInQuickBar) {
                this.forceLog('showInQuickBar 设置为 false，跳过按钮创建');
                return;
            }

            // 尝试多个可能的容器位置
            const containers = [
                '#quick-status-bar',
                '#top-bar',
                '#user-controls',
                '#rightSendForm',
                '#send_form',
                '#chat-input-area',
                'body' // 最后的备选方案
            ];

            let quickBarContainer = null;
            for (const selector of containers) {
                quickBarContainer = document.querySelector(selector);
                if (quickBarContainer) {
                    this.forceLog(`找到容器: ${selector}`);
                    break;
                }
            }

            if (!quickBarContainer) {
                this.error('找不到任何合适的容器，使用 body');
                quickBarContainer = document.body;
            }

            // 检查是否已经存在按钮
            const existingButton = document.getElementById('stqsb-trigger-button');
            if (existingButton) {
                this.forceLog('按钮已存在，先移除旧按钮');
                existingButton.remove();
            }

            // 创建按钮
            const button = document.createElement('button');
            button.id = 'stqsb-trigger-button';
            button.className = 'stqsb-quick-button';
            button.innerHTML = '<i class="fas fa-paint-brush"></i>';
            button.title = 'STQuickStatusBar 可视化设计器';
            button.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 9999;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 8px;
                color: white;
                padding: 8px 12px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.3s ease;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            `;

            // 添加点击事件
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.forceLog('按钮被点击');
                this.openDesigner();
            });

            // 添加悬停效果
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
            });

            quickBarContainer.appendChild(button);
            this.forceLog('快速状态栏按钮已创建并添加到页面');
        }

        // 注册事件监听器
        registerEventListeners() {
            this.log('注册事件监听器');

            const globals = getSillyTavernGlobals();

            // 监听AI消息接收
            if (globals.eventSource && globals.event_types) {
                globals.eventSource.on(globals.event_types.MESSAGE_RECEIVED, (messageId) => {
                    this.handleAIMessage(messageId);
                });

                // 监听聊天切换
                globals.eventSource.on(globals.event_types.CHAT_CHANGED, () => {
                    this.handleChatChanged();
                });

                // 监听角色切换
                globals.eventSource.on('character_selected', () => {
                    this.handleCharacterChanged();
                });

                // 监听应用就绪
                globals.eventSource.on(globals.event_types.APP_READY, () => {
                    this.handleAppReady();
                });
            }

            this.log('事件监听器注册完成');
        }

        // 初始化状态显示
        initializeStatusDisplay() {
            this.statusDisplay = new RealTimeStatusDisplay();
            this.log('状态显示系统已初始化');
        }

        // 处理AI消息
        handleAIMessage(messageId) {
            try {
                const globals = getSillyTavernGlobals();
                if (!globals.chat) return;

                const message = globals.chat[messageId];
                if (!message || message.is_user) return;

                this.log('处理AI消息:', messageId);

                // 解析AI回复中的指令
                const commands = this.aiResponseParser.parseResponse(message.mes);

                if (commands.length > 0) {
                    this.log('发现状态变化指令:', commands);

                    // 执行指令
                    if (this.statusDisplay && this.statusDisplay.isActive()) {
                        this.statusDisplay.processAICommands(commands);
                    }
                }

            } catch (error) {
                this.error('处理AI消息失败:', error);
            }
        }

        // 处理聊天切换
        handleChatChanged() {
            this.log('聊天已切换');

            // 重新加载状态显示
            if (this.statusDisplay) {
                this.statusDisplay.loadCharacterState();
            }
        }

        // 处理角色切换
        handleCharacterChanged() {
            this.log('角色已切换');

            // 重新加载角色状态
            if (this.statusDisplay) {
                this.statusDisplay.loadCharacterState();
            }
        }

        // 处理应用就绪
        handleAppReady() {
            this.log('应用就绪');

            // 延迟初始化状态显示
            setTimeout(() => {
                this.loadCharacterTemplate();
            }, 1000);
        }

        // 加载角色模板
        loadCharacterTemplate() {
            try {
                const globals = getSillyTavernGlobals();
                if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) return;

                const character = globals.characters[globals.this_chid];
                const extensionData = character.data?.extensions?.[PLUGIN_NAME];

                if (extensionData && extensionData.template) {
                    this.log('加载角色模板:', extensionData.template);
                    currentTemplate = extensionData.template;

                    // 创建状态显示
                    this.statusDisplay.createStatusDisplay(extensionData.template);

                    // 恢复状态
                    if (extensionData.state) {
                        this.statusDisplay.importState(extensionData.state);
                    }
                }

            } catch (error) {
                this.error('加载角色模板失败:', error);
            }
        }

        // 打开设计器
        openDesigner() {
            this.forceLog('尝试打开设计器');

            if (!this.designerModal) {
                this.error('设计器模态框未初始化');
                // 尝试重新初始化
                this.forceLog('尝试重新初始化设计器模态框');
                try {
                    this.designerModal = new DesignerModal(this);
                    this.forceLog('设计器模态框重新初始化成功');
                } catch (error) {
                    this.error('设计器模态框重新初始化失败:', error);
                    return;
                }
            }

            this.forceLog('调用设计器模态框的 show 方法');
            try {
                this.designerModal.show();
                this.forceLog('设计器模态框显示成功');
            } catch (error) {
                this.error('显示设计器模态框失败:', error);
            }
        }

        // 关闭设计器
        closeDesigner() {
            this.log('关闭设计器');

            if (this.designerModal) {
                this.designerModal.hide();
            }
        }

        // 应用模板
        applyTemplate(template) {
            this.log('应用模板:', template);

            currentTemplate = template;

            // 保存到角色数据
            this.saveTemplateToCharacter(template);

            // 创建或更新状态显示
            if (this.statusDisplay) {
                this.statusDisplay.createStatusDisplay(template);
            }
        }

        // 保存模板到角色
        saveTemplateToCharacter(template) {
            try {
                const globals = getSillyTavernGlobals();
                if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) return;

                const character = globals.characters[globals.this_chid];

                // 初始化数据结构
                if (!character.data) character.data = {};
                if (!character.data.extensions) character.data.extensions = {};

                // 保存模板
                character.data.extensions[PLUGIN_NAME] = {
                    template: template,
                    state: this.statusDisplay?.exportState() || {},
                    lastUpdated: Date.now(),
                    version: VERSION
                };

                // 发送到服务器
                this.syncCharacterData(character);

                this.log('模板已保存到角色');

            } catch (error) {
                this.error('保存模板到角色失败:', error);
            }
        }

        // 同步角色数据到服务器
        async syncCharacterData(character) {
            try {
                const globals = getSillyTavernGlobals();

                // 获取请求头，使用多种备用方案
                let headers;

                // 方案1: 使用SillyTavern的getRequestHeaders函数
                if (globals.getRequestHeaders && typeof globals.getRequestHeaders === 'function') {
                    try {
                        headers = globals.getRequestHeaders();
                        this.log('成功获取SillyTavern请求头:', headers);
                    } catch (error) {
                        this.log('getRequestHeaders调用失败，尝试备用方案:', error);
                    }
                }

                // 方案2: 使用备用方案获取token
                if (!headers && window.token) {
                    headers = {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.token
                    };
                    this.log('使用备用方案获取请求头:', headers);
                }

                // 如果所有方案都失败
                if (!headers) {
                    throw new Error('无法获取CSRF token，请刷新页面重试');
                }

                const response = await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        avatar: character.avatar,
                        data: {
                            extensions: {
                                [PLUGIN_NAME]: character.data.extensions[PLUGIN_NAME]
                            }
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                this.log('角色数据同步成功');

            } catch (error) {
                this.error('同步角色数据失败:', error);
            }
        }

        // 获取插件状态
        getStatus() {
            return {
                name: PLUGIN_NAME,
                version: VERSION,
                initialized: isInitialized,
                settings: this.settings,
                hasTemplate: !!currentTemplate,
                statusDisplayActive: this.statusDisplay?.isActive() || false
            };
        }

        // 重置插件
        reset() {
            this.log('重置插件');

            // 清除状态显示
            if (this.statusDisplay) {
                this.statusDisplay.destroy();
            }

            // 重置变量
            currentTemplate = null;

            // 重新初始化
            this.initializeStatusDisplay();

            this.log('插件重置完成');
        }

        // 销毁插件
        destroy() {
            this.log('销毁插件');

            // 清除事件监听器
            const globals = getSillyTavernGlobals();
            if (globals.eventSource && globals.event_types) {
                globals.eventSource.off(globals.event_types.MESSAGE_RECEIVED);
                globals.eventSource.off(globals.event_types.CHAT_CHANGED);
                globals.eventSource.off('character_selected');
                globals.eventSource.off(globals.event_types.APP_READY);
            }

            // 销毁组件
            if (this.statusDisplay) {
                this.statusDisplay.destroy();
            }

            if (this.designerModal) {
                this.designerModal.destroy();
            }

            // 清除按钮
            const button = document.getElementById('stqsb-trigger-button');
            if (button) {
                button.remove();
            }

            isInitialized = false;
            this.log('插件销毁完成');
        }
    }

    // 全局插件实例
    let pluginInstance = null;

    // jQuery初始化
    jQuery(async () => {
        try {
            console.log(`[${PLUGIN_NAME}] 开始加载插件 v${VERSION}`);

            // 创建插件实例
            pluginInstance = new STQuickStatusBarPlugin();

            // 初始化插件
            await pluginInstance.init();

            // 暴露到全局
            window.STQuickStatusBar = pluginInstance;

            console.log(`[${PLUGIN_NAME}] 插件加载完成`);

        } catch (error) {
            console.error(`[${PLUGIN_NAME}] 插件加载失败:`, error);
        }
    });

    // 页面卸载时清理
    jQuery(window).on('beforeunload', () => {
        if (pluginInstance) {
            pluginInstance.destroy();
        }
    });

    // 暴露插件信息和调试函数
    window.STQuickStatusBarInfo = {
        name: PLUGIN_NAME,
        version: VERSION,
        getStatus: () => pluginInstance?.getStatus() || { initialized: false },
        // 调试函数：检查SillyTavern环境
        debugEnvironment: () => {
            console.log('=== STQuickStatusBar 环境调试信息 ===');
            console.log('window.eventSource:', !!window.eventSource);
            console.log('window.event_types:', !!window.event_types);
            console.log('window.getRequestHeaders:', typeof window.getRequestHeaders);
            console.log('window.token:', !!window.token);
            console.log('window.SillyTavern:', !!window.SillyTavern);
            console.log('window.extension_settings:', !!window.extension_settings);
            console.log('window.characters:', !!window.characters);
            console.log('window.this_chid:', window.this_chid);

            if (window.SillyTavern) {
                try {
                    const context = window.SillyTavern.getContext();
                    console.log('SillyTavern.getContext():', !!context);
                    if (context) {
                        console.log('context.getRequestHeaders:', typeof context.getRequestHeaders);
                    }
                } catch (e) {
                    console.log('SillyTavern.getContext() 错误:', e.message);
                }
            }

            // 测试获取请求头
            try {
                const globals = getSillyTavernGlobals();
                if (globals.getRequestHeaders) {
                    const headers = globals.getRequestHeaders();
                    console.log('成功获取请求头:', headers);
                } else {
                    console.log('getRequestHeaders 不可用');
                }
            } catch (e) {
                console.log('获取请求头失败:', e.message);
            }

            console.log('=== 调试信息结束 ===');
        }
    };

})();

// 扩展控件库实现
class ExtendedControlLibrary {
    constructor() {
        this.controls = this.initializeControls();
        this.log('扩展控件库初始化完成');
    }

    // 初始化控件库
    initializeControls() {
        return {
            // 文本控件
            text: {
                staticText: {
                    name: '静态文本',
                    icon: 'fas fa-font',
                    description: '显示固定文本内容',
                    category: 'text',
                    template: '<span class="static-text">{text}</span>',
                    properties: {
                        text: { type: 'string', default: '静态文本', label: '文本内容' },
                        fontSize: { type: 'number', default: 14, label: '字体大小', min: 8, max: 48 },
                        fontWeight: { type: 'select', default: 'normal', label: '字体粗细', options: ['normal', 'bold', 'lighter'] },
                        color: { type: 'color', default: '#ffffff', label: '文本颜色' },
                        backgroundColor: { type: 'color', default: 'transparent', label: '背景颜色' },
                        textAlign: { type: 'select', default: 'left', label: '文本对齐', options: ['left', 'center', 'right'] },
                        padding: { type: 'string', default: '0px', label: '内边距' },
                        margin: { type: 'string', default: '0px', label: '外边距' }
                    }
                },
                dynamicText: {
                    name: '动态文本',
                    icon: 'fas fa-magic',
                    description: '可以通过AI指令更新的文本',
                    category: 'text',
                    template: '<span class="dynamic-text" data-field="{field}" data-update-rule="{updateRule}">{text}</span>',
                    properties: {
                        text: { type: 'string', default: '动态文本', label: '初始文本' },
                        field: { type: 'string', default: 'dynamic_text', label: '字段名称', required: true },
                        updateRule: { type: 'select', default: 'replace', label: '更新规则', options: ['replace', 'append', 'prepend'] },
                        fontSize: { type: 'number', default: 14, label: '字体大小', min: 8, max: 48 },
                        color: { type: 'color', default: '#ffd700', label: '文本颜色' },
                        fontWeight: { type: 'select', default: 'bold', label: '字体粗细', options: ['normal', 'bold', 'lighter'] }
                    }
                },
                labelText: {
                    name: '标签文本',
                    icon: 'fas fa-tag',
                    description: '用于标识其他控件的标签',
                    category: 'text',
                    template: '<label class="label-text" for="{for}">{text}:</label>',
                    properties: {
                        text: { type: 'string', default: '标签', label: '标签文本' },
                        for: { type: 'string', default: '', label: '关联字段' },
                        fontSize: { type: 'number', default: 14, label: '字体大小', min: 8, max: 48 },
                        color: { type: 'color', default: '#cccccc', label: '文本颜色' },
                        fontWeight: { type: 'select', default: '600', label: '字体粗细', options: ['normal', '600', 'bold'] }
                    }
                }
            },

            // 数值控件
            value: {
                numberInput: {
                    name: '数值输入框',
                    icon: 'fas fa-edit',
                    description: '可编辑的数值输入框',
                    category: 'value',
                    template: '<input type="number" class="number-input" data-field="{field}" value="{value}" min="{min}" max="{max}" step="{step}" />',
                    properties: {
                        field: { type: 'string', default: 'number_field', label: '字段名称', required: true },
                        value: { type: 'number', default: 0, label: '初始值' },
                        min: { type: 'number', default: 0, label: '最小值' },
                        max: { type: 'number', default: 100, label: '最大值' },
                        step: { type: 'number', default: 1, label: '步长' },
                        placeholder: { type: 'string', default: '', label: '占位符' },
                        width: { type: 'string', default: '80px', label: '宽度' }
                    }
                },
                numberDisplay: {
                    name: '数值显示',
                    icon: 'fas fa-calculator',
                    description: '只读的数值显示框',
                    category: 'value',
                    template: '<span class="number-display" data-field="{field}" data-format="{format}">{value}</span>',
                    properties: {
                        field: { type: 'string', default: 'display_field', label: '字段名称', required: true },
                        value: { type: 'number', default: 0, label: '初始值' },
                        format: { type: 'string', default: '{value}', label: '显示格式' },
                        min: { type: 'number', default: 0, label: '最小值' },
                        max: { type: 'number', default: 100, label: '最大值' },
                        color: { type: 'color', default: '#ffffff', label: '文本颜色' },
                        backgroundColor: { type: 'color', default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: '背景颜色' },
                        padding: { type: 'string', default: '4px 12px', label: '内边距' },
                        borderRadius: { type: 'string', default: '6px', label: '圆角' }
                    }
                },
                textInput: {
                    name: '文本输入框',
                    icon: 'fas fa-keyboard',
                    description: '可编辑的文本输入框',
                    category: 'value',
                    template: '<input type="text" class="text-input" data-field="{field}" value="{value}" placeholder="{placeholder}" maxlength="{maxlength}" />',
                    properties: {
                        field: { type: 'string', default: 'text_field', label: '字段名称', required: true },
                        value: { type: 'string', default: '', label: '初始值' },
                        placeholder: { type: 'string', default: '请输入文本', label: '占位符' },
                        maxlength: { type: 'number', default: 50, label: '最大长度' },
                        width: { type: 'string', default: '120px', label: '宽度' }
                    }
                },
                progressBar: {
                    name: '进度条',
                    icon: 'fas fa-tasks',
                    description: '显示进度或数值比例',
                    category: 'value',
                    template: '<div class="progress"><div class="progress-bar {colorClass}" data-field="{field}" data-max="{max}" style="width: {percentage}%">{value}/{max}</div></div>',
                    properties: {
                        field: { type: 'string', default: 'progress_field', label: '字段名称', required: true },
                        value: { type: 'number', default: 50, label: '当前值' },
                        max: { type: 'number', default: 100, label: '最大值' },
                        colorClass: { type: 'select', default: 'high', label: '颜色主题', options: ['low', 'medium', 'high'] },
                        showText: { type: 'boolean', default: true, label: '显示文本' },
                        height: { type: 'string', default: '24px', label: '高度' },
                        borderRadius: { type: 'string', default: '12px', label: '圆角' }
                    }
                }
            },

            // 复合控件
            composite: {
                propertyGroup: {
                    name: '属性组',
                    icon: 'fas fa-layer-group',
                    description: '将多个控件组合成一个属性组',
                    category: 'composite',
                    template: '<div class="property-group"><h4 class="property-group-title">{title}</h4><div class="property-group-content">{content}</div></div>',
                    properties: {
                        title: { type: 'string', default: '属性组', label: '标题' },
                        content: { type: 'html', default: '', label: '内容' },
                        borderColor: { type: 'color', default: '#444444', label: '边框颜色' },
                        backgroundColor: { type: 'color', default: 'transparent', label: '背景颜色' },
                        padding: { type: 'string', default: '16px', label: '内边距' },
                        margin: { type: 'string', default: '0 0 16px 0', label: '外边距' }
                    },
                    allowChildren: true
                },
                statusPanel: {
                    name: '状态面板',
                    icon: 'fas fa-desktop',
                    description: '带标题的状态显示面板',
                    category: 'composite',
                    template: '<div class="status-panel"><div class="status-header">{title}</div><div class="status-body">{content}</div></div>',
                    properties: {
                        title: { type: 'string', default: '状态面板', label: '标题' },
                        content: { type: 'html', default: '', label: '内容' },
                        headerColor: { type: 'color', default: '#667eea', label: '标题颜色' },
                        bodyColor: { type: 'color', default: '#2a2a2a', label: '内容背景' },
                        borderRadius: { type: 'string', default: '8px', label: '圆角' }
                    },
                    allowChildren: true
                },
                valuePanel: {
                    name: '数值面板',
                    icon: 'fas fa-th',
                    description: '网格布局的数值显示面板',
                    category: 'composite',
                    template: '<div class="value-panel"><div class="value-grid" style="grid-template-columns: repeat({columns}, 1fr);">{content}</div></div>',
                    properties: {
                        columns: { type: 'number', default: 2, label: '列数', min: 1, max: 6 },
                        content: { type: 'html', default: '', label: '内容' },
                        gap: { type: 'string', default: '12px', label: '间距' },
                        padding: { type: 'string', default: '16px', label: '内边距' }
                    },
                    allowChildren: true
                },
                separatorLine: {
                    name: '分割线',
                    icon: 'fas fa-minus',
                    description: '用于分割不同区域的线条',
                    category: 'composite',
                    template: '<div class="separator-line" style="border-color: {color}; margin: {margin};"></div>',
                    properties: {
                        color: { type: 'color', default: '#444444', label: '颜色' },
                        margin: { type: 'string', default: '16px 0', label: '外边距' },
                        thickness: { type: 'number', default: 1, label: '厚度', min: 1, max: 10 }
                    }
                },
                flexContainer: {
                    name: '弹性容器',
                    icon: 'fas fa-grip-horizontal',
                    description: '弹性布局容器',
                    category: 'composite',
                    template: '<div class="flex-container" style="flex-direction: {direction}; justify-content: {justify}; align-items: {align}; gap: {gap};">{content}</div>',
                    properties: {
                        direction: { type: 'select', default: 'row', label: '方向', options: ['row', 'column', 'row-reverse', 'column-reverse'] },
                        justify: { type: 'select', default: 'flex-start', label: '主轴对齐', options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'] },
                        align: { type: 'select', default: 'stretch', label: '交叉轴对齐', options: ['stretch', 'flex-start', 'center', 'flex-end'] },
                        gap: { type: 'string', default: '8px', label: '间距' },
                        content: { type: 'html', default: '', label: '内容' }
                    },
                    allowChildren: true
                }
            }
        };
    }

    // 获取所有控件
    getAllControls() {
        return this.controls;
    }

    // 按类别获取控件
    getControlsByCategory(category) {
        const result = {};
        Object.entries(this.controls).forEach(([categoryName, controls]) => {
            if (categoryName === category) {
                result[categoryName] = controls;
            }
        });
        return result;
    }

    // 获取特定控件
    getControl(category, type) {
        return this.controls[category]?.[type];
    }

    // 生成控件HTML
    generateControlHTML(category, type, properties = {}) {
        const control = this.getControl(category, type);
        if (!control) {
            throw new Error(`控件不存在: ${category}.${type}`);
        }

        // 合并默认属性和用户属性
        const mergedProps = this.mergeProperties(control.properties, properties);

        // 处理模板
        let html = control.template;

        // 替换模板变量
        Object.entries(mergedProps).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        // 处理特殊计算值
        html = this.processSpecialValues(html, mergedProps);

        return html;
    }

    // 合并属性
    mergeProperties(defaultProps, userProps) {
        const merged = {};

        // 先应用默认值
        Object.entries(defaultProps).forEach(([key, prop]) => {
            merged[key] = prop.default;
        });

        // 再应用用户值
        Object.entries(userProps).forEach(([key, value]) => {
            merged[key] = value;
        });

        return merged;
    }

    // 处理特殊值
    processSpecialValues(html, properties) {
        // 处理百分比值
        if (properties.value !== undefined && properties.max !== undefined) {
            const percentage = (properties.value / properties.max) * 100;
            html = html.replace(/{percentage}/g, percentage.toFixed(1));
        }

        // 处理颜色类
        if (properties.colorClass) {
            html = html.replace(/{colorClass}/g, properties.colorClass);
        }

        // 处理样式
        if (properties.fontSize) {
            html = html.replace(/font-size:\s*\d+px/g, `font-size: ${properties.fontSize}px`);
        }

        return html;
    }

    // 验证控件属性
    validateProperties(category, type, properties) {
        const control = this.getControl(category, type);
        if (!control) {
            return { valid: false, errors: [`控件不存在: ${category}.${type}`] };
        }

        const errors = [];

        // 检查必需属性
        Object.entries(control.properties).forEach(([key, prop]) => {
            if (prop.required && (properties[key] === undefined || properties[key] === '')) {
                errors.push(`必需属性缺失: ${key}`);
            }

            // 检查数值范围
            if (prop.type === 'number' && properties[key] !== undefined) {
                const value = Number(properties[key]);
                if (prop.min !== undefined && value < prop.min) {
                    errors.push(`${key} 值过小，最小值为: ${prop.min}`);
                }
                if (prop.max !== undefined && value > prop.max) {
                    errors.push(`${key} 值过大，最大值为: ${prop.max}`);
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // 生成控件预览
    generateControlPreview(category, type, properties = {}) {
        try {
            const validation = this.validateProperties(category, type, properties);
            if (!validation.valid) {
                return `<div class="control-error">错误: ${validation.errors.join(', ')}</div>`;
            }

            const html = this.generateControlHTML(category, type, properties);
            return `<div class="control-preview">${html}</div>`;
        } catch (error) {
            return `<div class="control-error">生成预览失败: ${error.message}</div>`;
        }
    }

    // 获取控件属性表单
    generatePropertyForm(category, type) {
        const control = this.getControl(category, type);
        if (!control) {
            return '';
        }

        let formHtml = `<div class="control-properties-form" data-category="${category}" data-type="${type}">`;
        formHtml += `<h4>${control.name} - 属性设置</h4>`;

        Object.entries(control.properties).forEach(([key, prop]) => {
            formHtml += this.generatePropertyField(key, prop);
        });

        formHtml += '</div>';
        return formHtml;
    }

    // 生成单个属性字段
    generatePropertyField(key, prop) {
        const required = prop.required ? ' required' : '';
        const id = `prop-${key}`;

        let fieldHtml = `<div class="property-field">`;
        fieldHtml += `<label for="${id}" class="property-label">${prop.label || key}${prop.required ? ' *' : ''}:</label>`;

        switch (prop.type) {
            case 'string':
                fieldHtml += `<input type="text" id="${id}" name="${key}" value="${prop.default}" class="property-input"${required} />`;
                break;
            case 'number':
                const min = prop.min !== undefined ? ` min="${prop.min}"` : '';
                const max = prop.max !== undefined ? ` max="${prop.max}"` : '';
                const step = prop.step !== undefined ? ` step="${prop.step}"` : '';
                fieldHtml += `<input type="number" id="${id}" name="${key}" value="${prop.default}" class="property-input"${min}${max}${step}${required} />`;
                break;
            case 'boolean':
                const checked = prop.default ? ' checked' : '';
                fieldHtml += `<input type="checkbox" id="${id}" name="${key}" class="property-checkbox"${checked} />`;
                break;
            case 'color':
                fieldHtml += `<input type="color" id="${id}" name="${key}" value="${prop.default}" class="property-color" />`;
                break;
            case 'select':
                fieldHtml += `<select id="${id}" name="${key}" class="property-select">`;
                prop.options.forEach(option => {
                    const selected = option === prop.default ? ' selected' : '';
                    fieldHtml += `<option value="${option}"${selected}>${option}</option>`;
                });
                fieldHtml += '</select>';
                break;
            case 'html':
                fieldHtml += `<textarea id="${id}" name="${key}" class="property-textarea" rows="3">${prop.default}</textarea>`;
                break;
            default:
                fieldHtml += `<input type="text" id="${id}" name="${key}" value="${prop.default}" class="property-input" />`;
        }

        fieldHtml += '</div>';
        return fieldHtml;
    }

    // 从表单获取属性值
    getPropertiesFromForm(formElement) {
        const properties = {};
        const formData = new FormData(formElement);

        formData.forEach((value, key) => {
            // 处理复选框
            const input = formElement.querySelector(`[name="${key}"]`);
            if (input.type === 'checkbox') {
                properties[key] = input.checked;
            } else if (input.type === 'number') {
                properties[key] = Number(value);
            } else {
                properties[key] = value;
            }
        });

        return properties;
    }

    // 日志记录
    log(...args) {
        console.log('[ExtendedControlLibrary]', ...args);
    }
}

// AI回复解析器实现
class AIResponseParser {
    constructor() {
        this.commandPatterns = {
            // 数值变化指令模式
            increase: /\+([\w_]+):([+-]?\d+(?:\.\d+)?)/g,     // +strength:5
            decrease: /\-([\w_]+):([+-]?\d+(?:\.\d+)?)/g,     // -health:10
            set: /=([\w_]+):([+-]?\d+(?:\.\d+)?)/g,           // =level:15
            setText: /=([\w_]+):"([^"]+)"/g,                  // =name:"新名字"
            delete: /!([\w_]+)/g,                             // !temporary_buff
            // 状态变化指令模式
            enable: /%enable:([\w_]+)/g,                      // %enable:magic_shield
            disable: /%disable:([\w_]+)/g,                    // %disable:poison
            show: /%show:([\w_]+)/g,                          // %show:hidden_stats
            hide: /%hide:([\w_]+)/g,                          // %hide:debug_info
            // 条件指令模式
            ifGreater: /\?>([\w_]+):(\d+):(.+)/g,             // ?>health:50:+regeneration:1
            ifLess: /\?<([\w_]+):(\d+):(.+)/g,                // ?<health:20:-speed:2
            ifEqual: /\?=([\w_]+):([^:]+):(.+)/g              // ?=status:poisoned:+damage:5
        };

        // 隐藏指令模式 - 在HTML注释中
        this.hiddenCommandPattern = /<!--\s*STQSB:(.*?)\s*-->/g;

        // 自然语言匹配模式
        this.naturalLanguagePatterns = {
            // 战斗相关
            combat: [
                { trigger: /攻击|战斗|打击|击中/i, effect: '+fatigue:5,-mana:10' },
                { trigger: /受伤|受到.*?伤害|被.*?攻击/i, effect: '-health:15,+pain:10' },
                { trigger: /击败|胜利|打败|成功击杀/i, effect: '+experience:20,+confidence:5' },
                { trigger: /失败|败北|被击败/i, effect: '-confidence:5,+fatigue:10' },
                { trigger: /暴击|致命一击|完美命中/i, effect: '+confidence:10,+experience:5' }
            ],

            // 技能使用
            skills: [
                { trigger: /使用魔法|施法|施展.*?法术/i, effect: '-mana:15,+magic_exp:2' },
                { trigger: /偷窃|潜行|隐身/i, effect: '+stealth_exp:5,-energy:5' },
                { trigger: /治疗|恢复|回复/i, effect: '+health:20,-mana:25' },
                { trigger: /冥想|休息|睡觉/i, effect: '+mana:15,-fatigue:10' },
                { trigger: /学习|练习|训练/i, effect: '+experience:10,-energy:15' }
            ],

            // 环境影响
            environment: [
                { trigger: /寒冷|冰冻|下雪/i, effect: '-temperature:5,+fatigue:3' },
                { trigger: /炎热|酷热|高温/i, effect: '+temperature:5,+thirst:10' },
                { trigger: /下雨|潮湿|阴雨/i, effect: '-temperature:2,+discomfort:5' },
                { trigger: /阳光|温暖|晴朗/i, effect: '+mood:3,+energy:5' },
                { trigger: /黑暗|恐怖|可怕/i, effect: '-courage:5,+fear:10' }
            ],

            // 社交互动
            social: [
                { trigger: /成功说服|交涉成功|谈判成功/i, effect: '+charisma:2,+confidence:5' },
                { trigger: /被拒绝|交涉失败|谈判失败/i, effect: '-confidence:3,+frustration:5' },
                { trigger: /获得帮助|结交朋友|建立友谊/i, effect: '+mood:10,+social_standing:5' },
                { trigger: /被背叛|受到欺骗|被利用/i, effect: '-trust:10,-mood:15' },
                { trigger: /获得赞美|被称赞|受到表扬/i, effect: '+confidence:8,+mood:12' }
            ]
        };

        this.log('AI回复解析器初始化完成');
    }

    // 解析AI回复中的指令
    parseResponse(responseText) {
        const commands = [];

        try {
            // 1. 查找隐藏指令
            const hiddenCommands = this.parseHiddenCommands(responseText);
            commands.push(...hiddenCommands);

            // 2. 如果没有隐藏指令，尝试解析显式指令
            if (commands.length === 0) {
                const explicitCommands = this.parseExplicitCommands(responseText);
                commands.push(...explicitCommands);
            }

            // 3. 如果仍然没有指令，尝试自然语言匹配
            if (commands.length === 0) {
                const naturalCommands = this.parseNaturalLanguage(responseText);
                commands.push(...naturalCommands);
            }

            // 4. 处理条件指令
            const processedCommands = this.processConditionalCommands(commands);

            this.log(`解析完成: 找到 ${processedCommands.length} 个指令`);
            return processedCommands;

        } catch (error) {
            this.log('解析AI回复失败:', error);
            return [];
        }
    }

    // 解析隐藏指令
    parseHiddenCommands(text) {
        const commands = [];
        let match;

        while ((match = this.hiddenCommandPattern.exec(text)) !== null) {
            const commandString = match[1];
            const parsedCommands = this.parseCommandString(commandString);
            commands.push(...parsedCommands);
        }

        return commands;
    }

    // 解析显式指令
    parseExplicitCommands(text) {
        const commands = [];

        Object.entries(this.commandPatterns).forEach(([type, pattern]) => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const command = this.createCommand(type, match);
                if (command) {
                    commands.push(command);
                }
            }
        });

        return commands;
    }

    // 解析自然语言
    parseNaturalLanguage(text) {
        const commands = [];

        Object.entries(this.naturalLanguagePatterns).forEach(([category, patterns]) => {
            patterns.forEach(pattern => {
                if (pattern.trigger.test(text)) {
                    const generatedCommands = this.parseEffectString(pattern.effect);
                    commands.push(...generatedCommands);
                }
            });
        });

        return commands;
    }

    // 解析指令字符串
    parseCommandString(commandString) {
        const commands = [];

        // 分割多个指令
        const parts = commandString.split(',');

        parts.forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            // 尝试各种指令格式
            Object.entries(this.commandPatterns).forEach(([type, pattern]) => {
                pattern.lastIndex = 0; // 重置正则表达式
                const match = pattern.exec(trimmed);
                if (match) {
                    const command = this.createCommand(type, match);
                    if (command) {
                        commands.push(command);
                    }
                }
            });
        });

        return commands;
    }

    // 创建指令对象
    createCommand(type, match) {
        const timestamp = Date.now();

        switch (type) {
            case 'increase':
            case 'decrease':
                return {
                    type: type,
                    field: match[1],
                    value: parseFloat(match[2]),
                    timestamp: timestamp
                };
            case 'set':
                return {
                    type: type,
                    field: match[1],
                    value: parseFloat(match[2]),
                    timestamp: timestamp
                };
            case 'setText':
                return {
                    type: 'setText',
                    field: match[1],
                    value: match[2],
                    timestamp: timestamp
                };
            case 'delete':
                return {
                    type: type,
                    field: match[1],
                    timestamp: timestamp
                };
            case 'enable':
            case 'disable':
            case 'show':
            case 'hide':
                return {
                    type: type,
                    field: match[1],
                    timestamp: timestamp
                };
            case 'ifGreater':
                return {
                    type: 'conditional',
                    condition: 'greater',
                    field: match[1],
                    value: parseFloat(match[2]),
                    effect: match[3],
                    timestamp: timestamp
                };
            case 'ifLess':
                return {
                    type: 'conditional',
                    condition: 'less',
                    field: match[1],
                    value: parseFloat(match[2]),
                    effect: match[3],
                    timestamp: timestamp
                };
            case 'ifEqual':
                return {
                    type: 'conditional',
                    condition: 'equal',
                    field: match[1],
                    value: match[2],
                    effect: match[3],
                    timestamp: timestamp
                };
            default:
                return null;
        }
    }

    // 解析效果字符串
    parseEffectString(effectString) {
        const commands = [];
        const effects = effectString.split(',');

        effects.forEach(effect => {
            const trimmed = effect.trim();
            const match = trimmed.match(/([+\-=])([\w_]+):([+-]?\d+(?:\.\d+)?)/);
            if (match) {
                const [, operator, field, value] = match;
                commands.push({
                    type: operator === '+' ? 'increase' :
                          operator === '-' ? 'decrease' : 'set',
                    field: field,
                    value: parseFloat(value),
                    timestamp: Date.now()
                });
            }
        });

        return commands;
    }

    // 处理条件指令
    processConditionalCommands(commands, currentState = {}) {
        const processedCommands = [];

        commands.forEach(command => {
            if (command.type === 'conditional') {
                // 检查条件
                if (this.evaluateCondition(command, currentState)) {
                    // 解析效果并添加到处理列表
                    const effectCommands = this.parseEffectString(command.effect);
                    processedCommands.push(...effectCommands);
                }
            } else {
                processedCommands.push(command);
            }
        });

        return processedCommands;
    }

    // 评估条件
    evaluateCondition(command, currentState) {
        const currentValue = currentState[command.field];
        if (currentValue === undefined) return false;

        switch (command.condition) {
            case 'greater':
                return currentValue > command.value;
            case 'less':
                return currentValue < command.value;
            case 'equal':
                return currentValue == command.value;
            default:
                return false;
        }
    }

    // 验证指令
    validateCommand(command) {
        const errors = [];

        if (!command.type) {
            errors.push('缺少指令类型');
        }

        if (!command.field) {
            errors.push('缺少字段名');
        }

        if (['increase', 'decrease', 'set'].includes(command.type) &&
            command.value === undefined) {
            errors.push('缺少数值');
        }

        if (command.type === 'increase' || command.type === 'decrease') {
            if (isNaN(command.value)) {
                errors.push('数值必须是数字');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // 批量验证指令
    validateCommands(commands) {
        const results = [];

        commands.forEach((command, index) => {
            const validation = this.validateCommand(command);
            if (!validation.valid) {
                results.push({
                    index: index,
                    command: command,
                    errors: validation.errors
                });
            }
        });

        return results;
    }

    // 获取统计信息
    getParsingStats() {
        return {
            supportedCommands: Object.keys(this.commandPatterns),
            naturalLanguagePatterns: Object.keys(this.naturalLanguagePatterns),
            totalPatterns: Object.values(this.naturalLanguagePatterns)
                .reduce((sum, patterns) => sum + patterns.length, 0)
        };
    }

    // 添加自定义模式
    addCustomPattern(category, pattern) {
        if (!this.naturalLanguagePatterns[category]) {
            this.naturalLanguagePatterns[category] = [];
        }
        this.naturalLanguagePatterns[category].push(pattern);
        this.log(`添加自定义模式: ${category}`);
    }

    // 日志记录
    log(...args) {
        console.log('[AIResponseParser]', ...args);
    }
}

// 动态渲染引擎实现
class DynamicRenderEngine {
    constructor() {
        this.currentState = {};
        this.renderQueue = [];
        this.isRendering = false;
        this.observers = new Map();
        this.animations = new Map();
        this.template = null;
        this.container = null;
        this.changeHistory = [];
        this.maxHistoryLength = 100;

        this.log('动态渲染引擎初始化完成');
    }

    // 初始化渲染引擎
    init(container, template) {
        this.container = container;
        this.template = template;
        this.currentState = { ...template.defaultValues };
        this.renderInitialState();
        this.setupObservers();
        this.log('渲染引擎初始化完成');
    }

    // 渲染初始状态
    renderInitialState() {
        if (!this.container || !this.template) {
            this.log('容器或模板未设置');
            return;
        }

        const html = this.processTemplate(this.template.html, this.currentState);
        this.container.innerHTML = html;
        this.bindElements();
        this.log('初始状态渲染完成');
    }

    // 处理模板
    processTemplate(html, state) {
        let processed = html;

        // 替换状态值
        Object.entries(state).forEach(([key, value]) => {
            const placeholder = new RegExp(`\\{${key}\\}`, 'g');
            processed = processed.replace(placeholder, value);
        });

        // 处理条件显示
        processed = this.processConditionalDisplay(processed, state);

        return processed;
    }

    // 处理条件显示
    processConditionalDisplay(html, state) {
        // 处理 if-show 指令
        const ifShowPattern = /\{if-show:([^}]+)\}(.*?)\{\/if-show\}/g;
        html = html.replace(ifShowPattern, (match, condition, content) => {
            const shouldShow = this.evaluateCondition(condition, state);
            return shouldShow ? content : '';
        });

        // 处理 if-hide 指令
        const ifHidePattern = /\{if-hide:([^}]+)\}(.*?)\{\/if-hide\}/g;
        html = html.replace(ifHidePattern, (match, condition, content) => {
            const shouldHide = this.evaluateCondition(condition, state);
            return shouldHide ? '' : content;
        });

        return html;
    }

    // 评估条件
    evaluateCondition(condition, state) {
        try {
            // 简单的条件评估
            const parts = condition.split(':');
            if (parts.length === 3) {
                const [field, operator, value] = parts;
                const currentValue = state[field];

                switch (operator) {
                    case '>':
                        return currentValue > parseFloat(value);
                    case '<':
                        return currentValue < parseFloat(value);
                    case '>=':
                        return currentValue >= parseFloat(value);
                    case '<=':
                        return currentValue <= parseFloat(value);
                    case '==':
                        return currentValue == value;
                    case '!=':
                        return currentValue != value;
                    default:
                        return false;
                }
            }
            return false;
        } catch (error) {
            this.log('条件评估失败:', error);
            return false;
        }
    }

    // 绑定元素
    bindElements() {
        if (!this.container) return;

        const elements = this.container.querySelectorAll('[data-field]');

        elements.forEach(element => {
            const field = element.getAttribute('data-field');
            const updateRule = element.getAttribute('data-update-rule') || 'replace';
            const format = element.getAttribute('data-format') || '{value}';

            // 创建观察者
            this.observers.set(field, {
                element: element,
                updateRule: updateRule,
                format: format,
                originalValue: this.currentState[field],
                lastValue: this.currentState[field]
            });

            // 绑定输入事件
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.addEventListener('input', (e) => {
                    this.updateState(field, e.target.value, false);
                });

                element.addEventListener('change', (e) => {
                    this.updateState(field, e.target.value, false);
                });
            }
        });

        this.log(`绑定了 ${elements.length} 个元素`);
    }

    // 更新状态
    updateState(field, value, animated = true) {
        const oldValue = this.currentState[field];
        this.currentState[field] = value;

        // 记录变化历史
        this.recordChange(field, oldValue, value);

        // 触发变化事件
        this.dispatchChangeEvent(field, oldValue, value);

        // 更新对应的UI元素
        this.updateElement(field, value, animated);

        this.log(`状态更新: ${field} = ${value} (from ${oldValue})`);
    }

    // 记录变化历史
    recordChange(field, oldValue, newValue) {
        const change = {
            field: field,
            oldValue: oldValue,
            newValue: newValue,
            timestamp: Date.now()
        };

        this.changeHistory.push(change);

        // 限制历史记录长度
        if (this.changeHistory.length > this.maxHistoryLength) {
            this.changeHistory.shift();
        }
    }

    // 触发变化事件
    dispatchChangeEvent(field, oldValue, newValue) {
        const event = new CustomEvent('stateChanged', {
            detail: {
                field: field,
                oldValue: oldValue,
                newValue: newValue,
                timestamp: Date.now()
            }
        });

        if (this.container) {
            this.container.dispatchEvent(event);
        }
    }

    // 更新元素
    updateElement(field, value, animated = true) {
        const observer = this.observers.get(field);
        if (!observer) return;

        const { element, updateRule, format } = observer;

        if (animated) {
            this.animateValueChange(element, value, updateRule, format);
        } else {
            this.applyValueChange(element, value, updateRule, format);
        }

        // 更新观察者的最后值
        observer.lastValue = value;
    }

    // 应用数值变化
    applyValueChange(element, value, updateRule, format) {
        let displayValue = value;

        // 格式化值
        if (format && format !== '{value}') {
            displayValue = format.replace(/{value}/g, value);
        }

        switch (updateRule) {
            case 'replace':
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value = displayValue;
                } else {
                    element.textContent = displayValue;
                }
                break;
            case 'append':
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value += displayValue;
                } else {
                    element.textContent += displayValue;
                }
                break;
            case 'prepend':
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value = displayValue + element.value;
                } else {
                    element.textContent = displayValue + element.textContent;
                }
                break;
            case 'html':
                element.innerHTML = displayValue;
                break;
            case 'progress':
                this.updateProgressBar(element, value);
                break;
            case 'style':
                this.updateElementStyle(element, value);
                break;
        }
    }

    // 更新进度条
    updateProgressBar(element, value) {
        const max = parseFloat(element.getAttribute('data-max')) || 100;
        const percentage = Math.max(0, Math.min(100, (value / max) * 100));

        element.style.width = `${percentage}%`;

        // 更新进度条文本
        const showText = element.getAttribute('data-show-text') !== 'false';
        if (showText) {
            element.textContent = `${value}/${max}`;
        }

        // 更新颜色类
        this.updateProgressBarColor(element, percentage);
    }

    // 更新进度条颜色
    updateProgressBarColor(element, percentage) {
        element.classList.remove('low', 'medium', 'high');

        if (percentage < 25) {
            element.classList.add('low');
        } else if (percentage < 75) {
            element.classList.add('medium');
        } else {
            element.classList.add('high');
        }
    }

    // 更新元素样式
    updateElementStyle(element, value) {
        const styleRule = element.getAttribute('data-style-rule');
        if (styleRule) {
            const [property, template] = styleRule.split(':');
            if (property && template) {
                const styleValue = template.replace(/{value}/g, value);
                element.style[property] = styleValue;
            }
        }
    }

    // 动画效果
    animateValueChange(element, value, updateRule, format) {
        // 添加变化动画类
        element.classList.add('stqsb-changing');

        // 延迟应用变化
        setTimeout(() => {
            this.applyValueChange(element, value, updateRule, format);

            // 移除动画类
            setTimeout(() => {
                element.classList.remove('stqsb-changing');
            }, 600);
        }, 100);

        // 显示变化指示器
        this.showChangeIndicator(element, value);
    }

    // 显示变化指示器
    showChangeIndicator(element, newValue) {
        const observer = this.observers.get(element.getAttribute('data-field'));
        if (!observer) return;

        const oldValue = observer.lastValue;
        const change = newValue - oldValue;

        if (change === 0) return;

        const indicator = document.createElement('div');
        indicator.className = 'stqsb-change-indicator';
        indicator.textContent = change > 0 ? `+${change}` : `${change}`;

        if (change > 0) {
            indicator.classList.add('positive');
        } else {
            indicator.classList.add('negative');
        }

        // 定位到元素旁边
        const rect = element.getBoundingClientRect();
        indicator.style.position = 'fixed';
        indicator.style.left = `${rect.right + 10}px`;
        indicator.style.top = `${rect.top}px`;
        indicator.style.zIndex = '9999';

        document.body.appendChild(indicator);

        // 动画效果
        setTimeout(() => {
            indicator.remove();
        }, 2000);
    }

    // 批量更新状态
    batchUpdateState(updates) {
        updates.forEach(update => {
            this.updateState(update.field, update.value, false);
        });

        // 触发批量渲染
        this.renderBatch();
    }

    // 批量渲染
    renderBatch() {
        if (this.isRendering) return;

        this.isRendering = true;

        // 使用 requestAnimationFrame 进行批量渲染
        requestAnimationFrame(() => {
            this.observers.forEach((observer, field) => {
                const currentValue = this.currentState[field];
                if (currentValue !== observer.lastValue) {
                    this.animateValueChange(observer.element, currentValue, observer.updateRule, observer.format);
                }
            });

            this.isRendering = false;
        });
    }

    // 处理AI指令
    processAICommands(commands) {
        const updates = [];

        commands.forEach(command => {
            const result = this.processCommand(command);
            if (result) {
                updates.push(result);
            }
        });

        if (updates.length > 0) {
            this.batchUpdateState(updates);
        }

        this.log(`处理了 ${commands.length} 个AI指令`);
    }

    // 处理单个指令
    processCommand(command) {
        const currentValue = this.currentState[command.field];
        let newValue;

        switch (command.type) {
            case 'increase':
                newValue = (currentValue || 0) + command.value;
                break;
            case 'decrease':
                newValue = (currentValue || 0) - command.value;
                break;
            case 'set':
                newValue = command.value;
                break;
            case 'setText':
                newValue = command.value;
                break;
            case 'delete':
                newValue = null;
                break;
            case 'enable':
                newValue = true;
                break;
            case 'disable':
                newValue = false;
                break;
            case 'show':
                this.showElement(command.field);
                return null;
            case 'hide':
                this.hideElement(command.field);
                return null;
            default:
                this.log(`未知指令类型: ${command.type}`);
                return null;
        }

        // 边界检查
        if (this.template && this.template.fields && this.template.fields[command.field]) {
            const fieldConfig = this.template.fields[command.field];
            if (typeof newValue === 'number') {
                if (fieldConfig.min !== undefined && newValue < fieldConfig.min) {
                    newValue = fieldConfig.min;
                }
                if (fieldConfig.max !== undefined && newValue > fieldConfig.max) {
                    newValue = fieldConfig.max;
                }
            }
        }

        return {
            field: command.field,
            value: newValue,
            command: command
        };
    }

    // 显示元素
    showElement(field) {
        const observer = this.observers.get(field);
        if (observer && observer.element) {
            observer.element.style.display = '';
            observer.element.classList.remove('stqsb-hidden');
        }
    }

    // 隐藏元素
    hideElement(field) {
        const observer = this.observers.get(field);
        if (observer && observer.element) {
            observer.element.style.display = 'none';
            observer.element.classList.add('stqsb-hidden');
        }
    }

    // 导出状态
    exportState() {
        return {
            currentState: { ...this.currentState },
            changeHistory: [...this.changeHistory],
            timestamp: Date.now()
        };
    }

    // 导入状态
    importState(state) {
        this.currentState = { ...state.currentState };
        this.changeHistory = state.changeHistory || [];
        this.renderInitialState();
        this.log('状态导入完成');
    }

    // 重置状态
    resetState() {
        if (this.template) {
            this.currentState = { ...this.template.defaultValues };
            this.changeHistory = [];
            this.renderInitialState();
            this.log('状态重置完成');
        }
    }

    // 获取变化历史
    getChangeHistory(field = null) {
        if (field) {
            return this.changeHistory.filter(change => change.field === field);
        }
        return [...this.changeHistory];
    }

    // 获取状态统计
    getStateStats() {
        const stats = {
            totalFields: Object.keys(this.currentState).length,
            totalChanges: this.changeHistory.length,
            observedElements: this.observers.size,
            fieldStats: {}
        };

        // 统计每个字段的变化次数
        this.changeHistory.forEach(change => {
            if (!stats.fieldStats[change.field]) {
                stats.fieldStats[change.field] = 0;
            }
            stats.fieldStats[change.field]++;
        });

        return stats;
    }

    // 清理资源
    destroy() {
        this.observers.clear();
        this.animations.clear();
        this.renderQueue = [];
        this.changeHistory = [];
        this.currentState = {};
        this.template = null;
        this.container = null;
        this.log('渲染引擎已销毁');
    }

    // 日志记录
    log(...args) {
        console.log('[DynamicRenderEngine]', ...args);
    }
}

// 世界书集成器实现
class WorldInfoIntegrator {
    constructor() {
        this.worldBooks = [];
        this.promptTemplates = this.initializePromptTemplates();
        this.log('世界书集成器初始化完成');
    }

    // 获取 SillyTavern 全局对象的辅助方法
    getSillyTavernGlobals() {
        try {
            // 尝试从全局作用域获取
            const globals = {
                eventSource: window.eventSource,
                event_types: window.event_types,
                chat: window.chat,
                characters: window.characters,
                this_chid: window.this_chid,
                extension_settings: window.extension_settings,
                saveSettingsDebounced: window.saveSettingsDebounced,
                getRequestHeaders: window.getRequestHeaders,
                getContext: window.getContext,
                // 备用方案：尝试从SillyTavern全局对象获取
                SillyTavern: window.SillyTavern
            };

            // 如果直接访问失败，尝试从SillyTavern对象获取
            if (!globals.getRequestHeaders && window.SillyTavern) {
                // 尝试从SillyTavern.getContext()获取
                try {
                    const context = window.SillyTavern.getContext();
                    if (context && context.getRequestHeaders) {
                        globals.getRequestHeaders = context.getRequestHeaders;
                    }
                } catch (e) {
                    console.debug('[WorldInfoIntegrator] 无法从SillyTavern.getContext()获取getRequestHeaders');
                }
            }

            return globals;
        } catch (error) {
            console.error('[WorldInfoIntegrator] 获取SillyTavern全局对象失败:', error);
            return {};
        }
    }

    // 获取请求头（包含必需的CSRF token）
    async getRequestHeaders() {
        try {
            const globals = this.getSillyTavernGlobals();

            // 方案1: 使用SillyTavern的getRequestHeaders函数
            if (globals.getRequestHeaders && typeof globals.getRequestHeaders === 'function') {
                try {
                    const headers = globals.getRequestHeaders();
                    this.log('成功获取SillyTavern请求头:', headers);
                    return headers;
                } catch (error) {
                    console.warn('[WorldInfoIntegrator] getRequestHeaders调用失败，尝试备用方案:', error);
                }
            }

            // 方案2: 尝试直接从window对象获取token
            if (window.token) {
                const headers = {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': window.token
                };
                this.log('使用备用方案获取请求头:', headers);
                return headers;
            }

            // 方案3: 尝试从jQuery的ajaxSetup获取token
            if (window.$ && window.$.ajaxSetup) {
                try {
                    const ajaxSettings = window.$.ajaxSetup();
                    if (ajaxSettings && ajaxSettings.headers && ajaxSettings.headers['X-CSRF-Token']) {
                        const headers = {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': ajaxSettings.headers['X-CSRF-Token']
                        };
                        this.log('从jQuery ajaxSetup获取请求头:', headers);
                        return headers;
                    }
                } catch (error) {
                    console.debug('[WorldInfoIntegrator] 无法从jQuery获取CSRF token:', error);
                }
            }

            // 方案4: 尝试从meta标签获取token
            const metaToken = document.querySelector('meta[name="csrf-token"]');
            if (metaToken && metaToken.content) {
                const headers = {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': metaToken.content
                };
                this.log('从meta标签获取请求头:', headers);
                return headers;
            }

            // 所有方案都失败了
            throw new Error('无法获取CSRF token，请刷新页面重试。如果问题持续存在，请检查SillyTavern是否正常运行。');

        } catch (error) {
            console.error('[WorldInfoIntegrator] 获取请求头失败:', error);
            throw error;
        }
    }

    // 初始化提示词模板
    initializePromptTemplates() {
        return {
            // 基础角色扮演模板
            roleplay: {
                name: '角色扮演模板',
                description: '适用于角色扮演游戏的状态管理',
                template: `你是一个智能助手，需要在回复中包含状态变化指令。

指令格式：
- 增加数值：+字段名:数值 (例如：+strength:5)
- 减少数值：-字段名:数值 (例如：-health:10)
- 设置数值：=字段名:数值 (例如：=level:15)
- 删除字段：!字段名 (例如：!temporary_buff)
- 启用状态：%enable:字段名 (例如：%enable:magic_shield)
- 禁用状态：%disable:字段名 (例如：%disable:poison)
- 显示元素：%show:字段名 (例如：%show:hidden_stats)
- 隐藏元素：%hide:字段名 (例如：%hide:debug_info)

请将这些指令放在HTML注释中：<!--STQSB:指令列表-->

角色状态字段：
{{fieldDescriptions}}

更新规则：
1. 根据角色行为和选择调整属性
2. 战斗、技能使用、休息等活动影响数值
3. 物品使用、魔法效果产生临时或永久变化
4. 环境因素可能影响某些属性
5. 保持数值在合理范围内

请在每次回复末尾添加状态变化指令，格式示例：
<!--STQSB:+strength:2,-health:15,=mood:happy-->

当前状态显示：
{{statusTemplate}}`,
                fields: ['health', 'mana', 'strength', 'level', 'experience']
            },

            // 游戏系统模板
            gaming: {
                name: '游戏系统模板',
                description: '适用于游戏主持人管理玩家数值',
                template: `你是一个游戏主持人，需要管理玩家角色的各项数值。

数值管理规则：
1. 生命值范围：0-100，归零时角色死亡
2. 法力值范围：0-100，影响魔法使用
3. 力量影响物理攻击力和负重
4. 敏捷影响速度和命中率
5. 智力影响法术威力和法力恢复

经验值获得：
- 击败敌人：+10-50经验
- 完成任务：+20-100经验
- 探索发现：+5-20经验
- 每100经验升级一次

请根据玩家行为合理调整数值：<!--STQSB:指令列表-->

角色状态字段：
{{fieldDescriptions}}

{{statusTemplate}}`,
                fields: ['health', 'mana', 'strength', 'agility', 'intelligence', 'level', 'experience']
            },

            // 生存模拟模板
            survival: {
                name: '生存模拟模板',
                description: '适用于生存游戏的状态管理',
                template: `你正在主持一个生存模拟游戏，需要管理角色的生存状态。

生存要素：
1. 生命值：受伤、疾病、饥饿影响
2. 饥饿度：0-100，低于20时影响行动
3. 口渴度：0-100，低于10时快速损失生命
4. 疲劳度：0-100，影响行动效率
5. 体温：适宜范围36-38度
6. 士气：心理状态，影响判断力

环境影响：
- 恶劣天气增加疲劳和体温变化
- 食物稀缺增加饥饿度
- 危险环境降低士气
- 休息和安全环境恢复状态

请根据情况更新生存状态：<!--STQSB:指令列表-->

角色状态字段：
{{fieldDescriptions}}

{{statusTemplate}}`,
                fields: ['health', 'hunger', 'thirst', 'fatigue', 'temperature', 'morale']
            }
        };
    }

    // 生成字段描述
    generateFieldDescriptions(fields) {
        if (!fields || Object.keys(fields).length === 0) {
            return '暂无状态字段';
        }

        return Object.entries(fields).map(([name, field]) => {
            let description = `- ${name}: ${field.type || 'unknown'}类型`;

            if (field.defaultValue !== undefined) {
                description += `，默认值${field.defaultValue}`;
            }

            if (field.min !== undefined && field.max !== undefined) {
                description += `，范围${field.min}-${field.max}`;
            }

            if (field.description) {
                description += ` - ${field.description}`;
            }

            return description;
        }).join('\n');
    }

    // 生成完整的提示词
    generatePrompt(template, userFields, promptType = 'roleplay') {
        const promptTemplate = this.promptTemplates[promptType];
        if (!promptTemplate) {
            this.log(`未找到提示词模板: ${promptType}`);
            return null;
        }

        const fieldDescriptions = this.generateFieldDescriptions(userFields);

        let prompt = promptTemplate.template
            .replace('{{fieldDescriptions}}', fieldDescriptions)
            .replace('{{statusTemplate}}', template.html || '');

        return {
            content: prompt,
            templateInfo: promptTemplate,
            fields: userFields,
            generated: Date.now()
        };
    }

    // 创建世界书条目
    async createWorldInfoEntry(template, fields, options = {}) {
        try {
            const {
                promptType = 'roleplay',
                keys = ['status', 'stats', 'character_sheet'],
                constant = true,
                position = 'after_char',
                order = 50,
                enabled = true
            } = options;

            const promptData = this.generatePrompt(template, fields, promptType);
            if (!promptData) {
                throw new Error('生成提示词失败');
            }

            const worldInfoEntry = {
                uid: `stqsb-dynamic-status-${Date.now()}`,
                key: Array.isArray(keys) ? keys : [keys],
                keysecondary: Object.keys(fields),
                content: promptData.content,
                comment: `由STQuickStatusBar生成 - ${promptData.templateInfo.name}`,
                constant: constant,
                selective: false,
                probability: 100,
                position: position,
                order: order,
                depth: 1,
                enabled: enabled,
                extensions: {
                    st_quick_status_bar: {
                        type: 'dynamic_status',
                        version: '1.0.0',
                        template: template,
                        fields: fields,
                        promptType: promptType,
                        generated: true,
                        timestamp: Date.now(),
                        config: {
                            updateOnMessage: true,
                            showInChat: true,
                            persistState: true
                        }
                    }
                }
            };

            this.log('创建世界书条目:', worldInfoEntry);
            return worldInfoEntry;

        } catch (error) {
            this.log('创建世界书条目失败:', error);
            throw error;
        }
    }

    // 插入世界书条目到当前角色
    async insertWorldInfoEntry(worldInfoEntry) {
        try {
            const globals = this.getSillyTavernGlobals();
            if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) {
                throw new Error('没有选中的角色');
            }

            const character = globals.characters[globals.this_chid];

            // 确保角色有世界书数据结构
            if (!character.data) character.data = {};
            if (!character.data.character_book) {
                character.data.character_book = {
                    entries: {},
                    extensions: {}
                };
            }

            // 添加条目到角色世界书
            character.data.character_book.entries[worldInfoEntry.uid] = worldInfoEntry;

            // 标记为STQuickStatusBar生成
            if (!character.data.character_book.extensions.st_quick_status_bar) {
                character.data.character_book.extensions.st_quick_status_bar = {
                    entries: []
                };
            }
            character.data.character_book.extensions.st_quick_status_bar.entries.push(worldInfoEntry.uid);

            // 发送到服务器保存
            try {
                const headers = await this.getRequestHeaders();
                const response = await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        avatar: character.avatar,
                        data: {
                            character_book: character.data.character_book
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                this.log('世界书条目插入成功:', worldInfoEntry.uid);
                return worldInfoEntry.uid;

            } catch (syncError) {
                this.log('同步到服务器失败，但本地已保存:', syncError);
                return worldInfoEntry.uid;
            }

        } catch (error) {
            this.log('插入世界书条目失败:', error);
            throw error;
        }
    }

    // 更新现有世界书条目
    async updateWorldInfoEntry(entryUid, newTemplate, newFields) {
        try {
            const globals = this.getSillyTavernGlobals();
            if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) {
                throw new Error('没有选中的角色');
            }

            const character = globals.characters[globals.this_chid];
            const entry = character.data?.character_book?.entries?.[entryUid];

            if (!entry) {
                throw new Error(`找不到世界书条目: ${entryUid}`);
            }

            // 获取原有的提示词类型
            const promptType = entry.extensions?.st_quick_status_bar?.promptType || 'roleplay';

            // 重新生成提示词
            const promptData = this.generatePrompt(newTemplate, newFields, promptType);
            if (!promptData) {
                throw new Error('生成提示词失败');
            }

            // 更新条目内容
            entry.content = promptData.content;
            entry.extensions.st_quick_status_bar.template = newTemplate;
            entry.extensions.st_quick_status_bar.fields = newFields;
            entry.extensions.st_quick_status_bar.timestamp = Date.now();

            // 发送到服务器保存
            const headers = await this.getRequestHeaders();
            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    avatar: character.avatar,
                    data: {
                        character_book: character.data.character_book
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.log('世界书条目更新成功:', entryUid);
            return entryUid;

        } catch (error) {
            this.log('更新世界书条目失败:', error);
            throw error;
        }
    }

    // 删除世界书条目
    async deleteWorldInfoEntry(entryUid) {
        try {
            const globals = this.getSillyTavernGlobals();
            if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) {
                throw new Error('没有选中的角色');
            }

            const character = globals.characters[globals.this_chid];

            // 删除条目
            if (character.data?.character_book?.entries?.[entryUid]) {
                delete character.data.character_book.entries[entryUid];
            }

            // 从扩展列表中移除
            const stqsbExtensions = character.data?.character_book?.extensions?.st_quick_status_bar;
            if (stqsbExtensions && stqsbExtensions.entries) {
                stqsbExtensions.entries = stqsbExtensions.entries.filter(uid => uid !== entryUid);
            }

            // 发送到服务器保存
            const headers = await this.getRequestHeaders();
            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    avatar: character.avatar,
                    data: {
                        character_book: character.data.character_book
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.log('世界书条目删除成功:', entryUid);
            return true;

        } catch (error) {
            this.log('删除世界书条目失败:', error);
            throw error;
        }
    }

    // 获取当前角色的STQuickStatusBar世界书条目
    getCurrentCharacterEntries() {
        try {
            const globals = this.getSillyTavernGlobals();
            if (!globals.this_chid || !globals.characters || !globals.characters[globals.this_chid]) {
                return [];
            }

            const character = globals.characters[globals.this_chid];
            const entries = character.data?.character_book?.entries || {};
            const stqsbEntries = character.data?.character_book?.extensions?.st_quick_status_bar?.entries || [];

            return stqsbEntries.map(uid => entries[uid]).filter(entry => entry);
        } catch (error) {
            this.log('获取角色条目失败:', error);
            return [];
        }
    }

    // 检查是否已有动态状态条目
    hasExistingDynamicStatusEntry() {
        const entries = this.getCurrentCharacterEntries();
        return entries.some(entry =>
            entry.extensions?.st_quick_status_bar?.type === 'dynamic_status'
        );
    }

    // 更新世界书列表（触发SillyTavern界面更新）
    async updateWorldInfoList() {
        try {
            const globals = this.getSillyTavernGlobals();

            // 方法1: 调用SillyTavern的updateWorldInfoList函数
            if (window.updateWorldInfoList && typeof window.updateWorldInfoList === 'function') {
                await window.updateWorldInfoList();
                this.log('通过window.updateWorldInfoList()更新世界书列表');
                return;
            }

            // 方法2: 手动调用API更新
            const headers = await this.getRequestHeaders();
            const response = await fetch('/api/settings/get', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({})
            });

            if (response.ok) {
                const data = await response.json();
                const world_names = data.world_names?.length ? data.world_names : [];

                // 更新世界书选择器
                const worldInfoSelect = document.getElementById('world_info');
                const worldEditorSelect = document.getElementById('world_editor_select');

                if (worldInfoSelect) {
                    // 清除现有选项（保留空选项）
                    const options = Array.from(worldInfoSelect.options).filter(option => option.value !== "");
                    options.forEach(option => option.remove());

                    // 添加新选项
                    world_names.forEach((item, i) => {
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = item;
                        worldInfoSelect.appendChild(option);
                    });
                }

                if (worldEditorSelect) {
                    // 清除现有选项（保留空选项）
                    const options = Array.from(worldEditorSelect.options).filter(option => option.value !== "");
                    options.forEach(option => option.remove());

                    // 添加新选项
                    world_names.forEach((item, i) => {
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = item;
                        worldEditorSelect.appendChild(option);
                    });
                }

                this.log('手动更新世界书列表完成，共', world_names.length, '个世界书');

                // 触发SillyTavern的世界书设置更新事件
                if (globals.eventSource && globals.event_types) {
                    try {
                        globals.eventSource.emit(globals.event_types.WORLDINFO_SETTINGS_UPDATED);
                        this.log('触发WORLDINFO_SETTINGS_UPDATED事件');
                    } catch (e) {
                        this.log('触发事件失败:', e);
                    }
                }

                // 触发世界书编辑器内容刷新
                this.refreshWorldBookEditor();

            } else {
                this.log('获取世界书列表失败:', response.status, response.statusText);
            }

        } catch (error) {
            this.log('更新世界书列表失败:', error);
        }
    }

    // 刷新世界书编辑器内容
    refreshWorldBookEditor() {
        try {
            // 方法1: 触发世界书编辑器选择器的change事件
            const worldEditorSelect = document.getElementById('world_editor_select');
            if (worldEditorSelect) {
                // 使用jQuery触发change事件（SillyTavern使用jQuery）
                if (window.$ && window.$(worldEditorSelect)) {
                    window.$(worldEditorSelect).trigger('change');
                    this.log('通过jQuery触发world_editor_select change事件');
                    return;
                }

                // 备用方案：使用原生事件
                const event = new Event('change', { bubbles: true });
                worldEditorSelect.dispatchEvent(event);
                this.log('通过原生事件触发world_editor_select change事件');
                return;
            }

            // 方法2: 如果有当前选中的世界书，尝试重新加载它
            const worldInfoSelect = document.getElementById('world_info');
            if (worldInfoSelect && worldInfoSelect.value) {
                if (window.$ && window.$(worldInfoSelect)) {
                    window.$(worldInfoSelect).trigger('change');
                    this.log('通过jQuery触发world_info change事件');
                    return;
                }
            }

            this.log('无法找到世界书选择器，跳过编辑器刷新');

        } catch (error) {
            this.log('刷新世界书编辑器失败:', error);
        }
    }

    // 选择并打开指定的世界书
    async selectWorldBook(worldBookName) {
        try {
            // 等待一小段时间确保世界书列表已更新
            await new Promise(resolve => setTimeout(resolve, 500));

            const worldEditorSelect = document.getElementById('world_editor_select');
            if (!worldEditorSelect) {
                this.log('world_editor_select元素不存在');
                return;
            }

            // 查找新创建的世界书在选择器中的索引
            const options = Array.from(worldEditorSelect.options);
            const targetIndex = options.findIndex(option => option.textContent === worldBookName);

            if (targetIndex >= 0) {
                // 设置选中的世界书
                worldEditorSelect.value = targetIndex;

                // 触发change事件来加载世界书内容
                if (window.$ && window.$(worldEditorSelect)) {
                    window.$(worldEditorSelect).trigger('change');
                    this.log('自动选择世界书:', worldBookName, '索引:', targetIndex);
                } else {
                    const event = new Event('change', { bubbles: true });
                    worldEditorSelect.dispatchEvent(event);
                    this.log('通过原生事件自动选择世界书:', worldBookName);
                }

                // 如果世界书编辑器面板没有打开，尝试打开它
                const wiDrawerIcon = document.getElementById('WIDrawerIcon');
                if (wiDrawerIcon && !document.querySelector('#world_popup').style.display !== 'none') {
                    if (window.$ && window.$(wiDrawerIcon)) {
                        window.$(wiDrawerIcon).trigger('click');
                        this.log('自动打开世界书编辑器面板');
                    }
                }

            } else {
                this.log('在世界书列表中未找到:', worldBookName);
                this.log('可用的世界书:', options.map(opt => opt.textContent));
            }

        } catch (error) {
            this.log('选择世界书失败:', error);
        }
    }

    // 获取所有世界书文件
    async getAllWorldBooks() {
        try {
            // SillyTavern没有提供世界书列表API，但我们可以通过其他方式获取
            // 1. 从当前角色的世界书中获取
            // 2. 提供常用的世界书名称建议

            const worldBooks = [];

            // 尝试从SillyTavern的全局对象中获取世界书信息
            const globals = this.getSillyTavernGlobals();

            // 添加一些常用的世界书名称建议
            const commonWorldBooks = [
                'main_world',
                'character_world',
                'fantasy_world',
                'modern_world',
                'sci_fi_world',
                'custom_world'
            ];

            worldBooks.push(...commonWorldBooks.map(name => ({ name, type: 'suggested' })));

            this.log('获取到世界书列表:', worldBooks);
            return worldBooks;

        } catch (error) {
            this.log('获取世界书列表失败:', error);
            // 返回基本的建议列表
            return [
                { name: 'main_world', type: 'suggested' },
                { name: 'character_world', type: 'suggested' }
            ];
        }
    }

    // 创建新的世界书文件
    async createNewWorldBook(name) {
        try {
            this.log('开始创建新世界书:', name);

            const headers = await this.getRequestHeaders();
            this.log('获取到请求头:', headers);

            const requestBody = {
                name: name,
                data: {
                    entries: {}
                }
            };

            this.log('发送请求体:', requestBody);

            // 使用正确的worldinfo/edit端点创建新世界书
            const response = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            this.log('收到响应:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                this.log('响应错误内容:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            this.log('新世界书创建成功:', name, result);

            // 触发世界书列表更新
            await this.updateWorldInfoList();

            // 自动选择新创建的世界书
            await this.selectWorldBook(name);

            return result;
        } catch (error) {
            this.log('创建新世界书失败:', error);
            throw error;
        }
    }

    // 插入条目到指定世界书
    async insertToWorldBook(worldBookName, entry) {
        try {
            const headers = await this.getRequestHeaders();

            // 先获取世界书内容
            const getResponse = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ name: worldBookName })
            });

            if (!getResponse.ok) {
                throw new Error(`无法获取世界书: ${getResponse.status}`);
            }

            const worldBook = await getResponse.json();

            // 添加新条目
            worldBook.entries[entry.uid] = entry;

            // 保存世界书 - 使用edit端点
            const saveResponse = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    name: worldBookName,
                    data: worldBook
                })
            });

            if (!saveResponse.ok) {
                throw new Error(`保存世界书失败: ${saveResponse.status}`);
            }

            this.log('条目已插入到世界书:', worldBookName, entry.uid);

            // 触发世界书列表更新（如果是新创建的世界书）
            await this.updateWorldInfoList();

            return entry.uid;
        } catch (error) {
            this.log('插入到世界书失败:', error);
            throw error;
        }
    }

    // 获取可用的提示词模板列表
    getAvailableTemplates() {
        return Object.entries(this.promptTemplates).map(([key, template]) => ({
            key: key,
            name: template.name,
            description: template.description,
            defaultFields: template.fields
        }));
    }

    // 预览提示词
    previewPrompt(template, fields, promptType = 'roleplay') {
        const promptData = this.generatePrompt(template, fields, promptType);
        return promptData ? promptData.content : null;
    }

    // 日志记录
    log(...args) {
        console.log('[WorldInfoIntegrator]', ...args);
    }
}

// 设计器模态框实现
class DesignerModal {
    constructor(plugin) {
        this.plugin = plugin;
        this.isVisible = false;
        this.modal = null;
        this.currentTemplate = null;
        this.selectedControl = null;
        this.canvasControls = [];

        // 拖动相关变量
        this.isDraggingControl = false;
        this.draggedControl = null;
        this.draggedElement = null;
        this.dragPlaceholder = null;

        this.log('设计器模态框初始化完成');
    }

    // 显示模态框
    show() {
        if (this.isVisible) return;

        this.createModal();
        this.bindEvents();
        this.loadControls();
        this.isVisible = true;
        this.log('设计器模态框显示');
    }

    // 隐藏模态框
    hide() {
        if (!this.isVisible) return;

        if (this.modal) {
            this.modal.classList.remove('show');
            setTimeout(() => {
                this.destroyModal();
            }, 300);
        }

        this.isVisible = false;
        this.log('设计器模态框隐藏');
    }

    // 创建模态框HTML结构
    createModal() {
        // 创建模态框容器
        this.modal = document.createElement('div');
        this.modal.className = 'stqsb-designer-modal';
        this.modal.innerHTML = `
            <div class="stqsb-designer-content">
                <div class="stqsb-designer-header">
                    <h3 class="stqsb-designer-title">STQuickStatusBar 可视化设计器</h3>
                    <button class="stqsb-close-button" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="stqsb-designer-body">
                    <!-- 控件面板 -->
                    <div class="stqsb-controls-panel">
                        <div class="stqsb-controls-header">
                            <h4>控件库</h4>
                        </div>
                        <div class="stqsb-controls-tabs">
                            <button class="stqsb-tab active" data-tab="text">文本</button>
                            <button class="stqsb-tab" data-tab="value">数值</button>
                            <button class="stqsb-tab" data-tab="composite">复合</button>
                        </div>
                        <div class="stqsb-controls-content">
                            <div class="stqsb-tab-content active" data-tab-content="text">
                                <!-- 文本控件将在这里动态生成 -->
                            </div>
                            <div class="stqsb-tab-content" data-tab-content="value">
                                <!-- 数值控件将在这里动态生成 -->
                            </div>
                            <div class="stqsb-tab-content" data-tab-content="composite">
                                <!-- 复合控件将在这里动态生成 -->
                            </div>
                        </div>
                    </div>

                    <!-- 预览面板 -->
                    <div class="stqsb-preview-panel">
                        <div class="stqsb-preview-header">
                            <h4 class="stqsb-preview-title">预览区域</h4>
                            <div class="stqsb-preview-actions">
                                <button class="stqsb-preview-button" id="stqsb-clear-canvas">
                                    <i class="fas fa-trash"></i> 清空
                                </button>
                                <button class="stqsb-preview-button" id="stqsb-preview-template">
                                    <i class="fas fa-eye"></i> 预览
                                </button>
                                <button class="stqsb-preview-button" id="stqsb-generate-code">
                                    <i class="fas fa-code"></i> 生成代码
                                </button>
                                <button class="stqsb-preview-button" id="stqsb-insert-worldinfo">
                                    <i class="fas fa-globe"></i> 插入世界书
                                </button>
                            </div>
                        </div>
                        <div class="stqsb-preview-content">
                            <div class="stqsb-canvas-container">
                                <div class="stqsb-canvas">
                                    <div class="stqsb-drop-zone" id="stqsb-drop-zone">
                                        <i class="fas fa-mouse-pointer"></i>
                                        <p>拖拽控件到这里开始设计</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 属性面板 -->
                    <div class="stqsb-properties-panel">
                        <div class="stqsb-properties-header">
                            <h4>属性设置</h4>
                        </div>
                        <div class="stqsb-properties-content">
                            <div class="stqsb-no-selection">
                                <p>请选择一个控件来编辑属性</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 插入到页面
        document.body.appendChild(this.modal);

        // 显示动画
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 50);
    }

    // 绑定事件
    bindEvents() {
        if (!this.modal) return;

        // 关闭按钮
        const closeButton = this.modal.querySelector('.stqsb-close-button');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.hide());
        }

        // 点击背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // 防止内容区域点击冒泡
        const content = this.modal.querySelector('.stqsb-designer-content');
        if (content) {
            content.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 标签切换
        const tabs = this.modal.querySelectorAll('.stqsb-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 工具栏按钮
        this.bindToolbarEvents();

        // 拖拽事件
        this.bindDragEvents();
    }

    // 绑定工具栏事件
    bindToolbarEvents() {
        // 清空画布
        const clearButton = this.modal.querySelector('#stqsb-clear-canvas');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearCanvas();
            });
        }

        // 预览模板
        const previewButton = this.modal.querySelector('#stqsb-preview-template');
        if (previewButton) {
            previewButton.addEventListener('click', () => {
                this.previewTemplate();
            });
        }

        // 生成代码
        const generateButton = this.modal.querySelector('#stqsb-generate-code');
        if (generateButton) {
            generateButton.addEventListener('click', () => {
                this.generateCode();
            });
        }

        // 插入世界书
        const worldInfoButton = this.modal.querySelector('#stqsb-insert-worldinfo');
        if (worldInfoButton) {
            worldInfoButton.addEventListener('click', () => {
                this.insertWorldInfo();
            });
        }
    }

    // 绑定拖拽事件
    bindDragEvents() {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        // 拖拽进入
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        // 拖拽离开
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        // 拖拽释放
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            // 检查是否是从控件库拖拽的新控件
            const controlData = e.dataTransfer.getData('application/json');
            if (controlData) {
                // 从控件库拖拽，计算放置位置
                const dropZoneRect = dropZone.getBoundingClientRect();
                const position = {
                    x: e.clientX - dropZoneRect.left,
                    y: e.clientY - dropZoneRect.top
                };

                this.addControlToCanvas(JSON.parse(controlData), position);
            }
        });

        // 绑定画布全局鼠标事件用于拖拽
        this.bindCanvasMouseEvents();
    }

    // 绑定画布鼠标事件
    bindCanvasMouseEvents() {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        let isDragging = false;
        let draggedControl = null;
        let draggedElement = null;
        let dragStartPos = null;
        let dragOffset = null;

        // 鼠标按下事件处理
        dropZone.addEventListener('mousedown', (e) => {
            const controlElement = e.target.closest('.stqsb-canvas-control');
            if (!controlElement) return;

            const controlId = controlElement.dataset.controlId;
            const controlInstance = this.canvasControls.find(c => c.id === controlId);

            if (!controlInstance) return;

            // 检查是否点击了移动按钮
            const moveButton = e.target.closest('.stqsb-control-move');
            if (!moveButton) return;

            e.preventDefault();
            e.stopPropagation();

            isDragging = true;
            draggedControl = controlInstance;
            draggedElement = controlElement;

            const rect = controlElement.getBoundingClientRect();
            const dropZoneRect = dropZone.getBoundingClientRect();

            dragStartPos = {
                x: e.clientX,
                y: e.clientY
            };

            dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            // 添加拖拽状态
            controlElement.classList.add('dragging');
            dropZone.classList.add('dragging-active');

            // 设置鼠标样式
            document.body.style.cursor = 'grabbing';

            this.log('开始拖拽控件:', controlInstance.id);
        });

        // 鼠标移动事件处理
        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !draggedElement) return;

            e.preventDefault();

            const dropZoneRect = dropZone.getBoundingClientRect();

            // 计算新位置
            const newX = e.clientX - dropZoneRect.left - dragOffset.x;
            const newY = e.clientY - dropZoneRect.top - dragOffset.y;

            // 边界检查
            const constrainedX = Math.max(0, Math.min(newX, dropZoneRect.width - draggedElement.offsetWidth));
            const constrainedY = Math.max(0, Math.min(newY, dropZoneRect.height - draggedElement.offsetHeight));

            // 更新位置
            draggedElement.style.left = `${constrainedX}px`;
            draggedElement.style.top = `${constrainedY}px`;

            // 显示网格对齐辅助线
            this.showGridHelpers(constrainedX, constrainedY);
        });

        // 鼠标抬起事件处理
        document.addEventListener('mouseup', (e) => {
            if (!isDragging || !draggedControl || !draggedElement) return;

            e.preventDefault();

            const dropZoneRect = dropZone.getBoundingClientRect();

            // 计算最终位置
            const finalX = e.clientX - dropZoneRect.left - dragOffset.x;
            const finalY = e.clientY - dropZoneRect.top - dragOffset.y;

            // 边界检查
            const constrainedX = Math.max(0, Math.min(finalX, dropZoneRect.width - draggedElement.offsetWidth));
            const constrainedY = Math.max(0, Math.min(finalY, dropZoneRect.height - draggedElement.offsetHeight));

            // 网格对齐
            const gridSize = 20;
            const snappedX = Math.round(constrainedX / gridSize) * gridSize;
            const snappedY = Math.round(constrainedY / gridSize) * gridSize;

            // 更新控件位置数据
            draggedControl.position = {
                x: snappedX,
                y: snappedY
            };

            // 应用最终位置
            draggedElement.style.left = `${snappedX}px`;
            draggedElement.style.top = `${snappedY}px`;

            // 清除拖拽状态
            draggedElement.classList.remove('dragging');
            dropZone.classList.remove('dragging-active');

            // 隐藏网格辅助线
            this.hideGridHelpers();

            // 恢复鼠标样式
            document.body.style.cursor = '';

            this.log('控件拖拽完成:', draggedControl.id, draggedControl.position);

            // 重置拖拽状态
            isDragging = false;
            draggedControl = null;
            draggedElement = null;
            dragStartPos = null;
            dragOffset = null;
        });
    }

    // 显示网格对齐辅助线
    showGridHelpers(x, y) {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        const gridSize = 20;
        const snappedX = Math.round(x / gridSize) * gridSize;
        const snappedY = Math.round(y / gridSize) * gridSize;

        // 移除现有辅助线
        this.hideGridHelpers();

        // 创建水平辅助线
        const horizontalHelper = document.createElement('div');
        horizontalHelper.className = 'stqsb-grid-helper horizontal';
        horizontalHelper.style.top = `${snappedY}px`;
        dropZone.appendChild(horizontalHelper);

        // 创建垂直辅助线
        const verticalHelper = document.createElement('div');
        verticalHelper.className = 'stqsb-grid-helper vertical';
        verticalHelper.style.left = `${snappedX}px`;
        dropZone.appendChild(verticalHelper);
    }

    // 隐藏网格辅助线
    hideGridHelpers() {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        const helpers = dropZone.querySelectorAll('.stqsb-grid-helper');
        helpers.forEach(helper => helper.remove());
    }

    // 加载控件库
    loadControls() {
        if (!this.plugin.extendedControls) return;

        const controls = this.plugin.extendedControls.getAllControls();

        // 分类加载控件
        Object.entries(controls).forEach(([category, categoryControls]) => {
            this.loadControlsForCategory(category, categoryControls);
        });
    }

    // 加载特定类别的控件
    loadControlsForCategory(category, categoryControls) {
        const tabContent = this.modal.querySelector(`[data-tab-content="${category}"]`);
        if (!tabContent) return;

        let html = '';

        Object.entries(categoryControls).forEach(([controlType, control]) => {
            html += `
                <div class="stqsb-control-item" draggable="true" data-category="${category}" data-type="${controlType}">
                    <div class="stqsb-control-icon">
                        <i class="${control.icon || 'fas fa-cube'}"></i>
                    </div>
                    <div class="stqsb-control-info">
                        <div class="stqsb-control-name">${control.name}</div>
                        <div class="stqsb-control-desc">${control.description || ''}</div>
                    </div>
                </div>
            `;
        });

        tabContent.innerHTML = html;

        // 绑定拖拽开始事件
        const items = tabContent.querySelectorAll('.stqsb-control-item');
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const category = item.dataset.category;
                const type = item.dataset.type;
                const control = this.plugin.extendedControls.getControl(category, type);

                e.dataTransfer.setData('application/json', JSON.stringify({
                    category: category,
                    type: type,
                    control: control
                }));
            });
        });
    }

    // 切换标签
    switchTab(tabName) {
        // 移除所有活动状态
        const tabs = this.modal.querySelectorAll('.stqsb-tab');
        const contents = this.modal.querySelectorAll('.stqsb-tab-content');

        tabs.forEach(tab => tab.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));

        // 设置新的活动状态
        const activeTab = this.modal.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = this.modal.querySelector(`[data-tab-content="${tabName}"]`);

        if (activeTab) activeTab.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
    }

    // 添加控件到画布
    addControlToCanvas(controlData, position = null) {
        const { category, type, control } = controlData;

        // 生成唯一ID
        const controlId = `stqsb-control-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 计算默认位置
        let defaultPosition = position;
        if (!defaultPosition) {
            // 如果没有指定位置，自动计算一个合适的位置
            const canvasRect = this.modal.querySelector('#stqsb-drop-zone').getBoundingClientRect();
            const canvasControls = this.canvasControls;
            const controlsCount = canvasControls.length;

            // 使用网格布局来放置新控件
            const gridSize = 20; // 网格大小
            const offsetX = 20; // 左边距
            const offsetY = 20; // 上边距

            // 计算位置，避免重叠
            let x = offsetX + (controlsCount % 4) * 160; // 每行4个控件
            let y = offsetY + Math.floor(controlsCount / 4) * 80; // 每80px一行

            defaultPosition = { x, y };
        }

        // 创建控件实例
        const controlInstance = {
            id: controlId,
            category: category,
            type: type,
            control: control,
            properties: this.getDefaultProperties(control),
            position: defaultPosition
        };

        // 添加到画布控件列表
        this.canvasControls.push(controlInstance);

        // 渲染控件
        this.renderCanvasControl(controlInstance);

        // 更新画布状态
        this.updateCanvasState();

        this.log('控件已添加到画布:', controlInstance);
    }

    // 获取默认属性
    getDefaultProperties(control) {
        const properties = {};

        if (control.properties) {
            Object.entries(control.properties).forEach(([key, prop]) => {
                properties[key] = prop.default;
            });
        }

        return properties;
    }

    // 渲染画布控件
    renderCanvasControl(controlInstance) {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        // 如果是第一个控件，移除提示文本
        if (this.canvasControls.length === 1) {
            dropZone.classList.add('has-content');
            dropZone.innerHTML = '';
        }

        // 生成控件HTML
        const controlHtml = this.plugin.extendedControls.generateControlHTML(
            controlInstance.category,
            controlInstance.type,
            controlInstance.properties
        );

        // 创建控件容器
        const controlElement = document.createElement('div');
        controlElement.className = 'stqsb-canvas-control';
        controlElement.dataset.controlId = controlInstance.id;
        controlElement.draggable = true; // 启用拖动

        // 设置绝对定位
        controlElement.style.left = `${controlInstance.position.x}px`;
        controlElement.style.top = `${controlInstance.position.y}px`;

        controlElement.innerHTML = `
            <div class="stqsb-control-wrapper">
                <div class="stqsb-control-actions">
                    <button class="stqsb-control-move" title="移动">
                        <i class="fas fa-arrows-alt"></i>
                    </button>
                    <button class="stqsb-control-edit" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="stqsb-control-delete" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="stqsb-control-preview">
                    ${controlHtml}
                </div>
            </div>
        `;

        // 绑定控件事件
        this.bindControlEvents(controlElement, controlInstance);

        // 添加到画布
        dropZone.appendChild(controlElement);
    }

    // 绑定控件事件
    bindControlEvents(element, controlInstance) {
        // 编辑按钮
        const editButton = element.querySelector('.stqsb-control-edit');
        if (editButton) {
            editButton.addEventListener('click', () => {
                this.editControl(controlInstance);
            });
        }

        // 删除按钮
        const deleteButton = element.querySelector('.stqsb-control-delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                this.deleteControl(controlInstance);
            });
        }

        // 点击选择
        element.addEventListener('click', (e) => {
            if (e.target.closest('.stqsb-control-actions')) return;
            this.selectControl(controlInstance);
        });
    }

    // 编辑控件
    editControl(controlInstance) {
        this.selectedControl = controlInstance;
        this.showPropertiesPanel(controlInstance);
        this.highlightSelectedControl(controlInstance);
    }

    // 选择控件
    selectControl(controlInstance) {
        this.selectedControl = controlInstance;
        this.showPropertiesPanel(controlInstance);
        this.highlightSelectedControl(controlInstance);
    }

    // 删除控件
    deleteControl(controlInstance) {
        // 从控件列表中移除
        this.canvasControls = this.canvasControls.filter(c => c.id !== controlInstance.id);

        // 从DOM中移除
        const element = this.modal.querySelector(`[data-control-id="${controlInstance.id}"]`);
        if (element) {
            element.remove();
        }

        // 更新画布状态
        this.updateCanvasState();

        // 清空属性面板
        if (this.selectedControl && this.selectedControl.id === controlInstance.id) {
            this.selectedControl = null;
            this.hidePropertiesPanel();
        }

        this.log('控件已删除:', controlInstance);
    }

    // 重新渲染画布
    rerenderCanvas() {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        // 清空画布
        dropZone.innerHTML = '';

        // 如果没有控件，显示提示
        if (this.canvasControls.length === 0) {
            dropZone.classList.remove('has-content');
            dropZone.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <p>拖拽控件到这里开始设计</p>
            `;
            return;
        }

        // 重新添加所有控件
        dropZone.classList.add('has-content');
        this.canvasControls.forEach(controlInstance => {
            this.renderCanvasControl(controlInstance);
        });

        // 如果有选中的控件，重新高亮
        if (this.selectedControl) {
            this.highlightSelectedControl(this.selectedControl);
        }
    }

    // 显示属性面板
    showPropertiesPanel(controlInstance) {
        const propertiesContent = this.modal.querySelector('.stqsb-properties-content');
        if (!propertiesContent) return;

        const formHtml = this.plugin.extendedControls.generatePropertyForm(
            controlInstance.category,
            controlInstance.type
        );

        propertiesContent.innerHTML = formHtml;

        // 填充当前值
        this.fillPropertyValues(controlInstance);

        // 绑定属性变化事件
        this.bindPropertyEvents(controlInstance);
    }

    // 填充属性值
    fillPropertyValues(controlInstance) {
        const form = this.modal.querySelector('.control-properties-form');
        if (!form) return;

        Object.entries(controlInstance.properties).forEach(([key, value]) => {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = value;
                } else {
                    input.value = value;
                }
            }
        });
    }

    // 绑定属性事件
    bindPropertyEvents(controlInstance) {
        const form = this.modal.querySelector('.control-properties-form');
        if (!form) return;

        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.updateControlProperty(controlInstance, input.name, input.value);
            });

            input.addEventListener('change', () => {
                this.updateControlProperty(controlInstance, input.name, input.value);
            });
        });
    }

    // 更新控件属性
    updateControlProperty(controlInstance, propertyName, value) {
        // 更新属性值
        controlInstance.properties[propertyName] = value;

        // 重新渲染控件
        this.rerenderControl(controlInstance);

        this.log('控件属性已更新:', propertyName, value);
    }

    // 重新渲染控件
    rerenderControl(controlInstance) {
        const controlElement = this.modal.querySelector(`[data-control-id="${controlInstance.id}"]`);
        if (!controlElement) return;

        const previewContainer = controlElement.querySelector('.stqsb-control-preview');
        if (!previewContainer) return;

        // 生成新的HTML
        const newHtml = this.plugin.extendedControls.generateControlHTML(
            controlInstance.category,
            controlInstance.type,
            controlInstance.properties
        );

        previewContainer.innerHTML = newHtml;
    }

    // 高亮选中的控件
    highlightSelectedControl(controlInstance) {
        // 移除所有高亮
        const allControls = this.modal.querySelectorAll('.stqsb-canvas-control');
        allControls.forEach(control => {
            control.classList.remove('selected');
        });

        // 添加高亮到选中控件
        const selectedElement = this.modal.querySelector(`[data-control-id="${controlInstance.id}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }

    // 隐藏属性面板
    hidePropertiesPanel() {
        const propertiesContent = this.modal.querySelector('.stqsb-properties-content');
        if (propertiesContent) {
            propertiesContent.innerHTML = `
                <div class="stqsb-no-selection">
                    <p>请选择一个控件来编辑属性</p>
                </div>
            `;
        }
    }

    // 更新画布状态
    updateCanvasState() {
        const dropZone = this.modal.querySelector('#stqsb-drop-zone');
        if (!dropZone) return;

        if (this.canvasControls.length === 0) {
            dropZone.classList.remove('has-content');
            dropZone.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <p>拖拽控件到这里开始设计</p>
            `;
        }
    }

    // 清空画布
    clearCanvas() {
        if (this.canvasControls.length === 0) return;

        if (confirm('确定要清空画布吗？所有控件将被删除。')) {
            this.canvasControls = [];
            this.selectedControl = null;
            this.updateCanvasState();
            this.hidePropertiesPanel();
            this.log('画布已清空');
        }
    }

    // 预览模板
    previewTemplate() {
        if (this.canvasControls.length === 0) {
            alert('请先添加一些控件到画布');
            return;
        }

        // 如果有多个控件，显示布局选择对话框
        if (this.canvasControls.length > 1) {
            this.showLayoutSelectionDialog();
        } else {
            // 单个控件直接预览
            const template = this.generateTemplate();
            this.showPreviewWindow(template);
        }
    }

    // 显示布局选择对话框
    showLayoutSelectionDialog(action = 'preview') {
        const dialog = document.createElement('div');
        dialog.className = 'stqsb-layout-dialog';
        dialog.innerHTML = `
            <div class="stqsb-layout-dialog-overlay">
                <div class="stqsb-layout-dialog-content">
                    <h3>选择HTML布局方式</h3>
                    <div class="stqsb-layout-options">
                        <div class="stqsb-layout-option" data-layout="simple">
                            <div class="stqsb-layout-preview">
                                <div class="stqsb-layout-demo-simple">
                                    <span>控件1</span>
                                    <span>控件2</span>
                                    <span>控件3</span>
                                </div>
                            </div>
                            <h4>简单布局</h4>
                            <p>按添加顺序排列控件，适用于简单的线性布局</p>
                        </div>
                        <div class="stqsb-layout-option" data-layout="flow">
                            <div class="stqsb-layout-preview">
                                <div class="stqsb-layout-demo-flow">
                                    <div class="stqsb-layout-row">
                                        <span>控件1</span>
                                        <span>控件2</span>
                                    </div>
                                    <div class="stqsb-layout-row">
                                        <span>控件3</span>
                                    </div>
                                </div>
                            </div>
                            <h4>流式布局</h4>
                            <p>根据控件位置自动分组为行，保持视觉布局结构</p>
                        </div>
                    </div>
                    <div class="stqsb-layout-actions">
                        <button class="stqsb-layout-cancel">取消</button>
                        <button class="stqsb-layout-confirm" disabled>确认</button>
                    </div>
                </div>
            </div>
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .stqsb-layout-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10001;
            }

            .stqsb-layout-dialog-overlay {
                background: rgba(0, 0, 0, 0.8);
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .stqsb-layout-dialog-content {
                background: #2a2a2a;
                border-radius: 12px;
                padding: 24px;
                max-width: 600px;
                width: 90%;
                color: white;
            }

            .stqsb-layout-dialog-content h3 {
                margin: 0 0 24px 0;
                font-size: 20px;
                text-align: center;
            }

            .stqsb-layout-options {
                display: flex;
                gap: 16px;
                margin-bottom: 24px;
            }

            .stqsb-layout-option {
                flex: 1;
                background: #3a3a3a;
                border: 2px solid #444;
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
            }

            .stqsb-layout-option:hover {
                border-color: #667eea;
            }

            .stqsb-layout-option.selected {
                border-color: #667eea;
                background: #4a4a4a;
            }

            .stqsb-layout-preview {
                margin-bottom: 12px;
                padding: 12px;
                background: #1a1a1a;
                border-radius: 6px;
                min-height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .stqsb-layout-demo-simple {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .stqsb-layout-demo-simple span {
                background: #667eea;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
            }

            .stqsb-layout-demo-flow {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .stqsb-layout-row {
                display: flex;
                gap: 6px;
                justify-content: center;
            }

            .stqsb-layout-row span {
                background: #667eea;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
            }

            .stqsb-layout-option h4 {
                margin: 0 0 8px 0;
                font-size: 16px;
                color: #fff;
            }

            .stqsb-layout-option p {
                margin: 0;
                font-size: 14px;
                color: #ccc;
                line-height: 1.4;
            }

            .stqsb-layout-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .stqsb-layout-actions button {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.3s ease;
            }

            .stqsb-layout-cancel {
                background: #666;
                color: white;
            }

            .stqsb-layout-cancel:hover {
                background: #555;
            }

            .stqsb-layout-confirm {
                background: #667eea;
                color: white;
            }

            .stqsb-layout-confirm:hover:not(:disabled) {
                background: #5a67d8;
            }

            .stqsb-layout-confirm:disabled {
                background: #444;
                cursor: not-allowed;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(dialog);

        let selectedLayout = null;
        const confirmButton = dialog.querySelector('.stqsb-layout-confirm');

        // 绑定选项点击事件
        const options = dialog.querySelectorAll('.stqsb-layout-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                // 清除之前的选择
                options.forEach(opt => opt.classList.remove('selected'));

                // 选择当前选项
                option.classList.add('selected');
                selectedLayout = option.dataset.layout;

                // 启用确认按钮
                confirmButton.disabled = false;
            });
        });

        // 绑定按钮事件
        dialog.querySelector('.stqsb-layout-cancel').addEventListener('click', () => {
            dialog.remove();
            style.remove();
        });

        confirmButton.addEventListener('click', () => {
            if (selectedLayout) {
                // 生成对应的模板
                let template;
                if (selectedLayout === 'simple') {
                    template = this.generateTemplate();
                } else if (selectedLayout === 'flow') {
                    template = this.generateLayoutAwareHTML();
                }

                // 根据 action 参数决定执行什么操作
                if (action === 'preview') {
                    this.showPreviewWindow(template);
                } else if (action === 'code') {
                    const code = this.formatGeneratedCode(template);
                    this.showCodeWindow(code);
                }

                // 关闭对话框
                dialog.remove();
                style.remove();
            }
        });

        // 点击背景关闭
        dialog.querySelector('.stqsb-layout-dialog-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                dialog.remove();
                style.remove();
            }
        });
    }

    // 生成模板
    generateTemplate() {
        const template = {
            html: '',
            fields: {},
            defaultValues: {}
        };

        // 根据位置对控件进行分组排序
        const sortedControls = this.sortControlsByPosition(this.canvasControls);

        // 构建HTML
        let html = '<div class="stqsb-dynamic-container">\n';

        sortedControls.forEach(control => {
            const controlHtml = this.plugin.extendedControls.generateControlHTML(
                control.category,
                control.type,
                control.properties
            );
            html += `  ${controlHtml}\n`;

            // 提取字段信息
            if (control.properties.field) {
                template.fields[control.properties.field] = {
                    type: control.type,
                    defaultValue: control.properties.value || control.properties.text || '',
                    min: control.properties.min,
                    max: control.properties.max,
                    updateRule: control.properties.updateRule || 'replace'
                };

                template.defaultValues[control.properties.field] = control.properties.value || control.properties.text || '';
            }
        });

        html += '</div>';
        template.html = html;

        return template;
    }

    // 根据位置对控件进行排序
    sortControlsByPosition(controls) {
        // 创建控件位置副本
        const controlsWithPosition = controls.map(control => ({
            ...control,
            position: control.position || { x: 0, y: 0 }
        }));

        // 按行排序的逻辑
        // 1. 先按Y坐标排序（从上到下）
        // 2. 在同一行内按X坐标排序（从左到右）

        const rowTolerance = 30; // 30px的容差，认为是同一行

        return controlsWithPosition.sort((a, b) => {
            const yDiff = Math.abs(a.position.y - b.position.y);

            // 如果Y坐标差距在容差范围内，认为是同一行
            if (yDiff <= rowTolerance) {
                // 同一行内按X坐标排序
                return a.position.x - b.position.x;
            }

            // 不同行按Y坐标排序
            return a.position.y - b.position.y;
        });
    }

    // 生成带布局信息的HTML
    generateLayoutAwareHTML() {
        const template = {
            html: '',
            fields: {},
            defaultValues: {},
            layout: 'flow' // 标识这是流式布局
        };

        // 根据位置分组控件到行
        const rows = this.groupControlsIntoRows(this.canvasControls);

        // 构建HTML
        let html = '<div class="stqsb-dynamic-container">\n';

        rows.forEach((row, rowIndex) => {
            // 如果一行有多个控件，创建行容器
            if (row.length > 1) {
                html += '  <div class="stqsb-row">\n';

                row.forEach(control => {
                    const controlHtml = this.plugin.extendedControls.generateControlHTML(
                        control.category,
                        control.type,
                        control.properties
                    );
                    html += `    <span class="stqsb-inline-control">${controlHtml}</span>\n`;

                    // 提取字段信息
                    this.extractFieldInfo(control, template);
                });

                html += '  </div>\n';
            } else {
                // 单个控件直接添加
                const control = row[0];
                const controlHtml = this.plugin.extendedControls.generateControlHTML(
                    control.category,
                    control.type,
                    control.properties
                );
                html += `  <div class="stqsb-block-control">${controlHtml}</div>\n`;

                // 提取字段信息
                this.extractFieldInfo(control, template);
            }
        });

        html += '</div>';
        template.html = html;

        return template;
    }

    // 将控件分组到行
    groupControlsIntoRows(controls) {
        if (!controls || controls.length === 0) return [];

        const rows = [];
        const rowTolerance = 30; // 30px的容差

        // 先按Y坐标排序
        const sortedControls = controls.slice().sort((a, b) => {
            const posA = a.position || { x: 0, y: 0 };
            const posB = b.position || { x: 0, y: 0 };
            return posA.y - posB.y;
        });

        let currentRow = [];
        let currentRowY = null;

        sortedControls.forEach(control => {
            const pos = control.position || { x: 0, y: 0 };

            // 检查是否属于当前行
            if (currentRowY === null || Math.abs(pos.y - currentRowY) <= rowTolerance) {
                // 属于当前行
                currentRow.push(control);
                currentRowY = currentRowY === null ? pos.y : Math.min(currentRowY, pos.y);
            } else {
                // 开始新行
                if (currentRow.length > 0) {
                    // 对当前行按X坐标排序
                    currentRow.sort((a, b) => {
                        const posA = a.position || { x: 0, y: 0 };
                        const posB = b.position || { x: 0, y: 0 };
                        return posA.x - posB.x;
                    });
                    rows.push(currentRow);
                }
                currentRow = [control];
                currentRowY = pos.y;
            }
        });

        // 添加最后一行
        if (currentRow.length > 0) {
            currentRow.sort((a, b) => {
                const posA = a.position || { x: 0, y: 0 };
                const posB = b.position || { x: 0, y: 0 };
                return posA.x - posB.x;
            });
            rows.push(currentRow);
        }

        return rows;
    }

    // 提取字段信息
    extractFieldInfo(control, template) {
        if (control.properties.field) {
            template.fields[control.properties.field] = {
                type: control.type,
                defaultValue: control.properties.value || control.properties.text || '',
                min: control.properties.min,
                max: control.properties.max,
                updateRule: control.properties.updateRule || 'replace'
            };

            template.defaultValues[control.properties.field] = control.properties.value || control.properties.text || '';
        }
    }

    // 显示预览窗口
    showPreviewWindow(template) {
        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        previewWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>STQuickStatusBar 预览</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #2a2a2a; color: #fff; }
                    .preview-container { max-width: 600px; margin: 0 auto; }
                    .preview-title { text-align: center; margin-bottom: 30px; }
                    ${this.getPreviewCSS()}
                </style>
            </head>
            <body>
                <div class="preview-container">
                    <h2 class="preview-title">STQuickStatusBar 预览</h2>
                    ${template.html}
                </div>
            </body>
            </html>
        `);
        previewWindow.document.close();
    }

    // 获取预览CSS
    getPreviewCSS() {
        return `
            .stqsb-dynamic-container { font-family: Arial, sans-serif; color: #fff; }
            .stqsb-dynamic-container .label-text { display: inline-block; margin-right: 10px; font-weight: bold; }
            .stqsb-dynamic-container .static-text { color: #fff; }
            .stqsb-dynamic-container .dynamic-text { color: #ffd700; font-weight: bold; }
            .stqsb-dynamic-container .number-display {
                display: inline-block; background: #4a5568; color: #fff;
                padding: 4px 8px; border-radius: 4px; margin: 0 4px; font-weight: bold;
            }
            .stqsb-dynamic-container .number-input, .stqsb-dynamic-container .text-input {
                background: #4a5568; border: 1px solid #666; color: #fff;
                padding: 4px 8px; border-radius: 4px; margin: 0 4px;
            }
            .stqsb-dynamic-container .progress {
                width: 100%; height: 20px; background: #2a2a2a;
                border-radius: 10px; overflow: hidden; margin: 8px 0;
            }
            .stqsb-dynamic-container .progress-bar {
                height: 100%; background: #28a745; transition: width 0.3s ease;
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 12px; font-weight: bold;
            }

            /* 流式布局专用样式 */
            .stqsb-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 8px 0;
                flex-wrap: wrap;
            }

            .stqsb-inline-control {
                display: inline-block;
            }

            .stqsb-block-control {
                display: block;
                margin: 12px 0;
            }

            .stqsb-block-control:first-child {
                margin-top: 0;
            }

            .stqsb-block-control:last-child {
                margin-bottom: 0;
            }
        `;
    }

    // 生成代码
    generateCode() {
        if (this.canvasControls.length === 0) {
            alert('请先添加一些控件到画布');
            return;
        }

        // 如果有多个控件，显示布局选择对话框
        if (this.canvasControls.length > 1) {
            this.showLayoutSelectionDialog('code');
        } else {
            // 单个控件直接生成代码
            const template = this.generateTemplate();
            const code = this.formatGeneratedCode(template);
            this.showCodeWindow(code);
        }
    }

    // 格式化生成的代码
    formatGeneratedCode(template) {
        return {
            html: template.html,
            fields: JSON.stringify(template.fields, null, 2),
            defaultValues: JSON.stringify(template.defaultValues, null, 2),
            complete: `
// STQuickStatusBar 生成的模板
const template = {
    html: \`${template.html}\`,
    fields: ${JSON.stringify(template.fields, null, 2)},
    defaultValues: ${JSON.stringify(template.defaultValues, null, 2)}
};

// 使用示例
const statusDisplay = new RealTimeStatusDisplay();
statusDisplay.createStatusDisplay(template);
            `.trim()
        };
    }

    // 显示代码窗口
    showCodeWindow(code) {
        const codeWindow = window.open('', '_blank', 'width=900,height=700');
        codeWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>STQuickStatusBar 生成代码</title>
                <style>
                    body { font-family: 'Consolas', monospace; padding: 20px; background: #1e1e1e; color: #fff; }
                    .code-container { max-width: 100%; }
                    .code-section { margin-bottom: 30px; }
                    .code-title { color: #4ec9b0; font-size: 16px; font-weight: bold; margin-bottom: 10px; }
                    .code-content { background: #2a2a2a; padding: 15px; border-radius: 8px; overflow-x: auto; }
                    pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
                    .copy-button { background: #007acc; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; float: right; }
                    .copy-button:hover { background: #005a9e; }
                </style>
            </head>
            <body>
                <div class="code-container">
                    <h2>STQuickStatusBar 生成代码</h2>

                    <div class="code-section">
                        <div class="code-title">
                            HTML 模板
                            <button class="copy-button" onclick="copyToClipboard('html')">复制</button>
                        </div>
                        <div class="code-content">
                            <pre id="html">${this.escapeHtml(code.html)}</pre>
                        </div>
                    </div>

                    <div class="code-section">
                        <div class="code-title">
                            字段定义
                            <button class="copy-button" onclick="copyToClipboard('fields')">复制</button>
                        </div>
                        <div class="code-content">
                            <pre id="fields">${code.fields}</pre>
                        </div>
                    </div>

                    <div class="code-section">
                        <div class="code-title">
                            默认值
                            <button class="copy-button" onclick="copyToClipboard('defaultValues')">复制</button>
                        </div>
                        <div class="code-content">
                            <pre id="defaultValues">${code.defaultValues}</pre>
                        </div>
                    </div>

                    <div class="code-section">
                        <div class="code-title">
                            完整代码
                            <button class="copy-button" onclick="copyToClipboard('complete')">复制</button>
                        </div>
                        <div class="code-content">
                            <pre id="complete">${this.escapeHtml(code.complete)}</pre>
                        </div>
                    </div>
                </div>

                <script>
                    function copyToClipboard(elementId) {
                        const element = document.getElementById(elementId);
                        const text = element.textContent;
                        navigator.clipboard.writeText(text).then(() => {
                            alert('代码已复制到剪贴板');
                        });
                    }
                </script>
            </body>
            </html>
        `);
        codeWindow.document.close();
    }

    // 显示世界书选择对话框
    async showWorldBookSelectionDialog() {
        try {
            // 获取所有世界书
            const worldBooks = await this.plugin.worldInfoIntegrator.getAllWorldBooks();

            const dialog = document.createElement('div');
            dialog.className = 'stqsb-worldbook-dialog';
            dialog.innerHTML = `
                <div class="stqsb-worldbook-dialog-overlay">
                    <div class="stqsb-worldbook-dialog-content">
                        <h3>选择世界书</h3>
                        <div class="stqsb-worldbook-options">
                            <div class="stqsb-worldbook-section">
                                <h4>推荐选项</h4>
                                <div class="stqsb-worldbook-list">
                                    <div class="stqsb-worldbook-item stqsb-worldbook-recommended" data-worldbook="character_world">
                                        <div class="stqsb-worldbook-info">
                                            <div class="stqsb-worldbook-name">插入到当前角色世界书</div>
                                            <div class="stqsb-worldbook-desc">推荐：直接插入到当前角色的世界书中，最简单可靠</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            ${worldBooks.length > 0 ? `
                                <div class="stqsb-worldbook-divider"></div>
                                <div class="stqsb-worldbook-section">
                                    <h4>其他世界书选项</h4>
                                    <div class="stqsb-worldbook-list">
                                        ${worldBooks.map(book => `
                                            <div class="stqsb-worldbook-item" data-worldbook="${book.name}">
                                                <div class="stqsb-worldbook-info">
                                                    <div class="stqsb-worldbook-name">${book.name}</div>
                                                    <div class="stqsb-worldbook-desc">${book.type === 'suggested' ? '建议的世界书名称' : (Object.keys(book.entries || {}).length + ' 个条目')}</div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="stqsb-worldbook-divider"></div>
                            ` : ''}
                            <div class="stqsb-worldbook-section">
                                <h4>创建新世界书</h4>
                                <div class="stqsb-worldbook-create">
                                    <input type="text" class="stqsb-worldbook-name-input" placeholder="输入世界书名称" value="STQuickStatusBar动态状态">
                                    <button class="stqsb-worldbook-create-btn">创建新世界书</button>
                                </div>
                            </div>
                        </div>
                        <div class="stqsb-worldbook-actions">
                            <button class="stqsb-worldbook-cancel">取消</button>
                        </div>
                    </div>
                </div>
            `;

            // 添加样式
            const style = document.createElement('style');
            style.textContent = `
                .stqsb-worldbook-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10002;
                }

                .stqsb-worldbook-dialog-overlay {
                    background: rgba(0, 0, 0, 0.8);
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .stqsb-worldbook-dialog-content {
                    background: #2a2a2a;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    color: white;
                }

                .stqsb-worldbook-dialog-content h3 {
                    margin: 0 0 24px 0;
                    font-size: 20px;
                    text-align: center;
                    color: #fff;
                }

                .stqsb-worldbook-dialog-content h4 {
                    margin: 0 0 16px 0;
                    font-size: 16px;
                    color: #ccc;
                }

                .stqsb-worldbook-section {
                    margin-bottom: 24px;
                }

                .stqsb-worldbook-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .stqsb-worldbook-item {
                    background: #3a3a3a;
                    border: 2px solid #444;
                    border-radius: 8px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .stqsb-worldbook-item:hover {
                    border-color: #667eea;
                    background: #4a4a4a;
                }

                .stqsb-worldbook-item.selected {
                    border-color: #667eea;
                    background: #4a4a4a;
                }

                .stqsb-worldbook-recommended {
                    background: #2d4a2d;
                    border-color: #28a745;
                }

                .stqsb-worldbook-recommended:hover {
                    background: #3a5a3a;
                    border-color: #28a745;
                }

                .stqsb-worldbook-recommended.selected {
                    background: #3a5a3a;
                    border-color: #28a745;
                }

                .stqsb-worldbook-name {
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 4px;
                }

                .stqsb-worldbook-desc {
                    font-size: 14px;
                    color: #aaa;
                }

                .stqsb-worldbook-divider {
                    height: 1px;
                    background: #444;
                    margin: 20px 0;
                }

                .stqsb-worldbook-create {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }

                .stqsb-worldbook-name-input {
                    flex: 1;
                    background: #3a3a3a;
                    border: 1px solid #555;
                    border-radius: 6px;
                    color: #fff;
                    padding: 10px 12px;
                    font-size: 14px;
                }

                .stqsb-worldbook-name-input:focus {
                    outline: none;
                    border-color: #667eea;
                }

                .stqsb-worldbook-create-btn {
                    background: #667eea;
                    border: none;
                    color: white;
                    padding: 10px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    white-space: nowrap;
                }

                .stqsb-worldbook-create-btn:hover {
                    background: #5a67d8;
                }

                .stqsb-worldbook-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    margin-top: 24px;
                }

                .stqsb-worldbook-actions button {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                }

                .stqsb-worldbook-cancel {
                    background: #666;
                    color: white;
                }

                .stqsb-worldbook-cancel:hover {
                    background: #555;
                }
            `;

            document.head.appendChild(style);
            document.body.appendChild(dialog);

            let selectedWorldBook = null;

            // 绑定现有世界书点击事件
            const worldBookItems = dialog.querySelectorAll('.stqsb-worldbook-item');
            worldBookItems.forEach(item => {
                item.addEventListener('click', () => {
                    // 清除之前的选择
                    worldBookItems.forEach(i => i.classList.remove('selected'));

                    // 选择当前项
                    item.classList.add('selected');
                    selectedWorldBook = item.dataset.worldbook;
                });
            });

            // 绑定创建新世界书按钮事件
            const createBtn = dialog.querySelector('.stqsb-worldbook-create-btn');
            const nameInput = dialog.querySelector('.stqsb-worldbook-name-input');

            createBtn.addEventListener('click', async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    alert('请输入世界书名称');
                    return;
                }

                try {
                    await this.plugin.worldInfoIntegrator.createNewWorldBook(name);
                    selectedWorldBook = name;

                    // 关闭对话框并执行插入
                    dialog.remove();
                    style.remove();

                    await this.executeWorldBookInsertion(selectedWorldBook);
                } catch (error) {
                    alert(`创建世界书失败: ${error.message}`);
                }
            });

            // 绑定取消按钮事件
            dialog.querySelector('.stqsb-worldbook-cancel').addEventListener('click', () => {
                dialog.remove();
                style.remove();
            });

            // 点击背景关闭
            dialog.querySelector('.stqsb-worldbook-dialog-overlay').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    dialog.remove();
                    style.remove();
                }
            });

            // 双击现有世界书直接插入
            worldBookItems.forEach(item => {
                item.addEventListener('dblclick', async () => {
                    selectedWorldBook = item.dataset.worldbook;
                    dialog.remove();
                    style.remove();

                    await this.executeWorldBookInsertion(selectedWorldBook);
                });
            });

        } catch (error) {
            this.log('显示世界书选择对话框失败:', error);
            alert(`获取世界书列表失败: ${error.message}`);
        }
    }

    // 执行世界书插入
    async executeWorldBookInsertion(worldBookName) {
        try {
            // 生成模板
            const template = this.generateTemplate();

            // 创建世界书条目
            const entry = await this.plugin.worldInfoIntegrator.createWorldInfoEntry(template, template.fields);

            // 优先插入到角色世界书，这样更简单可靠
            if (worldBookName === 'character_world' || worldBookName.includes('角色')) {
                // 插入到角色世界书
                await this.plugin.worldInfoIntegrator.insertWorldInfoEntry(entry);
                alert(`世界书条目已成功插入到当前角色的世界书中！\\nAI现在会根据对话内容自动更新状态数值。`);
            } else {
                // 插入到指定世界书文件
                await this.plugin.worldInfoIntegrator.insertToWorldBook(worldBookName, entry);
                alert(`世界书条目已成功插入到 "${worldBookName}"！\\nAI现在会根据对话内容自动更新状态数值。`);
            }

            this.log('世界书条目已插入:', worldBookName, entry.uid);

            // 触发世界书列表更新
            await this.plugin.worldInfoIntegrator.updateWorldInfoList();

        } catch (error) {
            this.log('执行世界书插入失败:', error);

            // 提供更友好的错误信息
            let errorMessage = error.message;
            if (error.message.includes('CSRF token')) {
                errorMessage = 'CSRF token验证失败，请刷新页面后重试。这通常是由于页面长时间未刷新导致的。';
            } else if (error.message.includes('getRequestHeaders')) {
                errorMessage = '无法获取请求头信息，请确保在SillyTavern环境中使用此插件。';
            } else if (error.message.includes('没有选中的角色')) {
                errorMessage = '请先选择一个角色，然后再尝试插入世界书。';
            }

            alert(`插入世界书失败: ${errorMessage}`);
        }
    }

    // 插入世界书
    async insertWorldInfo() {
        if (this.canvasControls.length === 0) {
            alert('请先添加一些控件到画布');
            return;
        }

        // 显示世界书选择对话框
        await this.showWorldBookSelectionDialog();
    }

    // 转义HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 销毁模态框
    destroyModal() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        // 清理状态
        this.selectedControl = null;
        this.canvasControls = [];
    }

    // 销毁
    destroy() {
        this.hide();
        this.destroyModal();
        this.isVisible = false;
    }

    // 日志记录
    log(...args) {
        console.log('[DesignerModal]', ...args);
    }
}

// 实时状态显示类实现
class RealTimeStatusDisplay {
    constructor() {
        this.active = false;
        this.container = null;
        this.template = null;
        this.renderEngine = null;
        this.currentState = {};
        this.isCollapsed = false;
        this.position = { x: 20, y: 20 };
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.updateQueue = [];
        this.isUpdating = false;
        this.log('实时状态显示器初始化完成');
    }

    // 获取 SillyTavern 全局对象的辅助方法
    getSillyTavernGlobals() {
        try {
            const globals = {
                eventSource: window.eventSource,
                event_types: window.event_types,
                chat: window.chat,
                characters: window.characters,
                this_chid: window.this_chid,
                extension_settings: window.extension_settings,
                saveSettingsDebounced: window.saveSettingsDebounced,
                getRequestHeaders: window.getRequestHeaders,
                getContext: window.getContext,
                SillyTavern: window.SillyTavern
            };

            // 如果直接访问失败，尝试从SillyTavern对象获取
            if (!globals.getRequestHeaders && window.SillyTavern) {
                try {
                    const context = window.SillyTavern.getContext();
                    if (context && context.getRequestHeaders) {
                        globals.getRequestHeaders = context.getRequestHeaders;
                    }
                } catch (e) {
                    console.debug('[RealTimeStatusDisplay] 无法从SillyTavern.getContext()获取getRequestHeaders');
                }
            }

            return globals;
        } catch (error) {
            console.error('[RealTimeStatusDisplay] 获取SillyTavern全局对象失败:', error);
            return {};
        }
    }

    // 创建状态显示面板
    createStatusDisplay(template) {
        try {
            this.log('创建状态显示面板:', template);

            // 保存模板
            this.template = template;

            // 销毁现有容器
            if (this.container) {
                this.destroy();
            }

            // 创建容器
            this.container = document.createElement('div');
            this.container.className = 'stqsb-status-display';
            this.container.style.cssText = `
                position: fixed;
                top: ${this.position.y}px;
                right: ${this.position.x}px;
                width: 320px;
                background: rgba(0, 0, 0, 0.95);
                border: 1px solid #444444;
                border-radius: 12px;
                color: white;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                z-index: 1000;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                user-select: none;
            `;

            // 创建标题栏
            this.createHeader();

            // 创建内容区域
            this.createContent();

            // 初始化渲染引擎
            this.initializeRenderEngine();

            // 添加到页面
            document.body.appendChild(this.container);

            // 绑定事件
            this.bindEvents();

            // 激活状态
            this.active = true;

            // 添加淡入动画
            requestAnimationFrame(() => {
                this.container.style.opacity = '1';
                this.container.style.transform = 'translateY(0)';
            });

            this.log('状态显示面板创建完成');

        } catch (error) {
            this.log('创建状态显示面板失败:', error);
        }
    }

    // 创建标题栏
    createHeader() {
        const header = document.createElement('div');
        header.className = 'stqsb-status-header';
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px 12px 0 0;
            cursor: move;
            user-select: none;
        `;

        const title = document.createElement('div');
        title.className = 'stqsb-status-title';
        title.textContent = '动态状态面板';
        title.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: white;
        `;

        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        // 折叠按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'stqsb-toggle-btn';
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        toggleBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: background-color 0.3s ease;
        `;

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'stqsb-close-btn';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: background-color 0.3s ease;
        `;

        // 添加悬停效果
        [toggleBtn, closeBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'transparent';
            });
        });

        controls.appendChild(toggleBtn);
        controls.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(controls);

        this.container.appendChild(header);

        // 保存引用
        this.header = header;
        this.toggleBtn = toggleBtn;
        this.closeBtn = closeBtn;
    }

    // 创建内容区域
    createContent() {
        const content = document.createElement('div');
        content.className = 'stqsb-status-content';
        content.style.cssText = `
            padding: 16px;
            max-height: 400px;
            overflow-y: auto;
            transition: max-height 0.3s ease;
        `;

        // 添加初始内容
        if (this.template && this.template.html) {
            content.innerHTML = this.template.html;
        } else {
            content.innerHTML = `
                <div style="text-align: center; color: #aaa; padding: 20px;">
                    <i class="fas fa-chart-line" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>暂无状态数据</p>
                    <p style="font-size: 12px;">通过设计器创建状态模板</p>
                </div>
            `;
        }

        this.container.appendChild(content);
        this.content = content;
    }

    // 初始化渲染引擎
    initializeRenderEngine() {
        if (!this.template) return;

        this.renderEngine = new DynamicRenderEngine();
        this.renderEngine.init(this.content, this.template);

        // 初始化状态
        this.currentState = { ...this.template.defaultValues };

        this.log('渲染引擎初始化完成');
    }

    // 绑定事件
    bindEvents() {
        // 拖拽事件
        this.header.addEventListener('mousedown', this.handleDragStart.bind(this));
        document.addEventListener('mousemove', this.handleDragMove.bind(this));
        document.addEventListener('mouseup', this.handleDragEnd.bind(this));

        // 折叠/展开
        this.toggleBtn.addEventListener('click', this.toggleCollapse.bind(this));

        // 关闭
        this.closeBtn.addEventListener('click', this.hide.bind(this));

        // 双击标题栏重置位置
        this.header.addEventListener('dblclick', this.resetPosition.bind(this));

        // 监听状态变化
        this.container.addEventListener('stateChanged', (e) => {
            this.onStateChanged(e.detail);
        });
    }

    // 处理拖拽开始
    handleDragStart(e) {
        if (e.target.closest('.stqsb-toggle-btn') || e.target.closest('.stqsb-close-btn')) {
            return;
        }

        this.isDragging = true;
        this.dragOffset.x = e.clientX - this.container.offsetLeft;
        this.dragOffset.y = e.clientY - this.container.offsetTop;

        this.container.style.transition = 'none';
        this.container.style.cursor = 'grabbing';

        e.preventDefault();
    }

    // 处理拖拽移动
    handleDragMove(e) {
        if (!this.isDragging) return;

        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;

        // 限制在视窗内
        const maxX = window.innerWidth - this.container.offsetWidth;
        const maxY = window.innerHeight - this.container.offsetHeight;

        const clampedX = Math.max(0, Math.min(x, maxX));
        const clampedY = Math.max(0, Math.min(y, maxY));

        this.container.style.left = `${clampedX}px`;
        this.container.style.top = `${clampedY}px`;
        this.container.style.right = 'auto';

        this.position.x = clampedX;
        this.position.y = clampedY;

        e.preventDefault();
    }

    // 处理拖拽结束
    handleDragEnd(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.container.style.transition = 'all 0.3s ease';
        this.container.style.cursor = 'default';

        // 保存位置
        this.savePosition();
    }

    // 折叠/展开
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;

        if (this.isCollapsed) {
            this.content.style.maxHeight = '0';
            this.content.style.padding = '0 16px';
            this.toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        } else {
            this.content.style.maxHeight = '400px';
            this.content.style.padding = '16px';
            this.toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        }
    }

    // 重置位置
    resetPosition() {
        this.position = { x: 20, y: 20 };
        this.container.style.left = 'auto';
        this.container.style.top = `${this.position.y}px`;
        this.container.style.right = `${this.position.x}px`;
        this.savePosition();
    }

    // 保存位置
    savePosition() {
        try {
            const positions = JSON.parse(localStorage.getItem('stqsb-positions') || '{}');
            positions.statusDisplay = this.position;
            localStorage.setItem('stqsb-positions', JSON.stringify(positions));
        } catch (error) {
            this.log('保存位置失败:', error);
        }
    }

    // 加载位置
    loadPosition() {
        try {
            const positions = JSON.parse(localStorage.getItem('stqsb-positions') || '{}');
            if (positions.statusDisplay) {
                this.position = positions.statusDisplay;
            }
        } catch (error) {
            this.log('加载位置失败:', error);
        }
    }

    // 处理AI指令
    processAICommands(commands) {
        if (!this.renderEngine || !this.active) return;

        this.log('处理AI指令:', commands);

        // 添加到更新队列
        this.updateQueue.push(...commands);

        // 处理更新队列
        this.processUpdateQueue();
    }

    // 处理更新队列
    async processUpdateQueue() {
        if (this.isUpdating || this.updateQueue.length === 0) return;

        this.isUpdating = true;

        try {
            // 批量处理指令
            const commands = this.updateQueue.splice(0);

            // 使用渲染引擎处理指令
            this.renderEngine.processAICommands(commands);

            // 更新当前状态
            this.updateCurrentState(commands);

            // 显示变化提示
            if (commands.length > 0) {
                this.showUpdateNotification(commands.length);
            }

        } catch (error) {
            this.log('处理更新队列失败:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    // 更新当前状态
    updateCurrentState(commands) {
        commands.forEach(command => {
            const oldValue = this.currentState[command.field];
            let newValue = oldValue;

            switch (command.type) {
                case 'increase':
                    newValue = (oldValue || 0) + command.value;
                    break;
                case 'decrease':
                    newValue = (oldValue || 0) - command.value;
                    break;
                case 'set':
                    newValue = command.value;
                    break;
                case 'setText':
                    newValue = command.value;
                    break;
                case 'delete':
                    newValue = null;
                    break;
                case 'enable':
                    newValue = true;
                    break;
                case 'disable':
                    newValue = false;
                    break;
            }

            if (newValue !== oldValue) {
                this.currentState[command.field] = newValue;
            }
        });
    }

    // 显示更新通知
    showUpdateNotification(count) {
        const notification = document.createElement('div');
        notification.className = 'stqsb-update-notification';
        notification.textContent = `+${count}`;
        notification.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            z-index: 1001;
            animation: pulse 1s ease-in-out;
        `;

        this.container.appendChild(notification);

        // 2秒后移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 2000);
    }

    // 加载角色状态
    loadCharacterState() {
        try {
            this.log('加载角色状态');

            // 如果没有渲染引擎，跳过
            if (!this.renderEngine) return;

            // 从SillyTavern获取角色数据
            const globals = this.getSillyTavernGlobals();
            if (!globals.getContext) {
                this.log('getContext不可用，跳过状态加载');
                return;
            }

            const context = globals.getContext();
            if (!context || !context.characterId) return;

            const character = context.characters[context.characterId];
            if (!character || !character.data) return;

            // 获取插件数据
            const pluginData = character.data.extensions?.STQuickStatusBar;
            if (!pluginData || !pluginData.state) return;

            // 导入状态
            this.importState(pluginData.state);

            this.log('角色状态加载完成');

        } catch (error) {
            this.log('加载角色状态失败:', error);
        }
    }

    // 导出状态
    exportState() {
        return {
            currentState: { ...this.currentState },
            position: { ...this.position },
            isCollapsed: this.isCollapsed,
            timestamp: Date.now(),
            version: '1.0.0'
        };
    }

    // 导入状态
    importState(state) {
        try {
            this.log('导入状态:', state);

            if (state.currentState) {
                this.currentState = { ...state.currentState };

                // 更新渲染引擎状态
                if (this.renderEngine) {
                    this.renderEngine.importState({
                        currentState: this.currentState,
                        changeHistory: [],
                        timestamp: Date.now()
                    });
                }
            }

            if (state.position) {
                this.position = { ...state.position };
                if (this.container) {
                    this.container.style.left = 'auto';
                    this.container.style.top = `${this.position.y}px`;
                    this.container.style.right = `${this.position.x}px`;
                }
            }

            if (state.isCollapsed !== undefined) {
                this.isCollapsed = state.isCollapsed;
                if (this.container) {
                    this.toggleCollapse();
                }
            }

            this.log('状态导入完成');

        } catch (error) {
            this.log('导入状态失败:', error);
        }
    }

    // 状态变化处理
    onStateChanged(detail) {
        this.log('状态变化:', detail);

        // 自动保存状态到角色
        this.autoSaveState();
    }

    // 自动保存状态
    autoSaveState() {
        try {
            const globals = this.getSillyTavernGlobals();
            if (!globals.getContext) {
                this.log('getContext不可用，跳过自动保存');
                return;
            }

            const context = globals.getContext();
            if (!context || !context.characterId) return;

            const character = context.characters[context.characterId];
            if (!character) return;

            // 初始化数据结构
            if (!character.data) character.data = {};
            if (!character.data.extensions) character.data.extensions = {};

            // 保存状态
            character.data.extensions.STQuickStatusBar = {
                ...character.data.extensions.STQuickStatusBar,
                state: this.exportState()
            };

            // 发送到服务器（防抖）
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
            }

            this.saveTimeout = setTimeout(() => {
                this.syncToServer(character);
            }, 1000);

        } catch (error) {
            this.log('自动保存状态失败:', error);
        }
    }

    // 同步到服务器
    async syncToServer(character) {
        try {
            const globals = this.getSillyTavernGlobals();

            // 获取请求头，使用多种备用方案
            let headers;

            // 方案1: 使用SillyTavern的getRequestHeaders函数
            if (globals.getRequestHeaders && typeof globals.getRequestHeaders === 'function') {
                try {
                    headers = globals.getRequestHeaders();
                    this.log('成功获取SillyTavern请求头:', headers);
                } catch (error) {
                    this.log('getRequestHeaders调用失败，尝试备用方案:', error);
                }
            }

            // 方案2: 使用备用方案获取token
            if (!headers && window.token) {
                headers = {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': window.token
                };
                this.log('使用备用方案获取请求头:', headers);
            }

            // 如果所有方案都失败
            if (!headers) {
                throw new Error('无法获取CSRF token，请刷新页面重试');
            }

            const response = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    avatar: character.avatar,
                    data: {
                        extensions: {
                            STQuickStatusBar: character.data.extensions.STQuickStatusBar
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.log('状态同步到服务器完成');

        } catch (error) {
            this.log('同步到服务器失败:', error);
        }
    }

    // 显示面板
    show() {
        if (!this.container) return;

        this.container.style.display = 'block';
        this.active = true;

        // 添加显示动画
        requestAnimationFrame(() => {
            this.container.style.opacity = '1';
            this.container.style.transform = 'translateY(0)';
        });
    }

    // 隐藏面板
    hide() {
        if (!this.container) return;

        this.container.style.opacity = '0';
        this.container.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            if (this.container) {
                this.container.style.display = 'none';
            }
            this.active = false;
        }, 300);
    }

    // 检查是否激活
    isActive() {
        return this.active;
    }

    // 获取统计信息
    getStats() {
        return {
            active: this.active,
            fieldsCount: Object.keys(this.currentState).length,
            hasTemplate: !!this.template,
            isCollapsed: this.isCollapsed,
            position: { ...this.position },
            lastUpdate: Date.now()
        };
    }

    // 销毁
    destroy() {
        this.log('销毁实时状态显示器');

        // 清理定时器
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // 清理渲染引擎
        if (this.renderEngine) {
            this.renderEngine.destroy();
            this.renderEngine = null;
        }

        // 移除DOM元素
        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        // 清理状态
        this.active = false;
        this.template = null;
        this.currentState = {};
        this.updateQueue = [];
        this.isUpdating = false;

        this.log('实时状态显示器销毁完成');
    }

    // 日志记录
    log(...args) {
        console.log('[RealTimeStatusDisplay]', ...args);
    }
}

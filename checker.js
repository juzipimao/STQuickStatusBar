/**
 * STQuickStatusBar 插件状态检查工具
 * 用于验证插件各个组件的工作状态
 */

(function() {
    'use strict';
    
    // 检查工具类
    class STQuickStatusBarChecker {
        constructor() {
            this.results = {
                pluginLoad: false,
                globalAccess: false,
                controlLibrary: false,
                aiParser: false,
                renderEngine: false,
                worldInfo: false,
                designerModal: false,
                statusDisplay: false
            };
            
            this.errors = [];
        }
        
        // 执行完整检查
        async runFullCheck() {
            console.log('🔍 开始 STQuickStatusBar 插件状态检查...');
            
            try {
                await this.checkPluginLoad();
                await this.checkGlobalAccess();
                await this.checkControlLibrary();
                await this.checkAIParser();
                await this.checkRenderEngine();
                await this.checkWorldInfo();
                await this.checkDesignerModal();
                await this.checkStatusDisplay();
                
                this.generateReport();
                
            } catch (error) {
                console.error('❌ 检查过程中发生错误:', error);
                this.errors.push('检查过程异常: ' + error.message);
            }
        }
        
        // 检查插件加载
        async checkPluginLoad() {
            console.log('📋 检查插件加载状态...');
            
            try {
                if (window.STQuickStatusBar && typeof window.STQuickStatusBar === 'object') {
                    this.results.pluginLoad = true;
                    console.log('✅ 插件主实例已加载');
                    
                    // 检查插件状态
                    const status = window.STQuickStatusBar.getStatus();
                    console.log('📊 插件状态:', status);
                    
                } else {
                    this.errors.push('插件主实例未找到');
                }
            } catch (error) {
                this.errors.push('插件加载检查失败: ' + error.message);
            }
        }
        
        // 检查全局对象访问
        async checkGlobalAccess() {
            console.log('🌐 检查全局对象访问...');
            
            try {
                if (typeof getSillyTavernGlobals === 'function') {
                    const globals = getSillyTavernGlobals();
                    
                    const expectedGlobals = [
                        'eventSource', 'event_types', 'chat', 'characters', 
                        'this_chid', 'extension_settings', 'saveSettingsDebounced',
                        'getRequestHeaders', 'getContext'
                    ];
                    
                    let accessibleCount = 0;
                    expectedGlobals.forEach(key => {
                        if (globals[key] !== undefined) {
                            accessibleCount++;
                        }
                    });
                    
                    if (accessibleCount >= expectedGlobals.length * 0.8) {
                        this.results.globalAccess = true;
                        console.log(`✅ 全局对象访问正常 (${accessibleCount}/${expectedGlobals.length})`);
                    } else {
                        this.errors.push(`全局对象访问不完整 (${accessibleCount}/${expectedGlobals.length})`);
                    }
                } else {
                    this.errors.push('getSillyTavernGlobals 函数未定义');
                }
            } catch (error) {
                this.errors.push('全局对象访问检查失败: ' + error.message);
            }
        }
        
        // 检查控件库
        async checkControlLibrary() {
            console.log('🎛️ 检查控件库...');
            
            try {
                if (typeof ExtendedControlLibrary === 'function') {
                    const library = new ExtendedControlLibrary();
                    const controls = library.getAllControls();
                    
                    const categories = ['text', 'value', 'composite'];
                    let categoryCount = 0;
                    let totalControls = 0;
                    
                    categories.forEach(category => {
                        if (controls[category] && Object.keys(controls[category]).length > 0) {
                            categoryCount++;
                            totalControls += Object.keys(controls[category]).length;
                        }
                    });
                    
                    if (categoryCount >= 2 && totalControls >= 10) {
                        this.results.controlLibrary = true;
                        console.log(`✅ 控件库正常 (${categoryCount}个类别，${totalControls}个控件)`);
                    } else {
                        this.errors.push(`控件库不完整 (${categoryCount}个类别，${totalControls}个控件)`);
                    }
                } else {
                    this.errors.push('ExtendedControlLibrary 类未定义');
                }
            } catch (error) {
                this.errors.push('控件库检查失败: ' + error.message);
            }
        }
        
        // 检查AI解析器
        async checkAIParser() {
            console.log('🤖 检查AI解析器...');
            
            try {
                if (typeof AIResponseParser === 'function') {
                    const parser = new AIResponseParser();
                    
                    // 测试解析功能
                    const testCases = [
                        '<!--STQSB:+strength:5,-health:10-->',
                        '你变强了！+strength:3',
                        '受到伤害，生命值减少。-health:15'
                    ];
                    
                    let successCount = 0;
                    testCases.forEach(test => {
                        try {
                            const commands = parser.parseResponse(test);
                            if (commands && commands.length > 0) {
                                successCount++;
                            }
                        } catch (e) {
                            console.warn('解析测试失败:', test, e.message);
                        }
                    });
                    
                    if (successCount >= 1) {
                        this.results.aiParser = true;
                        console.log(`✅ AI解析器正常 (${successCount}/${testCases.length}个测试通过)`);
                    } else {
                        this.errors.push('AI解析器无法正常解析指令');
                    }
                } else {
                    this.errors.push('AIResponseParser 类未定义');
                }
            } catch (error) {
                this.errors.push('AI解析器检查失败: ' + error.message);
            }
        }
        
        // 检查渲染引擎
        async checkRenderEngine() {
            console.log('🎨 检查渲染引擎...');
            
            try {
                if (typeof DynamicRenderEngine === 'function') {
                    const engine = new DynamicRenderEngine();
                    
                    // 检查关键方法
                    const requiredMethods = [
                        'init', 'updateState', 'processAICommands', 
                        'exportState', 'importState'
                    ];
                    
                    let methodCount = 0;
                    requiredMethods.forEach(method => {
                        if (typeof engine[method] === 'function') {
                            methodCount++;
                        }
                    });
                    
                    if (methodCount >= requiredMethods.length) {
                        this.results.renderEngine = true;
                        console.log(`✅ 渲染引擎正常 (${methodCount}/${requiredMethods.length}个方法)`);
                    } else {
                        this.errors.push(`渲染引擎方法不完整 (${methodCount}/${requiredMethods.length})`);
                    }
                } else {
                    this.errors.push('DynamicRenderEngine 类未定义');
                }
            } catch (error) {
                this.errors.push('渲染引擎检查失败: ' + error.message);
            }
        }
        
        // 检查世界书集成
        async checkWorldInfo() {
            console.log('📚 检查世界书集成...');
            
            try {
                if (typeof WorldInfoIntegrator === 'function') {
                    const integrator = new WorldInfoIntegrator();
                    
                    // 检查关键方法
                    const requiredMethods = [
                        'generatePrompt', 'createWorldInfoEntry', 
                        'insertWorldInfoEntry', 'getAvailableTemplates'
                    ];
                    
                    let methodCount = 0;
                    requiredMethods.forEach(method => {
                        if (typeof integrator[method] === 'function') {
                            methodCount++;
                        }
                    });
                    
                    if (methodCount >= requiredMethods.length) {
                        this.results.worldInfo = true;
                        console.log(`✅ 世界书集成正常 (${methodCount}/${requiredMethods.length}个方法)`);
                    } else {
                        this.errors.push(`世界书集成方法不完整 (${methodCount}/${requiredMethods.length})`);
                    }
                } else {
                    this.errors.push('WorldInfoIntegrator 类未定义');
                }
            } catch (error) {
                this.errors.push('世界书集成检查失败: ' + error.message);
            }
        }
        
        // 检查设计器模态框
        async checkDesignerModal() {
            console.log('🎨 检查设计器模态框...');
            
            try {
                if (typeof DesignerModal === 'function') {
                    // 创建临时实例进行检查
                    const mockPlugin = { extendedControls: null, worldInfoIntegrator: null };
                    const modal = new DesignerModal(mockPlugin);
                    
                    // 检查关键方法
                    const requiredMethods = [
                        'show', 'hide', 'createModal', 'generateTemplate'
                    ];
                    
                    let methodCount = 0;
                    requiredMethods.forEach(method => {
                        if (typeof modal[method] === 'function') {
                            methodCount++;
                        }
                    });
                    
                    if (methodCount >= requiredMethods.length) {
                        this.results.designerModal = true;
                        console.log(`✅ 设计器模态框正常 (${methodCount}/${requiredMethods.length}个方法)`);
                    } else {
                        this.errors.push(`设计器模态框方法不完整 (${methodCount}/${requiredMethods.length})`);
                    }
                } else {
                    this.errors.push('DesignerModal 类未定义');
                }
            } catch (error) {
                this.errors.push('设计器模态框检查失败: ' + error.message);
            }
        }
        
        // 检查状态显示
        async checkStatusDisplay() {
            console.log('📊 检查状态显示...');
            
            try {
                if (typeof RealTimeStatusDisplay === 'function') {
                    const display = new RealTimeStatusDisplay();
                    
                    // 检查关键方法
                    const requiredMethods = [
                        'createStatusDisplay', 'processAICommands', 
                        'exportState', 'importState', 'isActive'
                    ];
                    
                    let methodCount = 0;
                    requiredMethods.forEach(method => {
                        if (typeof display[method] === 'function') {
                            methodCount++;
                        }
                    });
                    
                    if (methodCount >= requiredMethods.length) {
                        this.results.statusDisplay = true;
                        console.log(`✅ 状态显示正常 (${methodCount}/${requiredMethods.length}个方法)`);
                    } else {
                        this.errors.push(`状态显示方法不完整 (${methodCount}/${requiredMethods.length})`);
                    }
                } else {
                    this.errors.push('RealTimeStatusDisplay 类未定义');
                }
            } catch (error) {
                this.errors.push('状态显示检查失败: ' + error.message);
            }
        }
        
        // 生成报告
        generateReport() {
            console.log('\n📋 ======= STQuickStatusBar 插件状态报告 =======');
            
            const components = [
                { name: '插件加载', key: 'pluginLoad' },
                { name: '全局对象访问', key: 'globalAccess' },
                { name: '控件库', key: 'controlLibrary' },
                { name: 'AI解析器', key: 'aiParser' },
                { name: '渲染引擎', key: 'renderEngine' },
                { name: '世界书集成', key: 'worldInfo' },
                { name: '设计器模态框', key: 'designerModal' },
                { name: '状态显示', key: 'statusDisplay' }
            ];
            
            let passCount = 0;
            components.forEach(comp => {
                const status = this.results[comp.key] ? '✅ 正常' : '❌ 异常';
                console.log(`${comp.name}: ${status}`);
                if (this.results[comp.key]) passCount++;
            });
            
            console.log(`\n📊 总体状态: ${passCount}/${components.length} 组件正常`);
            
            if (this.errors.length > 0) {
                console.log('\n❌ 错误列表:');
                this.errors.forEach((error, index) => {
                    console.log(`${index + 1}. ${error}`);
                });
            }
            
            const overallStatus = passCount >= components.length * 0.8 ? '✅ 良好' : '⚠️ 需要修复';
            console.log(`\n🎯 插件整体状态: ${overallStatus}`);
            
            if (overallStatus === '✅ 良好') {
                console.log('🎉 恭喜！STQuickStatusBar 插件可以正常使用！');
            } else {
                console.log('🔧 请根据错误列表修复问题后重新测试。');
            }
            
            console.log('================================================\n');
        }
    }
    
    // 暴露检查工具到全局
    window.STQuickStatusBarChecker = STQuickStatusBarChecker;
    
    // 提供快速检查方法
    window.checkSTQuickStatusBar = function() {
        const checker = new STQuickStatusBarChecker();
        checker.runFullCheck();
    };
    
    console.log('🔧 STQuickStatusBar 状态检查工具已加载');
    console.log('💡 使用 checkSTQuickStatusBar() 开始检查');
    
})();
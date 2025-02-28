// ==UserScript==
// @name         Fandom批量删除与保护工具
// @author       PandaFiredoge
// @version      2.3
// @description  一个用于Fandom站点的批量删除页面并可选保护的工具，支持正则匹配页面标题和删除用户创建的页面，可自定义处理速率，支持封禁用户
// @match        *://*.fandom.com/*/wiki/Special:*
// @grant        none
// @license      GPL-3.0-or-later
// ==/UserScript==

(function() {
    'use strict';

    // 确保mw API可用
    if (typeof mw === 'undefined' || typeof mw.Api === 'undefined') {
        console.error('MediaWiki API不可用，工具无法加载');
        return;
    }

    // 只在特殊页面运行
    if (!mw.config.get('wgCanonicalSpecialPageName')) return;

    // 确保用户有管理员权限
    if (!mw.config.get('wgUserGroups') || !mw.config.get('wgUserGroups').includes('sysop')) {
        console.log('用户没有管理员权限，批量删除工具不会加载');
        return;
    }

    // 创建工具界面
    function createInterface() {
        const container = document.createElement('div');
        container.id = 'bulk-delete-tool';
        container.style.cssText = 'padding: 15px; margin: 15px 0; border: 1px solid #ccc; border-radius: 4px; background-color: #f9f9f9;';

        container.innerHTML = `
            <h2 style="margin-top: 0;">批量删除与保护页面工具</h2>
            <p>输入要删除的页面标题（每行一个）：</p>
            <textarea id="pages-to-delete" style="width: 100%; height: 150px; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border: 1px solid #ddd;"></textarea>

            <div style="margin-top: 15px;">
                <label for="delete-reason">删除原因：</label>
                <input type="text" id="delete-reason" value="批量清理" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;">
            </div>

            <div style="margin-top: 15px; display: flex; align-items: center;">
                <label for="processing-rate" style="margin-right: 10px;">处理速率：</label>
                <input type="number" id="processing-rate" min="0.2" max="10" step="0.1" value="1" style="width: 70px; padding: 8px; border: 1px solid #ddd;">
                <span style="margin-left: 5px;">秒/页面</span>
                <div style="margin-left: 15px; color: #666; font-size: 0.9em;">
                    （推荐：0.5-2秒，过快可能导致API限制）
                </div>
            </div>

            <div style="margin-top: 15px;">
                <label>
                    <input type="checkbox" id="protect-after-delete" style="margin-right: 5px;">
                    删除后保护页面
                </label>
            </div>

            <div id="protection-options" style="margin-top: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; display: none;">
                <div style="margin-bottom: 10px;">
                    <label for="protection-level">保护级别：</label>
                    <select id="protection-level" style="padding: 5px;">
                        <option value="sysop">仅管理员</option>
                        <option value="autoconfirmed">仅自动确认用户</option>
                    </select>
                </div>
                <div>
                    <label for="protection-reason">保护原因：</label>
                    <input type="text" id="protection-reason" value="防止重建" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;">
                </div>
                <div style="margin-top: 10px;">
                    <label for="protection-expiry">保护期限：</label>
                    <select id="protection-expiry" style="padding: 5px;">
                        <option value="1 week">1周</option>
                        <option value="1 month">1个月</option>
                        <option value="3 months">3个月</option>
                        <option value="6 months">6个月</option>
                        <option value="1 year">1年</option>
                        <option value="infinite" selected>永久</option>
                    </select>
                </div>
            </div>

            <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="load-category-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">加载分类页面</button>
                <button id="load-prefix-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">加载前缀页面</button>
                <button id="load-regex-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">正则匹配页面</button>
                <button id="load-user-pages-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">用户创建的页面</button>
                <button id="preview-button" style="padding: 8px 15px; background-color: #5bc0de; color: white; border: none; border-radius: 3px; cursor: pointer;">预览页面列表</button>
                <button id="delete-button" style="padding: 8px 15px; background-color: #d9534f; color: white; border: none; border-radius: 3px; cursor: pointer;">开始删除</button>
            </div>

            <div id="modal-container" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);">
                <div id="modal-content" style="background-color: white; margin: 10% auto; padding: 20px; border-radius: 5px; width: 70%; max-width: 800px; max-height: 80vh; overflow-y: auto;">
                    <span id="modal-close" style="float: right; cursor: pointer; font-size: 20px;">&times;</span>
                    <div id="modal-body"></div>
                </div>
            </div>

            <div id="deletion-status" style="margin-top: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; display: none;">
                <div id="progress-container">
                    <div id="progress-bar" style="width: 100%; height: 20px; background-color: #f5f5f5; border-radius: 4px; margin: 10px 0;">
                        <div id="progress" style="width: 0%; height: 100%; background-color: #5cb85c; border-radius: 4px;"></div>
                    </div>
                    <div id="progress-text">准备中...</div>
                </div>
                <div id="deletion-results" style="margin-top: 15px; max-height: 300px; overflow-y: auto;"></div>
            </div>

            <div id="tool-message" style="margin-top: 15px; padding: 10px; border-radius: 4px; display: none;"></div>
        `;

        // 将工具添加到页面
        const mainContent = document.querySelector('#WikiaMainContent, .WikiaMainContent, #mw-content-text, .mw-body-content');
        if (mainContent) {
            mainContent.prepend(container);
        } else {
            document.body.prepend(container);
        }

        // 添加事件监听器
        document.getElementById('preview-button').addEventListener('click', previewPages);
        document.getElementById('delete-button').addEventListener('click', startDeletion);
        document.getElementById('load-category-button').addEventListener('click', showCategoryModal);
        document.getElementById('load-prefix-button').addEventListener('click', showPrefixModal);
        document.getElementById('load-regex-button').addEventListener('click', showRegexModal);
        document.getElementById('load-user-pages-button').addEventListener('click', showUserPagesModal); 
        document.getElementById('modal-close').addEventListener('click', closeModal);

        // 添加保护选项切换功能
        document.getElementById('protect-after-delete').addEventListener('change', function() {
            document.getElementById('protection-options').style.display = this.checked ? 'block' : 'none';
        });

        // 添加处理速率验证
        const rateInput = document.getElementById('processing-rate');
        rateInput.addEventListener('change', function() {
            const value = parseFloat(this.value);
            if (isNaN(value) || value < 0.2) {
                this.value = 0.2;
                showMessage('处理速率不能低于0.2秒/页面', 'error');
            } else if (value > 10) {
                this.value = 10;
                showMessage('处理速率不能高于10秒/页面', 'error');
            }
        });

        // 添加CSS样式
        addStyles();
    }

    // 添加CSS样式
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .collapsible-section {
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-bottom: 15px;
            }
            
            .collapsible-header {
                padding: 10px;
                background-color: #f5f5f5;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: bold;
            }
            
            .collapsible-header:hover {
                background-color: #e9e9e9;
            }
            
            .collapsible-content {
                padding: 10px;
                border-top: 1px solid #ddd;
                max-height: 300px;
                overflow-y: auto;
            }
            
            .collapsed .collapsible-content {
                display: none;
            }
            
            .page-list-container {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #ddd;
                padding: 10px;
                margin: 10px 0;
            }
            
            .action-buttons {
                position: sticky;
                bottom: 0;
                background-color: white;
                padding: 10px 0;
                border-top: 1px solid #ddd;
                margin-top: 10px;
            }
            
            #modal-content {
                display: flex;
                flex-direction: column;
            }
            
            #modal-body {
                overflow-y: auto;
            }
            
            /* 新增样式 */
            .rate-control {
                display: flex;
                align-items: center;
                margin-top: 15px;
            }
            
            .rate-slider {
                flex: 1;
                margin: 0 10px;
            }
            
            .rate-value {
                width: 60px;
                text-align: center;
            }
            
            /* 封禁选项样式 */
            .ban-options {
                margin-top: 15px;
                padding: 10px;
                background-color: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 4px;
            }
            
            .ban-options.disabled {
                opacity: 0.5;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 显示消息
    function showMessage(message, type) {
        const messageElement = document.getElementById('tool-message');
        messageElement.textContent = message;
        messageElement.style.display = 'block';

        if (type === 'error') {
            messageElement.style.backgroundColor = '#f2dede';
            messageElement.style.borderColor = '#ebccd1';
            messageElement.style.color = '#a94442';
        } else if (type === 'success') {
            messageElement.style.backgroundColor = '#dff0d8';
            messageElement.style.borderColor = '#d6e9c6';
            messageElement.style.color = '#3c763d';
        } else {
            messageElement.style.backgroundColor = '#d9edf7';
            messageElement.style.borderColor = '#bce8f1';
            messageElement.style.color = '#31708f';
        }

        // 5秒后自动隐藏
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }

    // 显示模态框
    function showModal(title, content) {
        document.getElementById('modal-container').style.display = 'block';
        document.getElementById('modal-body').innerHTML = `
            <h3>${title}</h3>
            ${content}
        `;

        // 修复：立即添加折叠区域的事件监听器
        addCollapsibleSectionsEventListeners();
    }

    // 关闭模态框
    function closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    }

    // 添加折叠区域的事件监听器 - 新函数
    function addCollapsibleSectionsEventListeners() {
        document.querySelectorAll('.collapsible-header').forEach(header => {
            // 移除现有事件监听器防止重复
            header.removeEventListener('click', toggleCollapsibleSection);
            // 添加新的事件监听器
            header.addEventListener('click', toggleCollapsibleSection);
        });
    }

    // 切换折叠区域 - 新函数
    function toggleCollapsibleSection() {
        const section = this.parentElement;
        section.classList.toggle('collapsed');
        const chevron = this.querySelector('.chevron');
        if (chevron) {
            chevron.textContent = section.classList.contains('collapsed') ? '▼' : '▲';
        }
    }

    // 创建可折叠区域
    function createCollapsibleSection(title, contentHtml, initiallyCollapsed = false) {
        return `
            <div class="collapsible-section ${initiallyCollapsed ? 'collapsed' : ''}">
                <div class="collapsible-header">
                    <span>${title}</span>
                    <span class="chevron">${initiallyCollapsed ? '▼' : '▲'}</span>
                </div>
                <div class="collapsible-content">
                    ${contentHtml}
                </div>
            </div>
        `;
    }

    // 显示用户页面模态框
    function showUserPagesModal() {
        const content = `
            <div style="margin-bottom: 15px;">
                <label for="username">用户名：</label>
                <input type="text" id="username" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;" placeholder="输入用户名（不含User:前缀）">
            </div>

            <div style="margin-bottom: 15px;">
                <label for="date-limit">时间限制（可选）：</label>
                <input type="date" id="date-limit" style="padding: 8px; margin-top: 5px; border: 1px solid #ddd;">
                <small style="display: block; margin-top: 5px; color: #666;">只加载此日期之后创建的页面。留空表示加载所有页面。</small>
            </div>

            <!-- 修改：封禁用户选项 - 删除阻止用户发送邮件选项 -->
            <div style="margin-top: 15px; margin-bottom: 15px;">
                <div>
                    <input type="checkbox" id="ban-user-checkbox" style="margin-right: 5px;">
                    <label for="ban-user-checkbox" style="font-weight: bold; color: #d9534f;">在获取页面前封禁该用户</label>
                </div>
                
                <div id="ban-options" class="ban-options disabled" style="margin-top: 10px;">
                    <div style="margin-bottom: 10px;">
                        <label for="ban-reason">封禁原因：</label>
                        <input type="text" id="ban-reason" value="破坏行为" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label for="ban-duration">封禁期限：</label>
                        <select id="ban-duration" style="padding: 5px;">
                            <option value="1 day">1天</option>
                            <option value="3 days">3天</option>
                            <option value="1 week">1周</option>
                            <option value="2 weeks">2周</option>
                            <option value="1 month">1个月</option>
                            <option value="3 months">3个月</option>
                            <option value="6 months">6个月</option>
                            <option value="1 year">1年</option>
                            <option value="infinite">永久</option>
                        </select>
                    </div>
                    
                    <div>
                        <input type="checkbox" id="ban-autoblock" checked style="margin-right: 5px;">
                        <label for="ban-autoblock">自动封禁最后使用的IP地址</label>
                    </div>
                    
                    <div>
                        <input type="checkbox" id="ban-talk-page" style="margin-right: 5px;">
                        <label for="ban-talk-page">阻止用户编辑自己的讨论页</label>
                    </div>
                </div>
            </div>

            ${createCollapsibleSection('命名空间选项', `
                <div style="margin-top: 5px;">
                    <input type="checkbox" id="namespace-main" checked>
                    <label for="namespace-main">主命名空间</label>
                </div>
                <div>
                    <input type="checkbox" id="namespace-user">
                    <label for="namespace-user">用户命名空间</label>
                </div>
                <div>
                    <input type="checkbox" id="namespace-template">
                    <label for="namespace-template">模板命名空间</label>
                </div>
                <div>
                    <input type="checkbox" id="namespace-category">
                    <label for="namespace-category">分类命名空间</label>
                </div>
                <div>
                    <input type="checkbox" id="namespace-file">
                    <label for="namespace-file">文件命名空间</label>
                </div>
                <div>
                    <input type="checkbox" id="namespace-other">
                    <label for="namespace-other">其他命名空间</label>
                </div>
            `, true)}

            <button id="load-user-pages-button-modal" style="padding: 8px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer; margin-top: 15px;">加载用户创建的页面</button>

            <div id="user-pages-results" style="margin-top: 15px;"></div>
        `;

        showModal('加载用户创建的页面', content);

        // 监听封禁选项复选框
        document.getElementById('ban-user-checkbox').addEventListener('change', function() {
            const banOptions = document.getElementById('ban-options');
            if (this.checked) {
                banOptions.classList.remove('disabled');
            } else {
                banOptions.classList.add('disabled');
            }
        });

        document.getElementById('load-user-pages-button-modal').addEventListener('click', function() {
            const username = document.getElementById('username').value.trim();
            if (!username) {
                showMessage('请输入有效的用户名', 'error');
                return;
            }

            const dateLimit = document.getElementById('date-limit').value;
            
            // 获取选中的命名空间
            const namespaces = [];
            if (document.getElementById('namespace-main').checked) namespaces.push(0);
            if (document.getElementById('namespace-user').checked) namespaces.push(2, 3);
            if (document.getElementById('namespace-template').checked) namespaces.push(10, 11);
            if (document.getElementById('namespace-category').checked) namespaces.push(14, 15);
            if (document.getElementById('namespace-file').checked) namespaces.push(6, 7);
            if (document.getElementById('namespace-other').checked) namespaces.push(4, 5, 8, 9, 12, 13);

            // 检查是否需要封禁用户
            const shouldBanUser = document.getElementById('ban-user-checkbox').checked;
            
            if (shouldBanUser) {
                // 获取封禁参数
                const banReason = document.getElementById('ban-reason').value;
                const banDuration = document.getElementById('ban-duration').value;
                const autoBlock = document.getElementById('ban-autoblock').checked;
                const disallowTalkPage = document.getElementById('ban-talk-page').checked;
                
                // 显示封禁状态
                document.getElementById('user-pages-results').innerHTML = '<p>正在封禁用户 ' + username + '，请稍候...</p>';
                
                // 执行封禁
                banUser(username, banReason, banDuration, autoBlock, disallowTalkPage, function(success, message) {
                    if (success) {
                        document.getElementById('user-pages-results').innerHTML = '<div style="color: #3c763d; margin-bottom: 15px;"><strong>✓ 用户 ' + username + ' 已成功封禁</strong></div>';
                        // 封禁成功后加载页面
                        loadUserCreatedPages(username, dateLimit, namespaces);
                    } else {
                        document.getElementById('user-pages-results').innerHTML = '<div style="color: #a94442; margin-bottom: 15px;"><strong>✗ 封禁用户 ' + username + ' 失败: ' + message + '</strong></div>';
                    }
                });
            } else {
                // 直接加载页面
                document.getElementById('user-pages-results').innerHTML = '<p>正在加载用户创建的页面，请稍候...</p>';
                loadUserCreatedPages(username, dateLimit, namespaces);
            }
        });
    }

// 修改：封禁用户功能 - 修复参数传递问题
function banUser(username, reason, duration, autoBlock, disallowTalkPage, callback) {
    const api = new mw.Api();
    
    // 转换封禁期限为MediaWiki API接受的格式
    const expiry = convertBanDurationToTimestamp(duration);
    
    // 执行封禁API调用 - 修复：将选项作为参数传递
    api.postWithToken('csrf', {
        action: 'block',
        user: username,
        reason: reason,
        expiry: expiry,
        format: 'json',
        allowusertalk: disallowTalkPage ? undefined : true, // 阻止用户编辑自己的讨论页
        autoblock: autoBlock ? true : undefined // 自动封禁最后使用的IP地址
    })
    .done(function(data) {
        if (data.block) {
            callback(true, '封禁成功');
        } else {
            callback(false, '封禁操作没有返回预期结果');
        }
    }).fail(function(code, result) {
        callback(false, result.error ? result.error.info : code);
    });
}

    // 新增：转换封禁期限为时间戳格式
    function convertBanDurationToTimestamp(duration) {
        // 如果是永久封禁，直接返回
        if (duration === 'infinite') {
            return 'infinite';
        }

        // 获取当前日期
        const now = new Date();
        
        // 根据选择的选项计算到期日期
        switch (duration) {
            case '1 day':
                now.setDate(now.getDate() + 1);
                break;
            case '3 days':
                now.setDate(now.getDate() + 3);
                break;
            case '1 week':
                now.setDate(now.getDate() + 7);
                break;
            case '2 weeks':
                now.setDate(now.getDate() + 14);
                break;
            case '1 month':
                now.setMonth(now.getMonth() + 1);
                break;
            case '3 months':
                now.setMonth(now.getMonth() + 3);
                break;
            case '6 months':
                now.setMonth(now.getMonth() + 6);
                break;
            case '1 year':
                now.setFullYear(now.getFullYear() + 1);
                break;
            default:
                // 如果无法识别选项，默认为一天
                now.setDate(now.getDate() + 1);
        }
        
        // 将日期格式化为MediaWiki API接受的格式：YYYY-MM-DDThh:mm:ssZ
        return now.toISOString().replace(/\.\d+Z$/, 'Z');
    }

    // 加载用户创建的页面
    function loadUserCreatedPages(username, dateLimit, namespaces) {
        const api = new mw.Api();
        const resultContainer = document.getElementById('user-pages-results');
        
        // 构建参数
        let params = {
            action: 'query',
            list: 'usercontribs',
            ucuser: username,
            uclimit: 500,
            ucprop: 'title|timestamp',
            ucshow: 'new', // 只显示创建新页面的贡献
            format: 'json'
        };

        // 添加日期限制
        if (dateLimit) {
            params.ucend = dateLimit + 'T00:00:00Z'; // 转换为ISO格式
        }
        
        // 添加命名空间限制
        if (namespaces && namespaces.length > 0) {
            params.ucnamespace = namespaces.join('|');
        }

        // 显示加载状态
        resultContainer.innerHTML = '<p>正在查询用户创建的页面，这可能需要一些时间...</p>';

        // 保存找到的页面
        const userPages = [];

        // 递归函数获取所有页面
        function getUserContributions(continueParam) {
            if (continueParam) {
                // 添加continue参数
                for (let prop in continueParam) {
                    params[prop] = continueParam[prop];
                }
            }

            api.get(params).done(function(data) {
                if (data.query && data.query.usercontribs) {
                    data.query.usercontribs.forEach(function(contrib) {
                        userPages.push({
                            title: contrib.title,
                            timestamp: contrib.timestamp
                        });
                    });
                    
                    // 更新状态信息
                    resultContainer.innerHTML = `<p>已找到 ${userPages.length} 个由 ${username} 创建的页面，正在继续搜索...</p>`;

                    // 如果有更多结果，继续查询
                    if (data.continue) {
                        getUserContributions(data.continue);
                    } else {
                        // 完成所有查询
                        displayUserPagesResults(username, userPages);
                    }
                } else {
                    // 没有找到贡献或出现错误
                    if (userPages.length === 0) {
                        resultContainer.innerHTML = `<p>未找到用户 "${username}" 创建的页面。</p>`;
                    } else {
                        displayUserPagesResults(username, userPages);
                    }
                }
            }).fail(function(code, result) {
                resultContainer.innerHTML = `<p>查询用户贡献失败: ${result.error ? result.error.info : code}</p>`;
            });
        }

        // 开始查询
        getUserContributions();
    }

    // 显示用户创建的页面结果
    function displayUserPagesResults(username, pages) {
        const resultContainer = document.getElementById('user-pages-results');

        if (pages.length === 0) {
            resultContainer.innerHTML = `<p>未找到用户 "${username}" 创建的页面。</p>`;
            return;
        }

        // 按时间倒序排序（最新的在前）
        pages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 创建折叠区域的内容
        let pagesContent = `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-user-pages" checked>
                <label for="select-all-user-pages">全选/取消全选</label>
            </div>
            
            <div class="page-list-container">
        `;

        pages.forEach((page, index) => {
            // 格式化时间戳为可读格式
            const date = new Date(page.timestamp);
            const formattedDate = date.toLocaleString();

            pagesContent += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="user-page-${index}" class="page-checkbox" value="${page.title}" checked>
                    <label for="user-page-${index}">${page.title}</label>
                    <small style="margin-left: 5px; color: #666;">(创建于 ${formattedDate})</small>
                </div>
            `;
        });

        pagesContent += `</div>`;

        // 创建固定底部的操作按钮
        const actionButtons = `
            <div class="action-buttons">
                <button id="add-user-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
            </div>
        `;

        // 组合内容
        const html = `
            <h4>找到 ${pages.length} 个由 "${username}" 创建的页面：</h4>
            ${createCollapsibleSection('页面列表', pagesContent)}
            ${actionButtons}
        `;

        resultContainer.innerHTML = html;
        
        // 修复：添加折叠区域的事件监听器
        addCollapsibleSectionsEventListeners();

        // 添加全选/取消全选功能
        document.getElementById('select-all-user-pages').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#user-pages-results .page-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });

        // 添加添加到列表功能
        document.getElementById('add-user-pages-button').addEventListener('click', function() {
            const selectedPages = [];
            document.querySelectorAll('#user-pages-results .page-checkbox:checked').forEach(cb => {
                selectedPages.push(cb.value);
            });

            if (selectedPages.length === 0) {
                showMessage('请至少选择一个页面', 'error');
                return;
            }

            const textarea = document.getElementById('pages-to-delete');
            const existingText = textarea.value.trim();
            const newText = selectedPages.join('\n');
            textarea.value = existingText ? existingText + '\n' + newText : newText;

            // 更新删除原因以包含用户名
            const reasonInput = document.getElementById('delete-reason');
            if (reasonInput.value === '批量清理') {
                reasonInput.value = `清理用户 ${username} 创建的页面`;
            }

            closeModal();
            showMessage(`已添加 ${selectedPages.length} 个页面到删除列表`, 'success');
        });
    }

    // 显示正则匹配模态框
    function showRegexModal() {
        // 获取命名空间列表
        const namespaces = [
            {id: '0', name: '(主命名空间)'},
            {id: '1', name: 'Talk'},
            {id: '2', name: 'User'},
            {id: '3', name: 'User talk'},
            {id: '4', name: 'Project'},
            {id: '6', name: 'File'},
            {id: '10', name: 'Template'},
            {id: '14', name: 'Category'},
            {id: '110', name: 'Forum'},
            {id: '828', name: 'Module'}
        ];

        let namespaceOptions = '';
        namespaces.forEach(ns => {
            namespaceOptions += `<option value="${ns.id}">${ns.name}</option>`;
        });

        const content = `
            <div style="margin-bottom: 15px;">
                <label for="regex-pattern">正则表达式模式：</label>
                <input type="text" id="regex-pattern" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;" placeholder="例如: ^User:.+/沙盒$">
                <small style="display: block; margin-top: 5px; color: #666;">提示：使用JavaScript正则表达式语法，例如 ^Template:Test.* 将匹配所有以"Template:Test"开头的页面。</small>
            </div>

            ${createCollapsibleSection('高级选项', `
                <div style="margin-bottom: 15px;">
                    <label for="regex-namespace">在此命名空间中搜索：</label>
                    <select id="regex-namespace" style="padding: 8px; margin-left: 5px;">
                        <option value="all">所有命名空间</option>
                        ${namespaceOptions}
                    </select>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label for="regex-flags">正则表达式标志：</label>
                    <input type="text" id="regex-flags" style="width: 100px; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;" value="i" placeholder="例如: i">
                    <small style="display: block; margin-top: 5px; color: #666;">i = 忽略大小写, g = 全局匹配, m = 多行匹配</small>
                </div>

                <div style="margin-bottom: 15px;">
                    <input type="checkbox" id="regex-case-sensitive" style="margin-right: 5px;">
                    <label for="regex-case-sensitive">区分大小写</label>
                </div>
            `, true)}

            <button id="load-regex-pages-button" style="padding: 8px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer; margin-top: 15px;">搜索匹配页面</button>

            <div id="regex-results" style="margin-top: 15px;"></div>
        `;

        showModal('使用正则表达式匹配页面', content);

        // 更新flags值的处理
        document.getElementById('regex-case-sensitive').addEventListener('change', function() {
            const flagsInput = document.getElementById('regex-flags');
            if (this.checked) {
                // 移除i标志
                flagsInput.value = flagsInput.value.replace(/i/g, '');
            } else if (!flagsInput.value.includes('i')) {
                // 添加i标志
                flagsInput.value += 'i';
            }
        });

        document.getElementById('load-regex-pages-button').addEventListener('click', function() {
            const pattern = document.getElementById('regex-pattern').value.trim();
            const namespace = document.getElementById('regex-namespace').value;
            const flags = document.getElementById('regex-flags').value.trim();

            if (!pattern) {
                showMessage('请输入有效的正则表达式', 'error');
                return;
            }

            document.getElementById('regex-results').innerHTML = '<p>正在搜索匹配页面，请稍候...</p>';
            searchPagesByRegex(pattern, namespace, flags);
        });
    }

    // 使用正则表达式搜索页面
    function searchPagesByRegex(pattern, namespace, flags) {
        const api = new mw.Api();
        const resultContainer = document.getElementById('regex-results');
        
        try {
            // 测试正则表达式是否有效
            new RegExp(pattern, flags);
        } catch (e) {
            resultContainer.innerHTML = `<p style="color: #a94442;">正则表达式无效: ${e.message}</p>`;
            return;
        }

        // 构建查询参数
        let params = {
            action: 'query',
            list: 'allpages',
            aplimit: 500,
            format: 'json'
        };

        // 只有在选择了特定命名空间时才添加命名空间参数
        if (namespace !== 'all') {
            params.apnamespace = namespace;
        }

        // 创建正则表达式对象
        const regex = new RegExp(pattern, flags);
        
        // 显示加载状态
        resultContainer.innerHTML = '<p>正在加载页面，这可能需要一些时间...</p>';

        // 保存匹配的页面
        let matchedPages = [];
        
        // 执行递归API调用来获取所有页面
        function getAllPages(continueParam) {
            if (continueParam) {
                // 添加continue参数
                for (let prop in continueParam) {
                    params[prop] = continueParam[prop];
                }
            }

            api.get(params).done(function(data) {
                if (data.query && data.query.allpages) {
                    // 过滤匹配正则表达式的页面
                    const pages = data.query.allpages;
                    pages.forEach(function(page) {
                        if (regex.test(page.title)) {
                            matchedPages.push(page.title);
                        }
                    });
                    
                    // 更新状态
                    resultContainer.innerHTML = `<p>已找到 ${matchedPages.length} 个匹配页面，正在继续搜索...</p>`;

                    // 如果有更多页面，继续获取
                    if (data.continue) {
                        getAllPages(data.continue);
                    } else {
                        // 最终完成
                        displayRegexResults(matchedPages, pattern, flags);
                    }
                } else {
                    displayRegexResults(matchedPages, pattern, flags);
                }
            }).fail(function() {
                resultContainer.innerHTML = '<p>获取页面列表失败，请重试。</p>';
            });
        }

        // 开始获取页面
        getAllPages();
    }

    // 显示正则匹配结果
    function displayRegexResults(pages, pattern, flags) {
        const resultContainer = document.getElementById('regex-results');

        if (pages.length === 0) {
            resultContainer.innerHTML = `<p>没有找到匹配正则表达式 "${pattern}" 的页面。</p>`;
            return;
        }

        // 创建折叠区域的内容
        let pagesContent = `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-regex" checked>
                <label for="select-all-regex">全选/取消全选</label>
            </div>
            
            <div class="page-list-container">
        `;

        pages.forEach((page, index) => {
            pagesContent += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="regex-page-${index}" class="page-checkbox" value="${page}" checked>
                    <label for="regex-page-${index}">${page}</label>
                </div>
            `;
        });

        pagesContent += `</div>`;

        // 创建固定底部的操作按钮
        const actionButtons = `
            <div class="action-buttons">
                <button id="add-regex-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
            </div>
        `;

        // 组合内容
        const html = `
            <h4>找到 ${pages.length} 个匹配正则表达式 /${pattern}/${flags} 的页面：</h4>
            ${createCollapsibleSection('页面列表', pagesContent)}
            ${actionButtons}
        `;

        resultContainer.innerHTML = html;
        
        // 修复：添加折叠区域的事件监听器
        addCollapsibleSectionsEventListeners();

        // 添加全选/取消全选功能
        document.getElementById('select-all-regex').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#regex-results .page-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });

        // 添加添加到列表功能
        document.getElementById('add-regex-pages-button').addEventListener('click', function() {
            const selectedPages = [];
            document.querySelectorAll('#regex-results .page-checkbox:checked').forEach(cb => {
                selectedPages.push(cb.value);
            });

            if (selectedPages.length === 0) {
                showMessage('请至少选择一个页面', 'error');
                return;
            }

            const textarea = document.getElementById('pages-to-delete');
            const existingText = textarea.value.trim();
            const newText = selectedPages.join('\n');
            textarea.value = existingText ? existingText + '\n' + newText : newText;

            closeModal();
            showMessage(`已添加 ${selectedPages.length} 个页面到删除列表`, 'success');
        });
    }

    // 显示分类模态框
    function showCategoryModal() {
        const content = `
            <div style="margin-bottom: 15px;">
                <label for="category-name">分类名称（不包含Category:前缀）：</label>
                <input type="text" id="category-name" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;">
            </div>

            <div style="margin-bottom: 15px;">
                <label for="category-depth">包含子分类：</label>
                <select id="category-depth" style="padding: 8px; margin-left: 5px;">
                    <option value="0">否</option>
                    <option value="1">是，深度 1</option>
                    <option value="2">是，深度 2</option>
                    <option value="3">是，深度 3</option>
                </select>
            </div>

            <button id="load-category-pages-button" style="padding: 8px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">加载分类页面</button>

            <div id="category-results" style="margin-top: 15px;"></div>
        `;

        showModal('从分类加载页面', content);

        document.getElementById('load-category-pages-button').addEventListener('click', function() {
            const categoryName = document.getElementById('category-name').value.trim();
            const depth = parseInt(document.getElementById('category-depth').value);

            if (!categoryName) {
                showMessage('请输入有效的分类名称', 'error');
                return;
            }

            document.getElementById('category-results').innerHTML = '<p>正在加载分类页面，请稍候...</p>';
            loadPagesFromCategory(categoryName, depth);
        });
    }

    // 显示前缀模态框
    function showPrefixModal() {
        // 获取命名空间列表
        const namespaces = [
            {id: '0', name: '(主命名空间)'},
            {id: '1', name: 'Talk'},
            {id: '2', name: 'User'},
            {id: '3', name: 'User talk'},
            {id: '4', name: 'Project'},
            {id: '6', name: 'File'},
            {id: '10', name: 'Template'},
            {id: '14', name: 'Category'},
            {id: '110', name: 'Forum'},
            {id: '828', name: 'Module'}
        ];

        let namespaceOptions = '';
        namespaces.forEach(ns => {
            namespaceOptions += `<option value="${ns.id}">${ns.name}</option>`;
        });

        const content = `
            <div style="margin-bottom: 15px;">
                <label for="prefix-name">页面标题前缀：</label>
                <input type="text" id="prefix-name" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ddd;">
            </div>

            <div style="margin-bottom: 15px;">
                <label for="namespace-select">命名空间：</label>
                <select id="namespace-select" style="padding: 8px; margin-left: 5px;">
                    ${namespaceOptions}
                </select>
            </div>

            <button id="load-prefix-pages-button" style="padding: 8px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">加载前缀页面</button>

            <div id="prefix-results" style="margin-top: 15px;"></div>
        `;

        showModal('从前缀加载页面', content);

        document.getElementById('load-prefix-pages-button').addEventListener('click', function() {
            const prefix = document.getElementById('prefix-name').value.trim();
            const namespace = document.getElementById('namespace-select').value;

            if (!prefix) {
                showMessage('请输入有效的页面前缀', 'error');
                return;
            }

            document.getElementById('prefix-results').innerHTML = '<p>正在加载前缀页面，请稍候...</p>';
            loadPagesFromPrefix(prefix, namespace);
        });
    }

    // 从分类加载页面
    function loadPagesFromCategory(categoryName, depth) {
        const api = new mw.Api();

        api.get({
            action: 'query',
            list: 'categorymembers',
            cmtitle: 'Category:' + categoryName,
            cmlimit: 500,
            cmnamespace: '*',
            cmtype: 'page|subcat',
            format: 'json'
        }).done(function(data) {
            const pages = [];
            const subcats = [];

            if (data.query && data.query.categorymembers) {
                data.query.categorymembers.forEach(function(member) {
                    if (member.ns === 14) {
                        // 这是子分类
                        subcats.push(member.title.replace('Category:', ''));
                    } else {
                        // 这是页面
                        pages.push(member.title);
                    }
                });

                // 显示结果
                displayCategoryResults(categoryName, pages);

                // 如果需要处理子分类并且深度大于0
                if (depth > 0 && subcats.length > 0) {
                    loadSubcategories(subcats, pages, depth - 1);
                }
            } else {
                document.getElementById('category-results').innerHTML = '<p>在分类 "' + categoryName + '" 中未找到页面。</p>';
            }
        }).fail(function() {
            document.getElementById('category-results').innerHTML = '<p>无法加载分类页面。请检查分类名称后重试。</p>';
        });
    }

    // 递归加载子分类
    function loadSubcategories(subcats, allPages, remainingDepth) {
        if (subcats.length === 0 || remainingDepth < 0) return;

        const currentCat = subcats.shift();
        const api = new mw.Api();

        api.get({
            action: 'query',
            list: 'categorymembers',
            cmtitle: 'Category:' + currentCat,
            cmlimit: 500,
            cmnamespace: '*',
            cmtype: 'page|subcat',
            format: 'json'
        }).done(function(data) {
            const newSubcats = [];

            if (data.query && data.query.categorymembers) {
                data.query.categorymembers.forEach(function(member) {
                    if (member.ns === 14) {
                        // 这是子分类
                        newSubcats.push(member.title.replace('Category:', ''));
                    } else {
                        // 这是页面
                        allPages.push(member.title);
                    }
                });

                // 更新显示
                displayCategoryResults('所有分类', allPages);

                // 处理任何新发现的子分类
                if (remainingDepth > 0) {
                    subcats.push(...newSubcats);
                }

                // 继续处理队列中的下一个子分类
                if (subcats.length > 0) {
                    loadSubcategories(subcats, allPages, remainingDepth);
                }
            }
        });
    }

    // 显示分类结果
    function displayCategoryResults(categoryName, pages) {
        const resultContainer = document.getElementById('category-results');

        if (pages.length === 0) {
            resultContainer.innerHTML = '<p>在分类 "' + categoryName + '" 中未找到页面。</p>';
            return;
        }

        // 创建折叠区域的内容
        let pagesContent = `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-category" checked>
                <label for="select-all-category">全选/取消全选</label>
            </div>
            
            <div class="page-list-container">
        `;

        pages.forEach((page, index) => {
            pagesContent += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="cat-page-${index}" class="page-checkbox" value="${page}" checked>
                    <label for="cat-page-${index}">${page}</label>
                </div>
            `;
        });

        pagesContent += `</div>`;

        // 创建固定底部的操作按钮
        const actionButtons = `
            <div class="action-buttons">
                <button id="add-category-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
            </div>
        `;

        // 组合内容
        const html = `
            <h4>在分类 "${categoryName}" 中找到 ${pages.length} 个页面：</h4>
            ${createCollapsibleSection('页面列表', pagesContent)}
            ${actionButtons}
        `;

        resultContainer.innerHTML = html;
        
        // 修复：添加折叠区域的事件监听器
        addCollapsibleSectionsEventListeners();

        // 添加全选/取消全选功能
        document.getElementById('select-all-category').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#category-results .page-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });

        // 添加添加到列表功能
        document.getElementById('add-category-pages-button').addEventListener('click', function() {
            const selectedPages = [];
            document.querySelectorAll('#category-results .page-checkbox:checked').forEach(cb => {
                selectedPages.push(cb.value);
            });

            if (selectedPages.length === 0) {
                showMessage('请至少选择一个页面', 'error');
                return;
            }

            const textarea = document.getElementById('pages-to-delete');
            const existingText = textarea.value.trim();
            const newText = selectedPages.join('\n');
            textarea.value = existingText ? existingText + '\n' + newText : newText;

            closeModal();
            showMessage(`已添加 ${selectedPages.length} 个页面到删除列表`, 'success');
        });
    }

    // 从前缀加载页面
    function loadPagesFromPrefix(prefix, namespace) {
        const api = new mw.Api();

        api.get({
            action: 'query',
            list: 'allpages',
            apprefix: prefix,
            apnamespace: namespace,
            aplimit: 500,
            format: 'json'
        }).done(function(data) {
            const pages = [];

            if (data.query && data.query.allpages) {
                data.query.allpages.forEach(function(page) {
                    pages.push(page.title);
                });

                // 显示结果
                displayPrefixResults(prefix, namespace, pages);
            } else {
                document.getElementById('prefix-results').innerHTML = '<p>使用前缀 "' + prefix + '" 未找到页面。</p>';
            }
        }).fail(function() {
            document.getElementById('prefix-results').innerHTML = '<p>无法加载前缀页面。请检查前缀后重试。</p>';
        });
    }

    // 显示前缀结果
    function displayPrefixResults(prefix, namespace, pages) {
        const resultContainer = document.getElementById('prefix-results');

        if (pages.length === 0) {
            resultContainer.innerHTML = '<p>使用前缀 "' + prefix + '" 未找到页面。</p>';
            return;
        }

        const namespaceText = document.querySelector('#namespace-select option[value="' + namespace + '"]')?.textContent || namespace;

        // 创建折叠区域的内容
        let pagesContent = `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-prefix" checked>
                <label for="select-all-prefix">全选/取消全选</label>
            </div>
            
            <div class="page-list-container">
        `;

        pages.forEach((page, index) => {
            pagesContent += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="prefix-page-${index}" class="page-checkbox" value="${page}" checked>
                    <label for="prefix-page-${index}">${page}</label>
                </div>
            `;
        });

        pagesContent += `</div>`;

        // 创建固定底部的操作按钮
        const actionButtons = `
            <div class="action-buttons">
                <button id="add-prefix-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
            </div>
        `;

        // 组合内容
        const html = `
            <h4>在命名空间 "${namespaceText}" 中找到 ${pages.length} 个以 "${prefix}" 开头的页面：</h4>
            ${createCollapsibleSection('页面列表', pagesContent)}
            ${actionButtons}
        `;

        resultContainer.innerHTML = html;
        
        // 修复：添加折叠区域的事件监听器
        addCollapsibleSectionsEventListeners();

        // 添加全选/取消全选功能
        document.getElementById('select-all-prefix').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#prefix-results .page-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
        });

        // 添加添加到列表功能
        document.getElementById('add-prefix-pages-button').addEventListener('click', function() {
            const selectedPages = [];
            document.querySelectorAll('#prefix-results .page-checkbox:checked').forEach(cb => {
                selectedPages.push(cb.value);
            });

            if (selectedPages.length === 0) {
                showMessage('请至少选择一个页面', 'error');
                return;
            }

            const textarea = document.getElementById('pages-to-delete');
            const existingText = textarea.value.trim();
            const newText = selectedPages.join('\n');
            textarea.value = existingText ? existingText + '\n' + newText : newText;

            closeModal();
            showMessage(`已添加 ${selectedPages.length} 个页面到删除列表`, 'success');
        });
    }

    // 预览页面
    function previewPages() {
        const pagesText = document.getElementById('pages-to-delete').value.trim();
        if (!pagesText) {
            showMessage('请先添加要删除的页面', 'error');
            return;
        }

        // 将文本分割成页面数组
        const pagesToDelete = pagesText.split('\n')
            .map(page => page.trim())
            .filter(page => page.length > 0);

        if (pagesToDelete.length === 0) {
            showMessage('没有找到有效的页面标题', 'error');
            return;
        }

        const protectEnabled = document.getElementById('protect-after-delete').checked;
        const processingRate = document.getElementById('processing-rate').value;
        let protectionInfo = '';

        if (protectEnabled) {
            const protectionLevel = document.getElementById('protection-level').value;
            const protectionExpiry = document.getElementById('protection-expiry').value;
            const protectionReason = document.getElementById('protection-reason').value;

            // 转换保护期限为人类可读形式
            let readableExpiry = protectionExpiry;
            if (protectionExpiry === 'infinite') {
                readableExpiry = '永久';
            }

            protectionInfo = `
                <div style="margin-top: 10px; padding: 8px; background-color: #d9edf7; border: 1px solid #bce8f1; border-radius: 4px;">
                    <strong>删除后将保护这些页面：</strong><br>
                    保护级别: ${protectionLevel === 'sysop' ? '仅管理员' : '仅自动确认用户'}<br>
                    保护期限: ${readableExpiry}<br>
                    保护原因: ${protectionReason}
                </div>
            `;
        }

        // 计算预计完成时间
        const totalSeconds = pagesToDelete.length * parseFloat(processingRate);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.round(totalSeconds % 60);
        const estimatedTime = minutes > 0 ? 
            `${minutes}分${seconds}秒` : 
            `${seconds}秒`;

        // 显示预览
        const content = `
            <div>
                <strong>总页面数:</strong> ${pagesToDelete.length}<br>
                <strong>删除原因:</strong> ${document.getElementById('delete-reason').value}<br>
                <strong>处理速率:</strong> ${processingRate} 秒/页面<br>
                <strong>预计完成时间:</strong> 约 ${estimatedTime}
            </div>

            ${protectionInfo}

            ${createCollapsibleSection('页面列表', `
                <div class="page-list-container">
                    <ol>
                        ${pagesToDelete.map(page => `<li>${page}</li>`).join('')}
                    </ol>
                </div>
            `)}

            <div style="margin-top: 15px; padding: 10px; background-color: #fcf8e3; border: 1px solid #faebcc; color: #8a6d3b; border-radius: 4px;">
                <strong>警告:</strong> 请确认以上列表。点击"开始删除"后，这些页面将被删除。
            </div>
        `;

        showModal('预览删除列表', content);
    }

    // 开始删除
    function startDeletion() {
        const pagesText = document.getElementById('pages-to-delete').value.trim();
        if (!pagesText) {
            showMessage('请先添加要删除的页面', 'error');
            return;
        }

        // 将文本分割成页面数组
        const pagesToDelete = pagesText.split('\n')
            .map(page => page.trim())
            .filter(page => page.length > 0);

        if (pagesToDelete.length === 0) {
            showMessage('没有找到有效的页面标题', 'error');
            return;
        }

        // 删除确认
        if (!confirm('您即将删除 ' + pagesToDelete.length + ' 个页面。是否继续？')) {
            return;
        }

        // 准备删除
        const reason = document.getElementById('delete-reason').value;
        const processingRate = parseFloat(document.getElementById('processing-rate').value) * 1000; // 转换为毫秒

        // 获取保护设置
        const protectEnabled = document.getElementById('protect-after-delete').checked;
        let protectionParams = null;

        if (protectEnabled) {
            // 保护参数
            protectionParams = {
                level: document.getElementById('protection-level').value,
                expiry: convertExpiryToTimestamp(document.getElementById('protection-expiry').value),
                reason: document.getElementById('protection-reason').value
            };
        }

        const statusContainer = document.getElementById('deletion-status');
        statusContainer.style.display = 'block';

        const resultsElement = document.getElementById('deletion-results');
        resultsElement.innerHTML = '';

        // 开始删除过程
        processPageDeletion(pagesToDelete, 0, reason, protectionParams, processingRate);
    }

    // 转换保护期限为MediaWiki API接受的格式
    function convertExpiryToTimestamp(expiryOption) {
        // 如果是infinite（永久），直接返回
        if (expiryOption === 'infinite') {
            return 'infinite';
        }

        // 获取当前日期
        const now = new Date();

        // 根据选择的选项计算到期日期
        switch (expiryOption) {
            case '1 week':
                now.setDate(now.getDate() + 7);
                break;
            case '1 month':
                now.setMonth(now.getMonth() + 1);
                break;
            case '3 months':
                now.setMonth(now.getMonth() + 3);
                break;
            case '6 months':
                now.setMonth(now.getMonth() + 6);
                break;
            case '1 year':
                now.setFullYear(now.getFullYear() + 1);
                break;
            default:
                // 如果无法识别选项，默认为一周
                now.setDate(now.getDate() + 7);
        }

        // 将日期格式化为MediaWiki API接受的格式：YYYY-MM-DDThh:mm:ssZ
        return now.toISOString().replace(/\.\d+Z$/, 'Z');
    }

    // 处理页面删除（递归）- 修改为使用自定义速率
    function processPageDeletion(pages, index, reason, protectionParams, processingRate) {
        if (index >= pages.length) {
            // 所有页面处理完毕
            document.getElementById('progress-text').textContent = '完成! 删除操作已结束。';
            return;
        }

        const page = pages[index];
        const progressElement = document.getElementById('progress');
        const progressTextElement = document.getElementById('progress-text');
        const resultsElement = document.getElementById('deletion-results');

        // 更新进度
        const progressPercentage = Math.round((index / pages.length) * 100);
        progressElement.style.width = progressPercentage + '%';
        progressTextElement.textContent = '正在处理: ' + page + ' (' + (index + 1) + '/' + pages.length + ', ' + progressPercentage + '%)';

        // 执行删除API调用
        const api = new mw.Api();
        api.postWithToken('csrf', {
            action: 'delete',
            title: page,
            reason: reason,
            format: 'json'
        }).done(function() {
            // 删除成功
            const resultItem = document.createElement('div');
            resultItem.style.color = '#3c763d';
            resultItem.textContent = '✓ 成功删除: ' + page;
            resultsElement.appendChild(resultItem);

            // 如果需要保护页面
            if (protectionParams) {
                protectDeletedPage(page, protectionParams, resultsElement);
            }

            // 使用自定义速率延迟继续下一个
            setTimeout(function() {
                processPageDeletion(pages, index + 1, reason, protectionParams, processingRate);
            }, processingRate); // 使用自定义处理速率
        }).fail(function(code, result) {
            // 删除失败
            const resultItem = document.createElement('div');
            resultItem.style.color = '#a94442';
            resultItem.textContent = '✗ 删除失败: ' + page + ' - ' + (result.error ? result.error.info : code);
            resultsElement.appendChild(resultItem);

            // 使用自定义速率延迟继续下一个
            setTimeout(function() {
                processPageDeletion(pages, index + 1, reason, protectionParams, processingRate);
            }, processingRate); // 使用自定义处理速率
        });
    }

    // 保护已删除的页面
    function protectDeletedPage(page, protectionParams, resultsElement) {
        const api = new mw.Api();
        api.postWithToken('csrf', {
            action: 'protect',
            title: page,
            protections: 'create=' + protectionParams.level,
            expiry: protectionParams.expiry,
            reason: protectionParams.reason,
            format: 'json'
        }).done(function() {
            // 保护成功
            const resultItem = document.createElement('div');
            resultItem.style.color = '#3a87ad';
            resultItem.textContent = '🔒 成功保护: ' + page;
            resultsElement.appendChild(resultItem);
        }).fail(function(code, result) {
            // 保护失败
            const resultItem = document.createElement('div');
            resultItem.style.color = '#8a6d3b';
            resultItem.textContent = '⚠ 保护失败: ' + page + ' - ' + (result.error ? result.error.info : code);
            resultsElement.appendChild(resultItem);
        });
    }

    // 检查页面是否存在
    function checkPageExists(pageName, callback) {
        const api = new mw.Api();
        api.get({
            action: 'query',
            titles: pageName,
            format: 'json'
        }).done(function(data) {
            if (data.query && data.query.pages) {
                // 页面ID为负数表示不存在
                const pageId = Object.keys(data.query.pages)[0];
                callback(parseInt(pageId) > 0);
            } else {
                callback(false);
            }
        }).fail(function() {
            callback(false);
        });
    }

    // 工具初始化
    function initTool() {
        console.log('正在初始化Fandom批量删除与保护工具...');
        createInterface();
        console.log('Fandom批量删除与保护工具已加载。');
    }

    // 在DOM加载完成后初始化工具
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTool);
    } else {
        initTool();
    }
})();

// ==UserScript==
// @name         Fandom批量删除与保护工具
// @author       PandaFiredoge
// @version      1.4
// @description  一个用于Fandom站点的批量删除页面并可选保护的工具
// @match        *://*.fandom.com/*/wiki/Special:*
// @match        *://*.wikia.com/*/wiki/Special:*
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

            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button id="load-category-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">加载分类页面</button>
                <button id="load-prefix-button" style="padding: 8px 15px; background-color: #3a87ad; color: white; border: none; border-radius: 3px; cursor: pointer;">加载前缀页面</button>
                <button id="preview-button" style="padding: 8px 15px; background-color: #5bc0de; color: white; border: none; border-radius: 3px; cursor: pointer;">预览页面列表</button>
                <button id="delete-button" style="padding: 8px 15px; background-color: #d9534f; color: white; border: none; border-radius: 3px; cursor: pointer;">开始删除</button>
            </div>

            <div id="modal-container" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5);">
                <div id="modal-content" style="background-color: white; margin: 10% auto; padding: 20px; border-radius: 5px; width: 60%; max-width: 600px;">
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
        document.getElementById('modal-close').addEventListener('click', closeModal);

        // 添加保护选项切换功能
        document.getElementById('protect-after-delete').addEventListener('change', function() {
            document.getElementById('protection-options').style.display = this.checked ? 'block' : 'none';
        });
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
    }

    // 关闭模态框
    function closeModal() {
        document.getElementById('modal-container').style.display = 'none';
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

        let html = `<h4>在分类 "${categoryName}" 中找到 ${pages.length} 个页面：</h4>`;

        html += `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-category" checked>
                <label for="select-all-category">全选/取消全选</label>
            </div>

            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px;">
        `;

        pages.forEach((page, index) => {
            html += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="cat-page-${index}" class="page-checkbox" value="${page}" checked>
                    <label for="cat-page-${index}">${page}</label>
                </div>
            `;
        });

        html += `</div>
            <button id="add-category-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
        `;

        resultContainer.innerHTML = html;

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

        let html = `<h4>在命名空间 "${namespaceText}" 中找到 ${pages.length} 个以 "${prefix}" 开头的页面：</h4>`;

        html += `
            <div style="margin-bottom: 10px;">
                <input type="checkbox" id="select-all-prefix" checked>
                <label for="select-all-prefix">全选/取消全选</label>
            </div>

            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px;">
        `;

        pages.forEach((page, index) => {
            html += `
                <div style="margin: 5px 0;">
                    <input type="checkbox" id="prefix-page-${index}" class="page-checkbox" value="${page}" checked>
                    <label for="prefix-page-${index}">${page}</label>
                </div>
            `;
        });

        html += `</div>
            <button id="add-prefix-pages-button" style="padding: 6px 12px; background-color: #5cb85c; color: white; border: none; border-radius: 3px; cursor: pointer;">将选中页面添加到删除列表</button>
        `;

        resultContainer.innerHTML = html;

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

        // 显示预览
        const content = `
            <div>
                <strong>总页面数:</strong> ${pagesToDelete.length}<br>
                <strong>删除原因:</strong> ${document.getElementById('delete-reason').value}
            </div>

            ${protectionInfo}

            <div style="max-height: 300px; overflow-y: auto; margin-top: 10px; border: 1px solid #ddd; padding: 10px;">
                <ol>
                    ${pagesToDelete.map(page => `<li>${page}</li>`).join('')}
                </ol>
            </div>

            <div style="margin-top: 15px; padding: 10px; background-color: #fcf8e3; border: 1px solid #faebcc; color: #8a6d3b; border-radius: 4px;">
                <strong>警告:</strong> 请确认以上列表。点击"开始删除"后，这些页面将被永久删除。此操作无法撤销，请确保您有删除权限。
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
        if (!confirm('您即将删除 ' + pagesToDelete.length + ' 个页面。此操作无法撤销。是否继续？')) {
            return;
        }

        // 准备删除
        const reason = document.getElementById('delete-reason').value;

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
        processPageDeletion(pagesToDelete, 0, reason, protectionParams);
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

    // 处理页面删除（递归）
    function processPageDeletion(pages, index, reason, protectionParams) {
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

            // 继续下一个
            setTimeout(function() {
                processPageDeletion(pages, index + 1, reason, protectionParams);
            }, 500); // 添加短暂延迟以避免过快发送请求
        }).fail(function(code, result) {
            // 删除失败
            const resultItem = document.createElement('div');
            resultItem.style.color = '#a94442';
            resultItem.textContent = '✗ 删除失败: ' + page + ' - ' + (result.error ? result.error.info : code);
            resultsElement.appendChild(resultItem);

            // 继续下一个
            setTimeout(function() {
                processPageDeletion(pages, index + 1, reason, protectionParams);
            }, 500); // 添加短暂延迟以避免过快发送请求
        });
    }

    // 保护已删除的页面

    function protectDeletedPage(page, protectionParams, resultsElement) {
    const api = new mw.Api();
    api.postWithToken('csrf', {
        action: 'protect',
        title: page,
        protections: 'create=' + protectionParams.level,
        expiry: protectionParams.expiry, // 移除了"create="前缀
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

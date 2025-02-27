# FandomBatchDeleteTool
由Claude 3.7生成
* 支持批量删除页面
* 支持批量删除某个分类里的页面
* 支持批量删除有某个前缀的页面
* 支持正则匹配删除页面
* 支持批量删除某个用户创建的页面
* 支持自定义删除速率

一个诡异的bug：Firefox浏览器随机出现无法加载的bug……
### 安装
1.安装Tampermonkey浏览器扩展

2.安装这个脚本
### 使用
1.访问任何特殊页面：

* 工具会在任何Fandom特殊页面上显示（比如Special:RecentChanges）
* 您应该会在页面顶部看到"批量删除页面工具"面板


2.添加要删除的页面：

* 手动输入：直接在文本框中输入页面名称，每行一个
* 从分类加载：点击"加载分类页面"按钮，输入分类名称（不带Category:前缀）
* 从前缀加载：点击"加载前缀页面"按钮，输入页面标题前缀和选择命名空间


3.预览和删除：

* 输入删除原因（默认为"批量清理"）
* 点击"预览页面列表"检查要删除的页面
* 确认无误后，点击"开始删除"
* 系统会要求您再次确认删除操作
* 确认后，工具会开始依次删除页面并显示进度



4.重要注意事项

* 您必须拥有wiki的管理员或删除权限才能使用此工具
* 工具会自动检查您是否有管理员权限，如果没有，工具将不会加载

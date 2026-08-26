# Powy 仓库与品牌迁移设计

## 目标

把 `Powy` 设为产品、PWA、下载文件、代码公共接口、文档、GitHub 仓库和 GitHub Pages 的唯一正式名称，同时保证旧网址、旧备份和现有账号数据仍可使用。

新的正式地址为：

- 仓库：`https://github.com/zhixuanlucasfeng-cmyk/powy`
- 网站：`https://zhixuanlucasfeng-cmyk.github.io/powy/`

## 发布架构

不直接重命名原仓库。GitHub 不会自动重定向改名后的项目 Pages 地址，直接改名会使旧 `/liangli/` PWA 入口失效。

采用双仓库迁移：

1. 新建公开 `powy` 仓库并推送完整 Git 历史。
2. 从新仓库的 `main` 分支发布正式 Powy 网站。
3. 原 `liangli` 仓库保留为兼容入口；其 Pages 首页只负责将访问者引导到 `/powy/`。
4. 原仓库不再承载产品开发，新提交只进入 `powy`。
5. 旧兼容入口保留 90 天；确认新站、注册、登录和找回密码稳定后，可归档或删除旧仓库。

对外分享、文档和最终交付只使用干净的正式地址 `https://zhixuanlucasfeng-cmyk.github.io/powy/`，不附加 `?v=数字` 或其他版本查询参数。版本更新完全由 Service Worker 处理。

## 品牌统一

以下名称全部改为 Powy：

- Flashcard 与生活数据的新导出文件名和 JSON `format`。
- JavaScript 公共对象 `PowyAccountSync`。
- Service Worker 应用壳和视频缓存前缀。
- README、CLAUDE.md、部署命令、目录示例与正式网址。
- Web App Manifest 增加稳定 `id`，并保持 `name` / `short_name` 为 `Powy`。

## 数据兼容

旧名称只允许存在于集中、明确标记的兼容边界中：

- 新解析器同时接受旧 `liangli-flashcards` / `liangli-life` 备份；新导出只生成 `powy-*`。
- 现有 localStorage、IndexedDB 和 Supabase 表/RPC 继续可读，不清空、不自动覆盖。
- 新 Service Worker 使用 `powy-*` 缓存，并在激活时清理本项目旧 `liangli-*` 缓存。
- 生产 Supabase 表和 RPC 不为品牌目的改名；这些是已部署的数据协议，重命名没有用户收益且会增加同步风险。
- 应用只保留现有的最新三份本机恢复快照；更旧快照可继续按现有保留策略删除。网页无权删除用户已经下载到设备文件夹中的 JSON 备份。

## 账号回调迁移

Supabase Auth 的生产 Site URL 改为新的 `/powy/` 完整 HTTPS 地址；Allowed Redirect URLs 在过渡期同时保留新旧完整地址。注册确认和找回密码必须在新地址完成实机验证后，旧地址才能只保留跳转用途。

任何账号、表、行、密码或会话都不删除。

## UI 改进范围

保留当前五页漫画分镜和 Powy 伙伴布局，不进行新的整站重画。本轮只处理高价值一致性问题：

- 修正文档中已经过期的缓存版本、动画状态数量和素材路径。
- 确保所有用户可见品牌、下载名称和安装名称一致。
- 保证 320、375、414、768 像素宽度无横向滚动；现有 iPad 全宽布局继续保留。

## 测试与验收

- 先写失败测试，再修改生产代码。
- 新导出使用 Powy 格式；旧 Liangli 备份仍可导入。
- 新缓存使用 Powy 前缀，并只清理本项目的新旧缓存。
- Manifest 的名称、`id`、方向和图标合同通过。
- Python、Node、媒体、JavaScript 语法和 `git diff --check` 全部通过。
- 在真实浏览器验证五个页面、PWA 注册、伙伴视频和账号入口。
- 新仓库 Pages 部署成功，Supabase 新回调生效，旧网址能到达新网址。
- 所有交付链接均为不带版本查询参数的 `/powy/` 正式地址。

## 不做

- 不重写为 React/Vue，不引入构建工具或新依赖。
- 不为消除隐藏字符串而重命名生产数据库表。
- 不删除旧用户数据，不自动合并不同账号的数据。
- 不再次重画已经可用的漫画 UI。

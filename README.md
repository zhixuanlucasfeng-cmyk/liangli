# Powvy Habit · 校园漫画习惯工作台

任务、想法、目标、专注、钱包、饮食、日记和卡片学习。新版采用左侧导航、漫画纸页与墨线边框、睡猫图标和分页记录。右上角月亮按钮切换夜间模式：首次跟随系统，手动选择后在这台设备记住偏好。

## 下载安装

[GitHub Releases 下载](https://github.com/zhixuanlucasfeng-cmyk/liangli/releases)

- Mac Apple Silicon：选择 `mac-arm64.dmg`。
- Mac Intel：选择 `mac-x64.dmg`。
- Windows 64 位：选择 `win-x64.exe`。

首版为预览版：没有 Apple Developer ID、公证或 Windows 发布者证书。Mac 使用本地 ad-hoc 签名，不等于受信任发布者签名。系统可能阻止打开；请核对同一 release 的 SHA256SUMS.txt，不要关闭系统级安全保护。没有自动更新功能，更新时重新下载安装。

iPad 使用浏览器/PWA，不使用桌面安装包。此分支不会自动替换现有 GitHub Pages 网站。

## 主要变化

- Powvy Habit 统一品牌、带红角与浅粉金毛的睡猫图标；日间纸色/暗红、夜间石墨/暖珊瑚色，不再使用纯白画布。
- 左侧直接进入今日、想法、目标、专注、钱包、饮食、日记、卡片学习和备份。
- 常规电脑/iPad 尺寸下，主要页面无需上下滚动。记录按可用高度分页；窄屏可切换「编辑 / 操作」和「记录 / 数据」。
- 钱包提供周期总额、储蓄预留、每日结余、周期剩余、分类统计、快捷分类、消费筛选与编辑。
- 长文字可展开阅读；长卡片、账号对话框及极小/放大窗口保留必要的滚动，避免内容不可达。
- 不修改既有数据结构；账号、离线保存和原有业务计算继续复用。

## 旧数据如何带过来

桌面应用与浏览器使用独立存储，不会自动读取旧网页数据。

1. 钱包、饮食：在旧网页导出「生活数据」，再到新版左侧「数据备份」导入；确认数量摘要后才会替换本机生活数据。
2. 任务、想法、目标、专注和日记：使用既有的可选账号同步；本次没有改动生产数据库或执行 live SQL 验收。
3. 卡片：可以使用既有账号同步，也可以 JSON 导出/导入。
4. 确认迁移成功前保留旧浏览器数据和导出文件。卸载程序不会主动删除 Electron 的用户数据目录。

钱包只是预算记录工具，不涉及银行账户、充值支付或真实转账。营养估算来自内置食物表，仅作记录参考，不是医疗建议。营养与钱包从不进入账号同步请求。

密码恢复邮件在原有 HTTPS 网站完成，随后回到桌面应用重新登录；桌面版不接管邮件链接。

## 开发和验证

需要 Node.js 22、npm、Python 3。源代码不依赖前端框架。

```bash
npm ci
npm start
npm test
npm run test:desktop
npm run dist -- --mac --arm64
npm run dist -- --mac --x64
npm run dist -- --win --x64
```

在 macOS 构建 Mac 包，在 Windows 构建 Windows 包；GitHub Actions 会分别在对应系统构建。桌面 smoke 测试需要有图形环境。

网页开发预览：

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

然后打开 http://127.0.0.1:8000 。iPad 正式 PWA 需要 HTTPS。

## 文件结构

- `index.html`：现有页面与业务逻辑；保留原存储兼容键。
- `workspace.css` / `workspace.js`：简洁布局、导航、分页与详情阅读。
- `account-sync.js`：既有账号与核心数据同步。
- `desktop/main.cjs`：安全桌面壳；沙箱、隔离、禁用 Node、资源与网络白名单。
- `app-icon.png`：内置图像生成工具制作的帕瓦猫同人风睡猫图标；提示词保存在 `docs/sleeping-cat-logo-prompt.txt` 并嵌入 PNG。
- `theme.js`：绘制前恢复日/夜主题，记住手动选择，无新增依赖。
- `manifest.json` / `sw.js`：网页安装和离线壳。
- `tests/`：业务回归、桌面安全、布局和持久化测试。
- `.github/workflows/desktop.yml`：三平台安装包、校验值和预览发布。
- `supabase/`：既有迁移与隔离测试，发布桌面包不执行这些数据库脚本。

修改网页缓存资源时提升 `sw.js` 的 VERSION。不得更改既有存储键来“重新开始”，不得上传钱包/饮食数据。可选账号后端仍遵守已有 schema 和 RLS 边界；新的部署必须单独验证账号隔离与认证流程。

改名兼容：桌面继续使用原 `Powy` 数据目录、`com.powy.workspace` 应用 ID 和 `powy://app` 本地来源；旧数据库、备份格式与账号表名保持兼容。用户界面、安装程序、图标和导出文件名均使用 Powvy Habit。仓库及旧网站 URL 未改名，避免破坏现有下载和密码恢复链接。

## 发布

推送 `v*-preview.*` 标签后，Actions 构建 Apple Silicon、Intel Mac 和 Windows x64 安装包；三项成功后创建 GitHub prerelease，附带 SHA-256 校验值。发布说明位于 [docs/desktop-release.md](docs/desktop-release.md)。

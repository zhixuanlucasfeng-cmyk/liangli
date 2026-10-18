# Powvy Habit · Campus manga + night mode preview

中文：统一改名为 Powvy Habit，换上红角浅粉金毛的睡猫图标，使用校园漫画纸色、墨线分镜与网点视觉。右上角月亮按钮切换夜间模式；首次跟随系统，手动选择后记住偏好。保留左侧导航、分页、任务、目标、专注、钱包、饮食、日记、卡片和可选账号同步。

Upgrading from Powy: the existing desktop data directory, app ID and local origin remain unchanged. Visible branding, installer names and icons are now Powvy Habit. Quit the old app before opening the new app. Keep a backup before upgrading. The original website and repository URLs are unchanged.

## Download / 下载

- Apple Silicon (M1/M2/M3/M4 and newer): `mac-arm64.dmg`
- Intel Mac: `mac-x64.dmg`
- Windows x64: `win-x64.exe`

macOS: open the DMG and drag Powvy Habit into Applications. Windows: run the installer and choose your destination. These are **unsigned preview builds, not notarized releases**. macOS Gatekeeper or Windows SmartScreen may warn or block launch. Only proceed with an artifact downloaded from this repository and verified against SHA256SUMS.txt; do not disable system-wide protection. Mac builds receive only local/ad-hoc signing, not Developer ID signing.

这是未签名、未经公证的预览版本，系统可能拦截。请只使用本仓库的下载文件并核对校验值，不要关闭系统级安全保护。

## Existing data / 旧数据

Desktop data is separate from browser data; an installer does not import browser storage. For tasks/goals/focus/journals and flashcards, use the existing optional account sync, or the flashcard JSON export/import. Wallet and nutrition stay local: export “生活数据” in the old website, then import it in the desktop app's “数据备份” page. Keep the original browser data until you verify the import. Wallet balances are planning records, not a bank account or payment service.

桌面版不会自动读取浏览器中的数据。旧网站的钱包和饮食数据请先导出，再到桌面版左侧「数据备份」导入；任务等使用原有账号同步。迁移确认成功前不要清除旧数据。

Normal laptop/iPad layouts use in-place paging instead of page scrolling. Long documents and account dialogs can scroll for accessibility; zoomed or very short windows use an accessible fallback. iPad uses the web version/PWA, not the Mac or Windows installer. This release does not automatically update the existing GitHub Pages website or provide automatic desktop updates.

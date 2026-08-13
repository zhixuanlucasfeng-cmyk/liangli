# Powy 品牌改名设计

## 目标

把用户可见的产品名称从“量力 / Liangli”统一改为“Powy”，包括网页、页头和安装到 iPhone/Android 主屏幕后显示的应用名称。

## 范围

- `index.html`：页面标题、描述、页头 Logo 文字和应用名改为 `Powy`。
- `manifest.json`：`name` 与 `short_name` 改为 `Powy`。
- `sw.js`：注释中的品牌改名，并升级应用壳缓存版本，确保已安装设备获取新页面与清单。
- `README.md`：文档展示名称改为 `Powy`。

## 兼容边界

内部 JavaScript API、localStorage / IndexedDB 键、导入导出格式、Supabase 表和 RPC 继续使用既有 `Liangli` / `liangli_*` 标识。它们是持久化协议，不是用户可见品牌；重命名会导致现有数据、备份或云端同步不兼容。

## 验收

- 页面与 PWA 清单只显示 `Powy` 品牌。
- 旧本地数据仍可读取，账号同步协议不变。
- 全套自动测试、媒体、语法和 Service Worker 检查通过。


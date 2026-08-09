# 量力 Liangli · 荒诞电影漫画 PWA

反假性自律的个人成长工具。默认本地优先：任务、精力、目标、专注和心情始终只存在用户设备；Flashcards 可在用户主动登录后通过 Supabase 跨设备同步。

## 文件

```
liangli/
├── index.html              # 整个应用（样式、页面与业务逻辑仍保持单文件）
├── manifest.json           # PWA 配置：应用名、图标、主题色
├── sw.js                   # Service Worker：应用壳/poster 预缓存、MP4 按需缓存
├── assets/power-cat/       # Power 猫四态：同名 MP4 循环 + WebP poster
├── assets/power-human/     # 粉发人形 Power 四态：同名 MP4 循环 + WebP poster
├── scripts/
│   ├── generate_companion_media.py  # 从已确认 poster 生成确定性循环动画
│   └── verify_companion_media.py    # 检查格式、体积、黑帧、循环和局部动作
├── tests/                  # UI、播放控制器和 Service Worker 合同/行为测试
├── supabase/
│   ├── migrations/002_flashcards.sql # Flashcards 表结构与严格 RLS
│   └── tests/flashcards_rls.sql       # 两用户隔离测试（需 Supabase 环境）
├── icon-192.png            # 图标
├── icon-512.png
└── icon-maskable-512.png   # 安卓自适应图标
```

## 功能

| 模块 | 说明 |
|---|---|
| **今日** | 负荷系统。任务可选起止时间和学习助手；进度条实时变色，超载提醒但不阻止；Power 猫 / 人形 Power 伙伴可自由选择 |
| **成长池** | 想法暂存区，不占负荷。一键「转为任务」 |
| **目标** | 长期目标 + 进度条，用 +/− 手动推进 |
| **专注** | 25 分钟番茄钟 + 数据看板（今日专注/番茄数/完成任务 + 近 7 天趋势柱状图） |
| **记录** | 每日做了什么 + 心情。**明确告知用户：只存本地，无人可见** |

学习助手目前包含任务关联番茄钟，以及离线 Anki 式 Flashcards。Flashcards 支持牌组/卡片管理、到期优先、每天每牌组最多 20 张新卡、空格翻面、`1–4` 评分，以及 JSON/CSV 导入导出。简化复习间隔为：重来约 10 分钟；困难约 `1.2×`；良好新卡 1 天/成熟卡约 `2.5×`；简单新卡 4 天/成熟卡约 `4×`，最长 36500 天。它借用 Anki 的四按钮语义，但不宣称兼容 FSRS。

其他：中英文一键切换（右上角按钮）、跨天自动重置、番茄完成震动反馈。

> **刻意没做的功能**：老师查看学生数据、算法推断心理健康。原因见下方「设计决策」。

---

## 视觉与播放架构

五个页面共用一套原创“荒诞电影漫画”视觉语言，但不改变原有功能和数据结构：

- CSS 颜色由 `:root` 的 `--ink`、`--paper`、`--blood`、`--power-pink`、`--warning` 等 token 统一控制。
- 五个 `<section>` 分别带 `.manga-view` 和页面语义类；纸张分镜使用 `.manga-panel`，手写标题使用 `.manga-title`，纯装饰使用 `.manga-decor`。
- 不规则布局是固定的轻微错位，不使用运行时随机位置；正文、输入框和主要操作始终稳定可读。
- Power 舞台同时保留两层 `.companion-video`。新状态在隐藏层完成加载和播放后，以约 150ms 交叉淡入，再释放旧层，避免切换时出现黑帧。
- 每个状态都有同名 WebP poster。首次加载、自动播放失败和 `prefers-reduced-motion: reduce` 时均可显示静态图。
- 播放请求使用递增 request id；快速切换角色或负荷状态时，只有最后一次请求可以完成换层。

素材路径固定为：

```text
assets/power-{cat|human}/{idle|content|tired|exhausted}.{mp4|webp}
```

Service Worker 的应用壳缓存当前为 `liangli-v7`。安装时只预缓存 HTML、manifest、图标和 8 张 WebP poster；MP4 第一次播放后写入 `liangli-video-v1`，并正确响应浏览器的 Range 请求。跨域的 Supabase/Auth/CDN 请求不会进入 Service Worker 缓存。

### 素材生成与验收

需要 Python、Pillow、NumPy、FFmpeg 和 ffprobe：

```bash
python3 scripts/generate_companion_media.py
python3 scripts/verify_companion_media.py
```

生成器从现有 512×512 WebP poster 创建 90 帧、30fps、3 秒、H.264/yuv420p、无音轨的循环 MP4。验收脚本逐个检查 8 段 MP4 和 8 张 poster，包括尺寸、编码、帧率、体积、五次连续解码、黑帧、首尾连续性、动作幅度和局部关节动作；同时在 `.superpowers/` 下生成五帧动作审查图，该目录不进入发布包。

### 完整本地验证

```bash
python3 -m unittest discover -s tests -v
python3 scripts/verify_companion_media.py
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const a=h.indexOf("<script>")+8;const b=h.lastIndexOf("</script>");new Function(h.slice(a,b));console.log("JS syntax OK")'
git diff --check
```

---

## 怎么跑起来

### 本地预览（最快）

直接双击 `index.html` 就能用全部功能。
但 Service Worker 在 `file://` 下不会注册，所以**离线和「安装到主屏」要用本地服务器**：

```bash
cd liangli
python3 -m http.server 8000
```

然后浏览器打开 `http://localhost:8000`

### 部署上线（发给同学用）

三个选项，都免费，推荐第一个：

**1. Netlify Drop（最简单，30 秒，不用注册）**
打开 https://app.netlify.com/drop → 把整个 `liangli` 文件夹拖进去 → 拿到一个链接，直接发群里。

**2. GitHub Pages（推荐长期用）**
```bash
cd liangli
git init && git add . && git commit -m "liangli v1"
gh repo create liangli --public --source=. --push
```
然后到仓库 Settings → Pages → Source 选 `main` 分支 → 几分钟后链接就是
`https://<你的用户名>.github.io/liangli/`

好处：以后改代码 `git push` 一下就自动更新，还能顺带练 Git。

**3. Vercel** — `npx vercel` 一行命令，也很快。

> **必须是 HTTPS**，PWA 才能安装。上面三个平台都自带 HTTPS，本地 `localhost` 也算安全环境。

### 让同学装到手机主屏

- **iPhone**：Safari 打开链接 → 底部分享按钮 → 「添加到主屏幕」
- **安卓 Chrome**：会自动弹「安装应用」横幅，或右上角菜单 → 「安装应用」

装完就是全屏运行，和原生 App 几乎没区别，还能离线用。

---

## 改代码

**应用代码仍全部在 `index.html` 一个文件里**，分三段：

1. `<style>` — 样式。改配色只需改最上面 `:root` 里的 CSS 变量
2. `<body>` — 页面结构，五个 `<section class="view">` 对应五个 tab
3. `<script>` — 逻辑，按 `/* ===== 模块名 ===== */` 注释分好了段

**改完 `index.html` 或预缓存资源后，记得把 `sw.js` 里的 `VERSION` 加一**，否则用户浏览器可能继续用缓存的旧版本。`VIDEO_CACHE` 只在视频缓存策略或格式不兼容时才需要升级。

### 每日精力如何重新开始

「今天」按设备的本地日历日期计算。App 启动、从后台回来、窗口重新获得焦点以及本地午夜都会检查换日：今日精力与专注统计归零，昨天未完成的任务会自动放回成长池，已完成任务继续保存在本机历史中。重复刷新不会重复迁移同一任务。

### Flashcards 本地存储与账号同步

卡片数据保存在 IndexedDB：匿名本机库名为 `liangli-flashcards-v1`，每个已登录账号使用独立的账号库；库内有 `decks`、`cards`、`reviews` 和 `syncOps` 四个 store。切换账号不会混用卡片。匿名卡片只有在用户明确点击「把本机卡片复制到此账号」后才会复制并换成新的 UUID。每次评分会在同一个事务里保存新排期、不可变复习记录、卡片同步操作和复习同步操作，所以断网或刷新不会丢进度。

同步默认关闭。启用前必须：

1. 在 Supabase 项目执行 `supabase/migrations/002_flashcards.sql`。
2. 在一次性测试项目运行 `supabase/tests/flashcards_rls.sql`，确认两个账号互相看不到数据。
3. 只把项目 URL 和 **anon public key** 填到 `index.html` 顶部的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`；客户端绝不能放管理密钥。认证和数据请求由原生 `fetch` 完成，不加载第三方 JavaScript，CSP 只允许连接 Supabase 域名。
4. 再做两台设备、断网编辑、重新上线合并的实机验收，最后才部署。

只有 `flashcard_decks`、`flashcards`、`flashcard_reviews` 会同步。任务、精力、目标、番茄统计、心情、测验和清单永远不会进入云端同步路径。冲突分别按内容更新时间与最后复习时间合并；删除使用软删除，复习记录按 UUID 做不可变并集。退出账号只停止同步，不会删除本机副本；如需清空设备，应另做带二次确认的显式操作。

若怀疑 anon key 暴露或项目被滥用，应先在 Supabase 轮换 public key，再更新客户端配置并升级 `sw.js` 缓存版本。把两个配置重新设为空字符串即可立刻禁用账号入口而不影响本地卡片。

### 常见改动

```js
// 改番茄钟时长（index.html 里搜 TOTAL）
const TOTAL = 25*60;        // 改成 45*60 就是 45 分钟

// 改默认负荷上限（搜 loadMax）
loadMax: DB.get('loadMax', 100)    // 100 改成你想要的数

// 加/改文案：找到 I18N 对象，zh 和 en 两处都改
```

---

## 设计决策（写申请文书时用得上）

**为什么没做「老师查看学生数据 + 心理健康算法」？**

1. **师生权力不对等，「学生可选择不分享」是假选项。** 全班 40 人开了 38 个，剩下 2 个反而更扎眼。真正的自愿需要选择不被观测到。

2. **用任务完成率推断心理状态在科学上站不住。** 完成率低可能是抑郁，也可能是那周在准备竞赛。误报会给青少年贴上标签，漏报则会制造虚假的安全感。

3. **法律不允许。** 阿联酋 PDPL (Federal Decree-Law No. 45 of 2021) 把儿童数据和健康数据都列为敏感数据；2025 年新颁的儿童数字安全法 (Federal Decree-Law No. 26 of 2025) 2027 年 1 月强制合规。未成年开发者无法作为 data controller 承担这些责任。

4. **它和产品哲学自相矛盾。** 量力的核心是消除「计划-做不到-自责」的压力循环。一旦老师能看，学生记录时想的就是「老师会怎么看我」，数据立刻失真，压力反而被引了回来。

**替代方案（v2 可做）：** 保留全部洞察但只给学生自己看，再加一个「我需要帮助」按钮——分享什么、什么时候分享、分享给谁，全部由学生决定。老师端如果需要，只给班级层面的匿名聚合数据。

---

## 下一步建议

- [ ] 先自己用两周，把不顺手的地方记下来
- [ ] 找 10-20 个同学试用，重点问：负荷值估得准吗？超载提醒是帮助还是烦人？
- [ ] 根据反馈调整默认负荷上限（100 可能不适合所有人）
- [ ] v2 考虑：负荷上限根据历史数据自动校准 —— 这是真正的护城河
- [ ] 配置独立 Supabase 测试项目，跑通 Flashcards 两账号 RLS 与离线合并后再启用生产同步
- [ ] 校园墙、好友和聊天作为独立后端阶段设计；不能复用或上传任务、精力、心情等私人数据

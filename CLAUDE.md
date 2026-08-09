# 量力 Liangli — 项目上下文

> 这个文件是给 Claude Code 读的。每次会话开始会自动加载，不需要用户重复解释背景。

## 开发者情况

- Year 12 学生，就读迪拜 Jumeirah College（英式课程，A-Level）
- **编程初学者**。请解释你在做什么和为什么这么做，不要假设他懂术语
- 时间有限（要顶 A-Level + 准备大学申请），**优先做能立刻见效的改动**，避免大重构
- 母语中文，学校环境是英文。**用中文交流**，代码注释也用中文

## 产品是什么

「量力」是一款**反假性自律**的个人成长工具。核心洞察：

> 学生的痛苦不是来自不够自律，而是来自「列计划 → 做不到 → 自责」的循环。

所以它和传统清单软件的逻辑**相反**——不鼓励你多列，而是帮你看清今天到底扛得住多少。

### 五个模块

| 模块 | 作用 |
|---|---|
| **今日** | 负荷系统。每个任务带精力值，进度条实时显示今日总负荷，绿→黄→红 |
| **成长池** | 想法暂存区，不占负荷、不产生压力。可一键「转为任务」 |
| **目标** | 长期目标 + 进度条 |
| **专注** | 25 分钟番茄钟 + 数据看板（今日专注/番茄数/完成任务 + 近 7 天趋势） |
| **生活** | 可键盘切换的营养、钱包、记录三栏；营养/钱包/记录都只存本地 |

### 设计原则（改任何功能都要遵守）

1. **超载时提醒，不阻止。** 让用户看见现实，但保留他的自主权。永远不要用弹窗拦住用户。
2. **不制造新的焦虑。** 没有连续打卡天数、没有排行榜、没有「你已经 3 天没用了」这类推送。断掉了就断掉了。
3. **文案要温和，不说教。** 参考现有文案的语气：「别急着加 —— 把非必要的任务放进成长池吧」，而不是「你已超额，请立即调整」。
4. **隐私是产品承诺，不是设置项。** 记录页顶部明确告诉用户数据只在本地。

## 技术现状

纯前端 PWA。任务、精力、目标、专注、心情和 Life（营养/钱包）数据在 `localStorage`；Flashcards 在 IndexedDB，本地优先，并预留可选 Supabase Auth/Postgres 同步（默认配置为空）。

```
liangli/
├── index.html              # 整个应用都在这一个文件里（style + body + script 三段）
├── manifest.json           # PWA 配置
├── sw.js                   # Service Worker：壳/poster 预缓存 + MP4 按需 Range 缓存
├── assets/power-cat/       # Power 猫四态同名 MP4 + WebP poster
├── assets/power-human/     # 粉发人形 Power 四态同名 MP4 + WebP poster
├── scripts/                # 伙伴动画生成器与媒体验收器
├── tests/                  # UI、播放控制器、Service Worker 合同/行为测试
├── supabase/               # Flashcards schema、RLS 与两用户隔离测试
├── icon-192.png / icon-512.png / icon-maskable-512.png
├── README.md               # 部署说明
└── CLAUDE.md               # 本文件
```

### 关键技术约定

- **单文件代码架构是刻意的**，不要拆成多文件框架项目。视频等二进制素材可以放在 `assets/`，但应用代码仍保持在 `index.html` 一个文件里。用户是初学者，单文件他能看懂全貌。除非他明确要求，否则不要引入 React/Vue/构建工具/npm
- **中英双语**：`I18N` 对象里 `zh` 和 `en` 两份词条**必须一一对应**。加任何新文案都要两边都加，改完请检查两边 key 数量一致
- **改了 `index.html` 就要把 `sw.js` 里的 `VERSION` 号 +1**，否则用户拿到的是缓存旧版。这是最容易忘的一步，请每次主动提醒
- 普通功能数据读写统一走 `DB.get/DB.set`；Flashcards 统一走 `FlashcardStore`，不要直接操作 IndexedDB
- 跨天重置逻辑在 `rollover()` 里，改动时注意别破坏 `week` 数组左移的行为
- 所有用户输入渲染前必须过 `esc()` 转义

### 荒诞电影漫画 UI 约定

- 视觉 token 集中在 `index.html` 顶部 `:root`：墨黑 `--ink`、旧纸 `--paper`、重点红 `--blood`、Power 粉 `--power-pink`、警示黄 `--warning`。不要在新组件里另建一套主题色。
- 五页必须保留 `.manga-view` + 页面类（`.today-view`、`.pool-view`、`.goals-view`、`.focus-view`、`.journal-view`）。分镜使用 `.manga-panel`，手写标题使用 `.manga-title`，装饰使用 `.manga-decor`。
- 不规则感只能来自固定 CSS 规则；不要用随机旋转或随机位置。装饰必须 `pointer-events:none` 且 `aria-hidden="true"`，不能盖住正文或操作。
- 动画只改变 `transform`/`opacity`；爆发效果是短促的一次性反馈。`prefers-reduced-motion: reduce` 下禁用视频与装饰动画，显示 poster。
- 负荷状态阈值不得改变：`used===0` 为 idle，超过上限为 exhausted，超过上限 80% 为 tired，其余为 content。

### Power 伙伴播放与素材约定

- 稳定路径为 `assets/power-{cat|human}/{idle|content|tired|exhausted}.{mp4|webp}`，共 8 段 MP4 和 8 张 poster。改名会同时破坏运行时、测试和离线缓存。
- 舞台保留两层 `.companion-video`，由 `requestCompanion()` 做最后请求优先的预加载与约 150ms 交叉淡入。不要退回单 video 换 `src`，也不要让 8 段素材同时后台播放。
- `stopLayer()` 必须暂停、移除 `src`、调用 `load()` 并清理请求标记，防止过期 `canplay` 抢回画面。
- 自动播放失败、初始加载和 reduced motion 使用 `#companionPoster`；`#companionStatus` 提供本地化的角色/状态播报。
- `scripts/generate_companion_media.py` 从确认过的 WebP poster 生成确定性 512×512、90 帧、30fps、3 秒、H.264/yuv420p、无音轨循环。
- 修改任何伙伴素材后必须运行 `python3 scripts/verify_companion_media.py`。它检查编码、尺寸、时长、帧率、体积、五次解码、黑帧、首尾连续性、动作幅度与局部动作，并生成仅供审查的 motion contact sheet。

### 离线缓存约定

- `sw.js` 当前应用壳缓存为 `liangli-v8`，安装阶段预缓存页面、manifest、图标和 8 张 WebP poster，不预缓存 MP4。
- MP4 首次请求后写入独立的 `liangli-video-v1`；`serveVideo()` 将 Range 请求归一化为整段缓存，再返回正确的 206/416 响应。不要直接把带 Range 的 206 响应作为完整视频缓存。
- 跨域 Supabase/Auth/CDN 请求必须 network-only，Service Worker 不能缓存。
- 激活时只清理本项目旧的 `liangli-vN` / `liangli-video-vN`，不能删除同源的其他缓存。
- 修改 Service Worker 后运行 Python 合同测试和 `node tests/test_service_worker.js` 行为测试。

### Life（营养与钱包）约定

- Life 页保留营养、钱包、记录三个可键盘切换的面板。营养估算只匹配内置离线常见食物表，是记录时的近似值，不是医疗或营养建议；匹配不到时必须允许用户手动填写热量，超过目标只能显示差额，不能阻止记录。
- Life 的权威本地数据是 `localStorage` 中的 `lifeState`：热量目标、饮食记录、收藏食物、预算周期和消费记录在同一个 payload 中原子保存。不要恢复独立 `walletState` / `foodEntries` 等写入路径。
- 钱包中的「建议储蓄」只用于从周期总额计算可花额度，绝不代表转账、锁定资金或投资建议。每日基础额度均分 `周期总额 − 建议储蓄 + 上期结转`；当天结转为 `当天基础额度 + 前一天结转 − 当天消费`。正负结转都必须影响下一天，编辑/删除消费必须重新计算余额。
- 预算结束后不得自动续期。用户可选择沿用设置、充值后续期，或暂停；只有明确选择「带入」时，上一周期最终（可为负数）余额才作为新周期的 opening carry。
- Life JSON 导出/导入只包括热量目标、饮食记录/收藏、预算周期和消费；导入必须严格验证、先预览摘要、经确认后才替换 Life 数据。任务、账号、Flashcards 不在这个文件内，也不能被导入改动。
- 营养、钱包、消费和 Life JSON 备份绝不能进入 Supabase 请求或 Flashcards 同步 payload。更换设备或清理浏览器数据前提醒用户先导出 Life JSON。

### 发布前完整检查

```bash
python3 -m unittest discover -s tests -v
python3 scripts/verify_companion_media.py
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const a=h.indexOf("<script>")+8;const b=h.lastIndexOf("</script>");new Function(h.slice(a,b));console.log("JS syntax OK")'
git diff --check
```

## 绝对不做的事（伦理红线）

以下功能开发者主动决定**不做**，如果被要求加，请提醒他这些理由：

**❌ 老师查看学生数据**
师生权力不对等，「学生可选择不分享」是假选项——全班 40 人开了 38 个，剩下 2 个反而更扎眼。而且一旦老师能看，学生记录时想的就是「老师会怎么看我」，数据立刻失真，产品的减压初衷被反转成新的压力源。

**❌ 用算法推断心理健康状态**
任务完成率低可能是抑郁，也可能是那周在准备竞赛。误报会给青少年贴标签，漏报会制造虚假安全感。这在学术上都不成熟，独立开发者做不了。

**❌ 任何未经明确同意就上传个人数据的功能**
阿联酋 PDPL（Federal Decree-Law No. 45 of 2021）把儿童数据和健康数据都列为敏感数据；儿童数字安全法（Federal Decree-Law No. 26 of 2025）2027 年 1 月起强制合规。开发者本人是未成年人，无法作为 data controller 承担这些责任。

**替代方向**：如果要做求助功能，方向必须是「学生主动发起」——一个「我需要帮助」按钮，分享什么内容、什么时候、发给谁，全部由学生决定。

### Flashcards 同步边界

- `SUPABASE_URL` 与 `SUPABASE_ANON_KEY` 默认为空；迁移与两用户 RLS 测试通过前不得填写生产配置。
- 匿名牌库与每个账号的 IndexedDB 必须分区；不得在登录时自动认领匿名卡片，复制必须由用户明确点击。
- 只允许同步 `flashcard_decks`、`flashcards`、`flashcard_reviews`。任务、营养、钱包、消费和其他本地数据不能进入请求 payload。
- 本地写入必须先成功，再排入 `syncOps`；断网不能阻塞学习。
- 浏览器客户端只允许 public anon key，绝不能加入任何管理凭据。
- 不加载 Supabase CDN SDK；继续使用受 CSP 限制的原生 Auth/PostgREST `fetch` 封装。

## 工作方式

- 改动前先说明你打算改什么、为什么，等确认后再动手
- 一次只做一件事，做完让他在浏览器里验证，再做下一件
- 本地预览用 `python3 -m http.server 8000`（Service Worker 在 `file://` 下不注册）
- commit message 写清楚改了什么，不要写 "update"。这个仓库以后要给大学招生官看
- 涉及数据结构变更时，要考虑老用户 `localStorage` 里的旧数据怎么兼容

## 路线图

**近期**
- [ ] 部署到 GitHub Pages，拿到可分享链接
- [ ] 找 10-20 个同学试用，收集反馈

**中期**
- [ ] 根据反馈调整默认负荷上限（现在硬编码 100，未必适合所有人）
- [ ] 让用户能自定义精力档位和上限

**长期（真正的护城河）**
- [ ] **负荷上限自动校准**：根据用户历史的「预估精力 vs 实际完成情况」，反推他真实的承载力。这是别的清单软件做不到的，也是这个产品最有价值的部分
- [ ] 需要云同步/社区时再上后端，推荐 Supabase
- [ ] 用 Capacitor 把现有代码包成原生 App 上架（不要重写）

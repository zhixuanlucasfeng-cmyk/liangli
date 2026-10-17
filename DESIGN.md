---
name: Powvy Habit
description: 纸张、墨线与睡猫陪伴的校园漫画个人工作台
colors:
  bg: "#ded9cd"
  card: "#f0ebde"
  card2: "#e4dfd1"
  txt: "#282927"
  sub: "#57564e"
  line: "#a29e90"
  accent: "#9a3836"
  ok: "#3c6650"
  warn: "#79531b"
  danger: "#a72e37"
  ink: "#30332f"
  warning: "#ead9cf"
  selected-bg: "#e8cfc4"
  selected-text: "#7b2929"
  selected-border: "#9a3836"
  on-accent: "#fff3e3"
  sidebar: "#d2ccbd"
  track: "#c9c3b4"
  overlay: "#181b1c99"
  dot: "#3338301c"
  night-bg: "#191c1d"
  night-card: "#252a2b"
  night-card2: "#303637"
  night-txt: "#eee7d8"
  night-sub: "#c0b9ab"
  night-line: "#70776f"
  night-accent: "#ed9385"
  night-ok: "#a6c8a1"
  night-warn: "#ddbc7e"
  night-danger: "#ff9a98"
  night-ink: "#d7d0bf"
  night-warning: "#493336"
  night-selected-bg: "#4b3332"
  night-selected-text: "#ffb4a6"
  night-selected-border: "#ce857b"
  night-on-accent: "#271b19"
  night-sidebar: "#202525"
  night-track: "#4c524e"
  night-overlay: "#080b0cc9"
  night-dot: "#d7d0bf13"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-.03em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.5
  panel-tab:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "14px"
    fontWeight: 750
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  brand:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-.025em"
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft Yahei\", sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  control: "3px"
  panel: "3px"
  overlay: "5px"
  utility: "6px"
  status: "8px"
  portrait: "10px"
  progress: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  panel: "22px"
  overlay: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  nav-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  tag:
    backgroundColor: "{colors.card2}"
    textColor: "{colors.sub}"
    rounded: "{rounded.control}"
    padding: "3px 7px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.panel}"
    padding: "22px"
  panel-tab:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    typography: "{typography.panel-tab}"
    padding: "4px 10px"
  theme-toggle:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.control}"
    padding: "9px"
    width: "40px"
    height: "40px"
  theme-toggle-active:
    backgroundColor: "{colors.selected-bg}"
    textColor: "{colors.selected-text}"
    rounded: "{rounded.control}"
    padding: "9px"
    width: "40px"
    height: "40px"
  pager-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.control}"
  review-card:
    backgroundColor: "{colors.card2}"
    textColor: "{colors.txt}"
    rounded: "{rounded.panel}"
    padding: "28px"
---

# Design System: Powvy Habit

## Overview

**Creative North Star: "校园漫画手账"**

Powvy Habit 是一本可以操作的校园漫画手账：暖灰纸张、炭黑墨线、深红选择状态与细密网点承载日常记录。熟睡的 Power 灵感小角猫是品牌锚点；左侧导航、紧凑表单和视口分页维持清楚的工作秩序。

夜间模式把纸面换为石墨色、文字换为暖米色、交互换为浅珊瑚红，保持同一结构与印刷感。本规范记录 workspace.css、theme.js、workspace.js 和 index.html 的最终实现；已替代旧蓝白视觉。用户可见名称统一为 Powvy Habit，兼容性相关标识保持稳定。

**Key Characteristics:**

- 暖纸／石墨双主题，墨线框与网点留白。
- 小角猫与两行字标构成紧凑品牌区。
- 左侧导航常驻，窄屏采用图标栏与操作／记录切换。
- 列表按视口高度分页，完整内容可通过详情读取。

## Colors

前置元数据中的无前缀颜色对应日间 CSS 变量；`night-` 前缀对应 `:root[data-theme=dark]` 对同名变量的覆盖，不是新增 CSS 变量。组件令牌展示日间角色，夜间使用对应的 `night-` 颜色。CSS 的 `accent2`、`focus`、`blood` 是 `accent` 别名，`paper` 是 `card` 别名。

### Primary

`accent` 深红／夜间浅珊瑚红用于主按钮、当前导航与进度。`on-accent` 是其专用前景；不要把面板颜色当作按钮文字。`selected-bg`、`selected-text`、`selected-border` 用于能量选择、类别、主题开关及文本选择。

### Neutral

`bg` 是暖灰纸画布／石墨画布，`sidebar` 是侧栏，`card` 与 `card2` 是主次内容面。`txt`、`sub` 分别承载正文和说明；`line` 是细分隔线，`ink` 是面板边框与实色标题签。`track` 用于进度轨道及部分行分隔；`dot` 是半透明网点，`overlay` 是遮罩。

`ok`、`warn`、`danger` 分别表示正常、警示与错误；`warning` 为危险操作悬停背景。状态同时依靠文字、图形或控件语义表达。

**The Paper and Ink Rule.** 网点只铺在工作区背景与面板间隙；内容面板使用实色纸面，正文不叠加纹理。

**The Same Notebook Rule.** 日夜主题共享结构、控件尺寸和状态语义，只切换配色；主题切换不改变工作数据。

## Typography

共用系统 UI 字体栈，保留中文系统字体，不加载展示字体或图标字体。headline 用于页面标题，title 用于普通标题，panel-tab 用于面板墨色标题签。body、label 与 button 保持紧凑信息密度；品牌字标采用 brand 并自然换成两行。

页面标题在宽度 ≤1050px 时为 22px，≤500px 时为 20px；品牌在 ≤1050px 时为 16px，≤850px 时隐藏文字。导航为 13px、常态 600／选中 650 字重；列表元信息与标签为 11px，说明行高 1.6。统计和倒计时使用等宽数字；倒计时为 44px、500 字重，复习正反面为 22px。

## Layout

应用高 100dvh；左栏默认宽 200px，品牌区高 78px。工作区标题高 88px，主内容两侧留白 28px、底部 24px；面板间距 20px。默认双栏为 `minmax(280px,.85fr) minmax(340px,1.4fr)`。睡猫图像使用完整轮廓：桌面 50px，≤1050px 为 42px，≤850px 为 48px；不裁切角色。

- 宽度 ≤1050px：侧栏 160px，两侧留白 20px，卡片内边距 16px。
- 宽度 ≤850px：保留 72px 图标侧栏；编辑与记录改为单栏互斥面板，保留名称和提示。卡片库按牌组／编辑器切换。
- 宽度 ≤500px：两侧留白 12px，卡片内边距 14px，隐藏副标题；表单与页签允许换行，部分被动标签隐藏。
- 高度 ≤800px：标题高 76px，面板内边距 18px、间距 16px；后续宽度规则覆盖相应属性，≤500px 标题恢复 88px。
- 高度 ≤650px：应用最小操作高度 650px，允许正文滚动，保全控件可达性。

任务、想法、目标、日记、消费、饮食、钱包分类、牌组与卡片列表按可用高度和最大行高分页，至少一条；增删和尺寸变化会约束页码。正常视口不使用长页面滚动。详情、账户面板、复习卡和长卡片内容允许局部滚动；完整文本通过详情入口读取，分页不能造成内容丢失。

## Elevation & Depth

不使用投影。实色纸面、2px 墨线、标题签反色与网点间隙建立印刷层次。背景网点为 `radial-gradient(var(--dot) .7px,transparent .8px)`，以 5px 网格重复。账户与卡片遮罩使用 overlay，层级 20；toast 层级 50，以正文色为底、画布色为字。主题切换不使用全屏渐变动画。

## Shapes

主面板和大多数控件采用 3px 小圆角，面板、侧栏右边及弹层使用 2px 墨线；弹层圆角为 5px。输入、下拉、文本域使用 1px 辅助文字色边框；复选按钮为 1.5px。实色标题签保持直角。少量辅助图标按钮保留 6px、账户状态保留 8px、头像预览保留 10px；用户头像仍为圆形，进度轨道使用 4px 圆角。

## Components

### Buttons

主按钮使用 accent／on-accent，次按钮使用 card／txt 和 line 边框。常规最小高度 40px，小按钮 34px；≤1050px 常规水平内边距为 11px。按钮悬停亮度 .94，次按钮同时加深到 ink 边框；禁用透明度 .48。颜色过渡 .15s。可见键盘焦点为 2px accent 外框、3px 偏移；减少动态效果时关闭动画和过渡。

### Inputs / Fields

输入框沿用纸面，辅助文字色边框保证日夜可见；占位文字使用 sub，焦点外框偏移 1px。标签与控件关联，文本域行高 1.6、禁止拖拽改尺寸。复选框和单选框保留原生语义。

### Navigation

选中项为 accent 底、on-accent 字与墨线边框，使用 `aria-current="page"`。未选中悬停使用 card2。窄屏仅隐藏视觉文字，保留可访问名称与标题。工作区页签和紧凑模式切换采用 ink／bg 反色，并同步 `aria-pressed`。

### Chips / Choices

被动标签为 card2／sub，内边距 3px 7px；能量与心情选项为 card2／txt，选中后切换 selected 颜色组。类别选择允许换行；选择状态同步 `aria-checked` 或 `aria-pressed`。

### Cards / Containers

面板是实色纸页与墨线框，默认内边距 22px、垂直弹性排列，列表占剩余高度。直接面板标题以墨色签呈现。列表行通过分隔线区分，避免重复套卡片。复习卡使用 card2、28px 内边距，安全居中与局部滚动容纳长文字。

### Theme / Identity

右上角主题按钮为 40px 方形月亮图标控件，与账户、语言按钮并列；夜间状态使用 selected 颜色与 `aria-pressed="true"`。theme.js 在样式表之前运行：优先读取 `powvy-habit-theme`，否则跟随系统；系统变化仅在尚未手动选择时生效。用户选择被记住，存储失败时仍切换并提示无法保存。

品牌使用现有睡猫资产和 Powvy Habit 字标；猫是 Power 灵感的原创熟睡小角猫，不替换为字体图标。品牌变化不改变底层兼容标识。

### Pagination / Dialogs

分页条显示当前范围与总数，边界按钮禁用，状态通过礼貌播报区域宣布。详情使用原生 dialog，最大宽度 620px、最大高度为视口减 48px，正文最高 65dvh 并可滚动；关联标题，提供关闭按钮，保留长文本换行。

## Do's and Don'ts

### Do:

- Do 使用当前主题的语义变量，保持日夜两套状态一致。
- Do 保留睡猫品牌、左侧栏、墨线框和网点留白。
- Do 根据可用高度分页，并保留完整文本、键盘焦点和局部滚动。
- Do 保留低高度滚动例外、中英文标签及可访问名称。

### Don't:

- Don't 恢复纯白画布、蓝色主强调或旧的干净 SaaS 视觉。
- Don't 把网点铺进表单文字与长内容，或用大插画挤占工作空间。
- Don't 为无滚动外观裁掉必要内容，或将左侧栏改为底部导航。
- Don't 因品牌改名迁移兼容性相关的数据键、协议或应用标识。
- Don't 将 sidecar 的预览色阶当作新增应用令牌。


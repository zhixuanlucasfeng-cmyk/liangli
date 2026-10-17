---
name: Powy
description: 安静、紧凑的个人工作台
colors:
  bg: "#f5f6f8"
  card: "#fff"
  card2: "#f5f7fa"
  txt: "#202632"
  sub: "#606b7c"
  line: "#dfe4ec"
  accent: "#245cd6"
  ok: "#247453"
  warn: "#946000"
  danger: "#bb3545"
  sidebar: "#f0f2f6"
  nav-active: "#e1eaff"
  selected-text: "#184cac"
  selected-bg: "#edf3ff"
  selected-border: "#89aaf0"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif'
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif'
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  tag: "5px"
  action: "6px"
  control: "7px"
  inset: "8px"
  card: "12px"
  overlay: "14px"
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
    textColor: "{colors.card}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  nav-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.selected-text}"
    rounded: "{rounded.inset}"
    padding: "11px 12px"
  tag:
    backgroundColor: "{colors.card2}"
    textColor: "{colors.sub}"
    rounded: "{rounded.tag}"
    padding: "3px 7px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.card}"
    padding: "22px"
  pager-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.txt}"
    rounded: "{rounded.action}"
  review-card:
    backgroundColor: "{colors.card2}"
    textColor: "{colors.txt}"
    rounded: "{rounded.card}"
    padding: "28px"
---

# Design System: Powy

## Overview

**Creative North Star: "安静的个人工作台"**

Powy 使用中性浅色画布、白色工作面板、石墨色文字和克制的蓝色交互状态。界面为日常操作服务：通过左侧导航进入工具，在有限视口中输入、检查和处理数据。

用户已确定干净的侧栏应用方向，保留 Powy 名称，移除漫画、Chainsaw Man 和 Power 角色装饰。系统字体、细边框、适度圆角和紧凑密度延续这一方向。本文件记录已构建的界面，以 `workspace.css`、`workspace.js` 和 `index.html` 为事实来源；不增加新的品牌假设。

**Key Characteristics:**

- 浅色中性底色，蓝色标记操作和选中状态。
- 左侧导航与工作面板构成稳定的操作空间。
- 长列表分页，完整文本按需展开。
- 中英文共用系统字体与组件结构。

## Colors

配色以低饱和中性色构建层次，蓝色负责主要交互；语义色仅表达状态。

### Primary

`accent` 为操作蓝，用于主要按钮、焦点、进度与选择。选中导航使用 `nav-active` 背景和 `selected-text` 文字；较轻的选择面板使用 `selected-bg`，选项描边使用 `selected-border`。

### Neutral

`bg` 是页面画布，`sidebar` 是侧栏底色，`card` 是工作面板，`card2` 是提示和次级内容底色。`txt`、`sub` 和 `line` 分别承载正文、辅助文字和分隔边框。以上前置元数据中的值为规范值。

### Semantic states

`ok` 表示完成和正常状态，`warn` 表示警示，`danger` 表示删除、超额或错误。状态同时使用文字、形状或控件状态说明，不能仅靠颜色区分。

## Typography

全部界面使用前置元数据中的系统字体栈，不加载展示字体或图标字体。中文随系统使用 PingFang SC 或 Microsoft Yahei，英文随平台采用系统 UI 字体。

页面标题使用 headline，面板标题使用 title，正文使用 body，字段和说明使用 label。辅助说明通常使用 1.6 行高；列表元信息可降至 11px。导航为 13px，品牌名称为 21px。页面标题在窄屏调整为 22px，再到 20px。

数字统计采用等宽数字特性 `font-variant-numeric: tabular-nums`；倒计时为 44px、500 字重，钱包与营养统计依容器使用约 19–25px。正文不采用装饰性全大写。提示文案在备份面板中限制为 65ch。

## Layout

应用默认高为 100dvh，左栏宽 200px，左栏顶部品牌区高 78px。工作区标题高 88px，主内容左右内边距 28px、底部 24px；常规面板间距 20px。默认编辑与记录双栏分别为 `minmax(280px,.85fr)` 和 `minmax(340px,1.4fr)`。这是实际实现；早期计划中的 68px 工作区标题高度不作为规范。

今日页面左侧为紧凑负荷条和任务编辑区，右侧为任务列表。钱包提供概览、记一笔、记录、分类和预算五个入口；页签可换行，容纳英文和小屏。输入和预算页面内容最大宽度 720px，独立分类页面最大宽度 800px。

### Responsive behavior

- 宽度 ≤1050px：左栏缩至 160px，工作区左右留白 20px，卡片内边距 16px。
- 宽度 ≤850px：保留 72px 图标侧栏，隐藏导航文字但保留可访问名称和标题；编辑与记录切换为单栏互斥面板。钱包概览隐藏分类面板，分类仍可从专用页签访问；卡片库按牌组与编辑器切换。
- 宽度 ≤500px：工作区左右留白 12px，卡片内边距 14px，隐藏副标题；表单行、钱包页签和卡片头允许换行。钱包汇总改为两列。
- 高度 ≤800px：工作区标题压至 76px，常规卡片内边距 18px、面板间距 16px，部分表单与统计进一步压缩。宽度规则随后覆盖相应属性；≤500px 时工作区标题为 88px。
- 高度 ≤650px：启用正文滚动，应用使用 650px 最小操作高度。这是低高度、缩放及可访问性的明确例外，不得为了“无滚动”裁掉控件。

### Pagination and overflow

任务、想法、目标、日记、消费、饮食、钱包分类、牌组和卡片列表按可用高度与当前最大行高计算每页容量，至少一条；翻页范围会在增删、尺寸变化和切换视图后重新约束。分页条显示当前范围与总条数，边界按钮禁用，范围变化通过礼貌播报状态区域提供。

正常工作区不进行长页面滚动；完整文本可通过详情对话框阅读。账户面板、详情正文、复习卡及卡片列表中的长内容允许局部滚动。分页不等于截断信息，缩略文本必须保留完整内容入口。复习卡使用安全居中，长文本溢出时起始内容仍可访问。

## Elevation & Depth

工作面板不使用阴影。白色与浅灰色面、1px 细边框和留白建立层次。模态界面使用 `#17243e66` 遮罩，账户与卡片弹层层级为 20；反馈 toast 使用深色文字底色和白字，层级为 50。无装饰性浮起、立体或纸张效果。

## Shapes

卡片和详情框使用 card 圆角，输入与主要按钮使用 control 圆角，内部提示与导航使用 inset 圆角，弹层使用 overlay 圆角。标签和翻页控件采用更小的圆角。默认描边为 1px，图标采用细线 SVG；头像保留圆形裁切。

## Components

### Buttons

主要按钮为蓝底白字，13px、550 字重；次要按钮为白底、正文色文字和细边框。常规控件最小高度 40px，小按钮最小高度 34px。删除和辅助操作使用紧凑图标按钮。禁用状态透明度 .48，鼠标样式为不可用。

悬停使用 `brightness(.97)`，颜色切换为 .15s。可见键盘焦点使用 2px 蓝色轮廓、3px 外偏移；输入框焦点外偏移为 1px。系统要求减少动态效果时关闭动画与过渡。

### Inputs / Fields

输入、选择与文本域采用白底细灰边框。字段标签显示在控件上方；文本域行高 1.6，禁止手动拖拽改变尺寸。复选框和单选框保留原生平台语义与蓝色强调。缩短可见表单不应丢失标签、验证反馈或完整输入能力。

### Navigation

左侧导航具有线形图标、文字与分组分隔线。当前页面使用浅蓝底、蓝字及 650 字重，并带 `aria-current="page"`。窄屏仅隐藏视觉文字，保留 `aria-label` 与悬停标题；不恢复底部导航。

### Chips / Choices

被动标签使用次级面板底色和辅助文字；窄手机屏隐藏部分紧凑标签。可选择项以浅蓝底和蓝色描边表达选中，并同步 `aria-pressed` 或 `aria-checked`。钱包类别选项允许换行。

### Cards / Containers

默认卡片为白底、细边框、22px 内边距，采用垂直弹性布局，内部列表占据剩余高度。常规列表行以细分隔线区分；不为每条数据再添加一层卡片。

### Dialogs / Review

详情使用原生 `dialog`，最大宽度 620px，最大高度为视口减 48px，正文可在 65dvh 内滚动。对话框具备标题关联和关闭按钮；长文字保留换行并允许任意字符处折行。复习卡背景使用次级面板底色，22px 正反面文字，安全居中和局部滚动兼容长内容。

## Do's and Don'ts

### Do:

- Do 保留中性浅色、细描边、系统字体和左侧导航。
- Do 根据真实可用高度分页，提供完整文本和键盘访问路径。
- Do 在紧凑屏幕切换编辑与记录，允许英文页签自然换行。
- Do 保留低高度页面滚动和长内容局部滚动的可访问性例外。
- Do 将选中状态、焦点和禁用状态同时表达为语义与视觉反馈。

### Don't:

- Don't 重新引入漫画、Chainsaw Man 或 Power 角色装饰。
- Don't 用超大宣传标题、装饰插画或额外卡片层级挤占操作区域。
- Don't 为满足无滚动外观而隐藏必要内容或裁掉操作。
- Don't 将此文件中的预览色阶当作新增应用颜色令牌。


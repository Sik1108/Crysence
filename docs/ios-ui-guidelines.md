# CrySense iOS UI Guidelines

本文件是 CrySense Web MVP 的移动端视觉与交互验收基线。它综合了项目 `apple.md` 规范、iOS HIG 约束和 `design-taste-frontend` 的审美检查方法。

## Design Read

- 用户：在高压力、单手和夜间场景中操作的新手照护者。
- 任务：快速判断是否安全、完成五秒采集、理解结果，并在可控情况下授权环境干预。
- 品牌感受：可信、平静、温和，但安全信息必须直接清楚。
- 视觉方向：接近原生 iOS 的克制层级，不采用缩小网页式 Dashboard，也不依靠装饰性渐变制造层次。
- 页面原则：一屏一个清晰主任务，关键状态紧邻触发它的操作。

Taste skill 调节值：`DESIGN_VARIANCE=4`、`MOTION_INTENSITY=3`、`VISUAL_DENSITY=5`。这意味着布局有适度识别度，动效只服务状态变化，并容纳时间线和洞察所需的信息密度。

## Tokens

所有 token 集中在 `styles.css` 的 `:root`，组件不得随意引入新的魔法数字。

| 类型 | 基线 |
| --- | --- |
| Font stack | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif` |
| Large Title | 34px，一级页面专用 |
| Title 1 | 28px |
| Title 2 | 22px |
| Body | 17px |
| Secondary | 15px |
| Caption | 13px |
| Button | 17px，Semibold |
| Background | `#f5f5f7` |
| Surface | `#ffffff` |
| Primary text | `#1d1d1f` |
| Apple Blue | `#0071e3` |
| Card radius | 20px |
| Control radius | 15px |
| Page gutter | 20px，紧凑屏最小 16px |
| Minimum touch target | 44 × 44px |
| Primary button height | 52px |

## Layout and navigation

- 内容始终考虑 `env(safe-area-inset-*)`，固定 Tab Bar 不遮挡页面末尾内容。
- 一级页面可用 Large Title；录音、结果和设备详情等任务页使用普通导航标题。
- 固定五栏 Tab Bar：`首页 / 时间线 / 设备 / 洞察 / 我的`。哭声检测仍由首页主卡片进入。
- Home 只保留一个高视觉权重主 CTA。智能家居卡片使用白色 surface、细边框和次级文字，不与检测入口竞争。
- 卡片内部先给结论和状态，再给解释或次级操作。避免多层卡片嵌套。

## Interaction

- 所有按钮、Tab、列表行和关闭控件的有效触控区域至少 44px。
- 原生感确认使用 Bottom Sheet；轻量反馈使用 Toast 或 Banner；不得使用浏览器 alert / confirm。
- 权限只在用户触发对应功能后解释并申请。
- 设备执行确认必须列出具体动作；用户取消 Sheet 视为未授权。
- 设备已经处于建议状态时仍展示方案，但标记为“保持即可”，不发送重复命令。
- 设备中心只管理连接、测试和方案参与权限，不提供脱离哭声结果的任意控制。
- 持续任务展示执行中状态，完成和部分失败给出明确文字及后续动作。
- 动画主要使用 opacity 和 transform，遵循 `prefers-reduced-motion`。

## Medical safety presentation

- 医疗安全优先于品牌视觉和转化目标。
- 红色和橙色必须同时出现图标、标题或行动文字，不能只靠颜色表达风险。
- 危险体征、异常哭声、病理风险和低置信度页面隐藏全部智能家居入口。
- 高风险页使用高优先级 Modal 或独立页面，明确下一步，不混入普通安抚建议。

## Visual acceptance checklist

- 393 × 852、375 × 812 和 375 × 667 视口无横向溢出。
- Launch、Onboarding、Login、Home、Result、Devices 的主标题和主操作首屏可见。
- 最小可见字号不低于 13px，正文为 17px。
- 可点击目标不小于 44px；主按钮保持 50 至 56px。
- Safe Area、底部 Tab Bar、Sheet 和 Toast 不遮挡内容。
- 同屏没有互相竞争的多个主 CTA。
- 键盘导航有可见 focus，关闭图标提供可访问标签。
- 设备 Offline、Unauthorized、部分失败和无授权状态都同时提供文字说明。

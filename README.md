# 稀疏札记 · sparsity.tech

以浏览和阅读为先的个人博客。偏冷纸白、墨色和朱红构成整套视觉；「稀疏」体现在文章之间的留白、标题与正文的节奏，以及从密到疏的点阵标记。

## 本地运行

使用 Node.js 22.13 或更新版本。

```sh
npm ci
npm run dev
```

打开终端打印的 Local 地址。生产构建与校验：

```sh
npm run check
npm test
npm run build
npm run verify
```

## 写一篇札记

在 `content/notes/` 新建 Markdown 文件，例如 `my-first-note.md`：

```md
---
title: 一篇新的札记
description: 用一两句话介绍这篇文章。
date: '2026-09-05'
category: 日常
sample: false
draft: false
---

从这里开始写正文。

## 第一个小节

支持常用 Markdown，包括引用、列表、链接、代码块和表格。
```

文件名即文章地址，例如 `/notes/my-first-note`。日期须为加引号的 `YYYY-MM-DD`。文章自动按日期倒序排列，首页展示最新一篇和完整列表。阅读时长按中文字符数和英文词数估算；二、三级标题自动生成目录，重复标题也有独立锚点。

`draft: true` 的文件不会生成页面或出现在目录中。`sample: true` 会显示示例标记；随项目附带的六篇文字均为原创设计示例，并非站主的真实经历或已发表文章，可以直接删除或替换。没有公开文章时首页显示空状态。

正文中的原始 HTML 会转义；链接支持 HTTPS、HTTP、mailto、以 `/` 或 `./` 开头的本地路径与 `#` 锚点。图片可放在 `public/images/` 并以 `/images/name.webp` 引用，请提供替代文字。

## 站点配置与结构

- `lib/site.ts`：站名、描述、品牌域名和外链。GitHub 已设置为 `https://github.com/cyx2007`；向 `links` 添加记录即可扩展页脚外链。
- `content/notes/`：独立 Markdown 博文。
- `lib/notes.ts`：内容校验、排序和阅读时间。
- `lib/markdown.ts`：Markdown 渲染与目录生成。
- `app/page.tsx`：首页。
- `app/about/page.tsx`：独立关于页，展示站点信息与外链。
- `app/notes/[slug]/page.tsx`：文章页面。
- `app/globals.css`：视觉变量、桌面/移动版式、焦点和打印样式。

技术栈为 TypeScript、React、Vinext（Vite / Next.js 路由 API），通过 `output: 'export'` 生成静态 HTML。文章内容在构建时完成渲染；阅读和目录导航不依赖客户端请求。没有数据库、登录、追踪脚本或运行时外部字体请求。保留了 Sites 初始组件库供后续扩展，未用组件不会进入页面打包。

## 部署与验证

静态输出在 `dist/client/`，可交给支持 `.html` 省略扩展名访问、`index.html` 和 `404.html` 的静态托管服务。Sites 配置在 `.openai/hosting.json`；预览默认仅站点所有者可访问。

品牌文字使用 `sparsity.tech` 不代表已绑定该域名。自定义域名、DNS 和公开访问权限需要单独配置。替换示例博文后再公开；示例文章的元数据设为 `noindex`，真实文章不继承这一限制。

已提供中文语义化结构、键盘跳转正文、可见焦点、原生页内目录、减少动态效果和打印排版。校验脚本检查静态文章是否完整生成、链接与锚点是否对应；浏览器视觉、交互和真实设备验收需另行执行。

初始脚手架的固定依赖版本存在上游审计提示（可运行 `npm audit` 查看）；本项目交付静态文件，不部署这些包的服务端运行时。未来启用服务端功能前应先升级并重新验证相关依赖。

项目采用原生链接做静态页面导航，因此关闭 Next.js 专用的 Link 规则。Lint 检查自有代码，预置且未修改的 `components/ui/` 与 `hooks/use-mobile.ts` 不在检查范围内；类型检查仍覆盖它们。

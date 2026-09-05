# 稀疏札记 · sparsity.tech

以阅读为先的个人博客，带文章管理面板。前台使用宋体与留白，后台使用同一套配色和更紧凑的操作布局。

支持现有 Sites 托管和 **Ubuntu 26.04 自托管** 两种运行方式。Ubuntu 使用 Docker Compose、SQLite、持久化图片目录和独立管理员登录，提供升级前备份、迁移校验、健康检查与失败恢复。完整操作见 [Ubuntu 部署与升级指南](docs/deploy-ubuntu-26.04.md)。

## 文章管理

在浏览器地址栏手动输入网站地址加 `/admin`。Sites 使用站点所有者的 ChatGPT 账号登录；Ubuntu 使用部署时生成的管理员账号登录。

- 文章列表支持搜索，以及已发布、草稿、归档筛选。
- 编辑器使用开源 [Tiptap](https://tiptap.dev/docs/editor)，管理控件复用项目内的 shadcn / Base UI。
- 支持文章标题、段落、二三级标题、粗体、斜体、列表、引用、代码块、链接和图片；可预览正文。
- 图片支持上传及从剪贴板粘贴，格式为 JPG、PNG、WebP、GIF，单张最多 5 MB。选中图片可以修改替代文字。
- 保存草稿后可跨设备继续编辑。点击「发布文章」立即同步到首页和阅读页；已发布文章再次保存也会同步。
- 文章可撤回为草稿、归档、从归档恢复。归档保留原文，不执行永久删除。
- `⌘S` / `Ctrl+S` 保存。未保存离开时会提示；多处同时编辑时，旧版本不能覆盖新版本。
- 新建文章可设置地址；首次保存后地址固定，保留已有 `/notes/…` 链接。

站名继续使用「稀疏札记」，内容入口统一称为「文章」。GitHub 等外链放在关于页，管理面板通过 `/admin` 直接访问。

## 内容与存储

Sites 模式下，文章存储在 Sites 管理的 D1，图片存储在 R2。Ubuntu 模式下，文章与图片存入应用镜像之外的持久化目录。浏览器存储不是内容数据源，不需要为发布文章重新部署网站。

随项目附带的六篇文章是设计示例，首次运行会导入数据库一次，保留「示例」标记。此后以数据库为准，重新部署不会覆盖后台修改或恢复已归档文章。`content/notes/` 只保留初始种子内容，不再作为已运行站点的日常编辑入口。

正文使用经过服务端清理的 HTML 存储。HTML 标签、属性和链接协议使用允许列表，图片检查文件签名与体积。正文二、三级标题自动生成目录，阅读时长按文字量估算。

数据库结构位于 `db/schema.ts`，SQL 查询使用 D1 参数绑定。Drizzle 迁移位于 `drizzle/`，发布时由 Sites 执行；已应用迁移不应修改。内容初始化与数据库结构迁移分开。

## 访问控制

Sites 站点当前保持 private。管理页与每一个管理 API 都在服务端检查 Sites 提供的身份，写请求同时检查请求来源。Ubuntu 默认也保持 private，使用签名会话校验独立管理员身份，并忽略外部 Sites 身份请求头；可显式配置 `SITE_ACCESS=public` 开放前台阅读。后台权限不依赖隐藏按钮或前端判断。

Sites 模式首次管理员登录时，服务端以 `SITE_OWNER_EMAIL` 匹配 Sites 验证过的站点所有者邮箱，并把该账号在此站点的稳定用户 ID 固定存入 `settings.admin_user_id`。之后只接受这个 ID。生产邮箱通过 Sites 运行时配置注入，不写入源码。更换管理员需要明确修改这项绑定。

私有站点的外层登录与授权由 Sites 提供。即使日后调整站点访问范围，管理 API 和未发布图片仍有独立的权限检查。不要把本地模拟登录或测试请求头作为自建服务器的生产认证方式。

## 本地开发

使用 Node.js 22.13 或更新版本：

```sh
npm ci
npm run db:migrate
npm run dev
```

打开终端打印的 Local 地址。`/admin` 会使用 Sites 开发插件的本地模拟账号登录；开发身份仅在本地预览生效。`.env.example` 是本地邮箱设置示例，生产邮箱需在 Sites 配置。

```sh
npm run check
npm run lint
npm test
npm run build
npm run verify
```

开发服务运行时，可执行 `node scripts/verify-runtime.mjs` 验证完整的文章和图片流程。可用 `SITE_TEST_ORIGIN` 指定本地地址；脚本拒绝连接生产域名，会建立并最终归档带 `cms-check-` 前缀的本地校验文章。

修改数据库结构后：

```sh
npm run db:generate
npm run db:migrate
```

`wrangler.local.jsonc` 只用于本地迁移，真实资源由 `.openai/hosting.json` 中的逻辑绑定交给 Sites 管理，不运行手动远程 D1 命令。

## 架构与部署

- `app/page.tsx`、`app/notes/[slug]/page.tsx`：从数据库读取已发布文章并进行服务端渲染。
- `app/about/page.tsx`：关于页及 GitHub 外链。
- `app/admin/`、`components/admin/`：文章列表、Tiptap 编辑器和管理界面。
- `app/api/admin/`、`app/media/`：文章与图片接口。
- `lib/articles.ts`：内容初始化、查询、保存及并发版本检查。
- `lib/admin-auth.ts`：管理员身份绑定及请求来源验证。
- `lib/article-content.ts`：输入校验、安全清理和阅读目录。
- `lib/site.ts`：站名、描述、域名与外链。

技术栈为 TypeScript、React、Vinext，保留原有 npm 锁文件与 Sites 工程结构。`npm run build` 生成 Cloudflare Worker，数据库迁移和资源配置由 Sites 插件打包。`npm run build:node` 生成独立 Node 服务，通过 `npm run start:node` 启动（先配置环境并运行 `npm run db:migrate:node`）。构建时选择运行适配器，不混入另一平台的运行依赖。两种方式都不能仅部署 `dist/client`，也不能混用彼此的 `dist` 产物。

中文字体使用本地托管的 Noto Serif SC，日期与代码使用 IBM Plex Mono。中文字体按字符范围分块加载，许可证保留在 `public/fonts/`。编辑器与管理界面单独打包，阅读页无需下载编辑器。

品牌文字 `sparsity.tech` 不代表已绑定自定义域名，实际地址以 Sites 发布结果为准。生产访问权限由 Sites 管理，本次发布保持 private。

内容安全测试和本地 HTTP 流程验证覆盖草稿、发布、图片、归档、权限、CSRF 和修改冲突；未执行浏览器交互或真实设备视觉验收。脚手架依赖仍存在上游审计提示，可运行 `npm audit` 查看；不要将本地开发服务直接暴露为生产服务。项目未使用 Server Actions。

项目采用原生链接导航，关闭 Next.js 专用 Link 规则。Lint 检查自有代码；预置且未修改的 `components/ui/` 和 `hooks/use-mobile.ts` 不在 Lint 范围内，类型检查仍覆盖它们。

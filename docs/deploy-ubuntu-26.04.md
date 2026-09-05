# Ubuntu 26.04 部署与升级

项目现在有两个独立的构建目标：`npm run build` 用于现有 Sites，`npm run build:node` 用于 Ubuntu 自托管。页面、编辑器和文章 API 共用代码。自托管运行于 Docker Compose，使用 SQLite、磁盘图片存储和独立管理员账号，不需要连接 Sites、D1 或 R2。

默认保持 **private**：所有读者需要管理员登录。要公开文章，在服务器配置中明确设置 `SITE_ACCESS=public` 后发布新版本；后台和草稿图片仍受认证保护。

## 1. 运行与数据布局

推荐单台 Ubuntu 26.04 LTS、amd64 或 arm64、至少 2 GB 内存；本机构建建议 4 GB 内存及足够的镜像/备份空间。小型服务器也可以从同架构 CI 加载镜像后按同一 Compose 配置运行。本方案只运行一个应用实例，SQLite 放在本机磁盘，不使用 NFS，不横向扩容。

```text
Internet → Caddy :80/:443 → app:3000
                              ├─ /data/sparsity.sqlite
                              └─ /data/media/

/opt/sparsity/
  config.env                 下次发布使用的配置，root:root 0600
  current → releases/<id>    当前版本
  previous                   上一个成功版本
  releases/<id>/             固定镜像 ID、Compose、代理配置、该版本的 runtime.env
  data/                      SQLite（包括 WAL）及图片，uid/gid 1000
  backups/<timestamp>/       一致性快照、校验和、关联版本及配置
  caddy-data/                 TLS 证书及续期状态
  caddy-config/               Caddy 状态
```

应用容器以非 root 用户运行，根文件系统只读；只允许持久化目录和临时目录写入。3000 端口不映射到宿主机。Caddy 自动申请并续期 HTTPS 证书。已有 Nginx/Caddy 占用 80/443 时，应先规划入口整合；本配置不能与占用相同端口的服务同时启动。

基础 Node 镜像固定到 **22.23.1 + SHA256 digest**，Caddy 同样固定版本与 digest，npm 使用锁文件安装。生产不安装宿主机 Node，也不执行开发服务器。

## 2. 准备 Ubuntu

按 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/) 安装 Docker Engine 和 Compose 插件。该文档列出了 Ubuntu 26.04 LTS；已有 Docker 的机器先检查版本与包来源，不重复卸载服务。

全新服务器可执行：

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

将自己的域名 A/AAAA 记录指向服务器，放行 TCP 80/443（HTTP/3 可选 UDP 443）。保留 SSH 访问规则。Docker 的已发布端口与 UFW 存在特殊交互，入口限制应同时检查云安全组及 Docker 防火墙规则，参见同一份官方文档。

## 3. 首次部署

把这个仓库放到服务器目录并进入仓库。以下命令只操作 `/opt/sparsity`，代码目录可以另放在 `/srv/sparsity-src`。

```sh
sudo install -d -m 0700 /opt/sparsity
sudo docker build -t sparsity:bootstrap .
sudo sh -c 'umask 077; docker run --rm sparsity:bootstrap node scripts/credentials.mjs > /opt/sparsity/config.env'
sudoedit /opt/sparsity/config.env
```

生成命令会在终端显示一次随机管理员密码，请存入密码管理器。密码明文不会写入配置文件；文件只包含 scrypt 密码摘要和随机会话密钥。将占位域名改为自己的真实地址：

```dotenv
SITE_ORIGIN=https://notes.example.com
SITE_ACCESS=private
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=scrypt:...由命令生成...
SESSION_SECRET=...由命令生成...
```

`SITE_ORIGIN` 必须是没有路径的 HTTPS origin；只有本地回环测试地址允许 HTTP。不要把本地 `.env` 或 Sites 身份请求头当作生产账号配置。服务器与本地时钟应正常同步。

```sh
# 版本 ID 自定，必须唯一；推荐版本号加 Git 提交短哈希。
sudo bash deploy/manage.sh deploy v0.1.0-abcdef1
sudo bash deploy/manage.sh status
curl --fail https://notes.example.com/auth/login
```

访问 `https://notes.example.com/admin` 登录管理文章。默认 private 时，首页也先进入登录页。发布过程会检查真实首页、关于页、后台、文章 API 和静态资源；最后的域名/证书检查需要在 DNS 指向这台服务器后执行。`/healthz` 只供容器内部检查，公网访问返回 404。

首次空数据库会导入现有六篇示例。**这不会自动搬运现有 Sites 站点的数据**。如果那里已有真实文章或图片，应先通过其受支持的导出方式取得完整备份，在隔离环境完成转换和核对后再切换域名；`.wrangler` 是本地开发数据，不代表线上备份。现有 `.openai/hosting.json` 及 Sites 资源保持原样。

## 4. 日常升级

在代码仓库取回准备发布的提交或 tag，完成变更审查后使用新的版本 ID：

```sh
git fetch --tags origin
git checkout <已审查的提交或tag>
sudo bash deploy/manage.sh deploy v0.2.0-1234567
```

脚本持有文件锁，禁止部署、回滚和备份并发运行。操作顺序为：

1. 旧服务运行期间构建和检查新镜像，复制该版本的配置，验证登录参数和 Caddy 配置。
2. 停止公网代理，再优雅停止应用。此时进入短暂停机；不是零停机升级。
3. 备份完整 SQLite/WAL 与图片，并生成 SHA256 校验和。
4. 在新镜像内按顺序、在事务中应用尚未执行的数据库迁移。
5. 启动新应用，等待容器健康检查，再执行真实 HTTP 冒烟检查。
6. 切换 `current`，恢复公网代理，记录上一个版本。

迁移或健康检查失败时，公网入口保持关闭；脚本恢复本次升级前的数据快照并启动旧版本。失败产生的数据另存到备份目录的 `displaced-*` 下，便于诊断。第一次部署失败则恢复空数据目录并保持服务停止。

不要绕过脚本直接对生产运行 `docker compose up`，否则不会获得停机备份与失败恢复。不要自动执行 `docker system prune -a`、删除历史镜像或清空数据卷；历史版本的镜像是回滚所必需的。

## 5. 普通回滚与数据库恢复

没有数据库结构变化时，回滚镜像并保留期间新增/修改的全部内容：

```sh
sudo bash deploy/manage.sh rollback
# 或选择任一仍保留且结构兼容的版本
sudo bash deploy/manage.sh rollback v0.1.0-abcdef1
```

旧版本的迁移记录必须与当前数据库完全一致，否则普通回滚在停机前拒绝执行。不要通过修改已执行 SQL 或删除迁移记录强行降级。

如果必须退回结构不同的版本，检查对应升级前快照的时间、关联版本和业务数据。下面的显式恢复会把内容退回备份时刻；备份之后的编辑不在恢复结果里：

```sh
sudo cat /opt/sparsity/backups/<时间目录>/release
sudo bash deploy/manage.sh restore /opt/sparsity/backups/<时间目录> --confirm-data-loss
```

恢复前还会保存当前数据；新旧数据均不会被自动删除。恢复使用该备份关联版本的镜像和登录配置。仅在确认恢复范围后运行这一命令。

## 6. 备份与故障恢复

```sh
sudo bash deploy/manage.sh backup
sudo bash deploy/manage.sh logs
```

备份会短暂停止访问，让数据库和图片处于同一时点。不要只复制正在使用的 `.sqlite` 文件；WAL 模式下已提交数据可能还在 WAL 文件中。备份包含私有文章、图片及登录配置，应保存在受保护的离机存储，并根据自己的恢复目标定期执行及演练。

整机故障恢复需要同时保留：数据快照、对应 `releases/<id>`（含 runtime.env）、该版本 Docker 镜像、`config.env`、Caddy 证书目录。可以使用 `docker image save sparsity:<id>` 离机保存镜像。不要只保留 Git 仓库。

空白替换服务器的恢复顺序：安装 Docker；恢复 `/opt/sparsity` 的版本目录/配置/证书；`docker image load` 加载原镜像；校验并把选定快照的 `data.tar` 解包到 `/opt/sparsity/data`，确保目录及原文件 uid/gid 为 1000；然后执行 `sudo bash deploy/manage.sh rollback <备份关联版本>`。脚本会验证结构并启用该版本。恢复后通过真实域名检查登录、文章和图片。

如果机器断电或脚本被 `kill -9`，shell 无法执行自动恢复。此时先查看 `current`、备份的 `release`、容器状态与日志，判断迁移是否完成；停止入口，使用最后确认可用的快照恢复。不要在状态不明时反复启动不同版本。

`SPARSITY_ROOT` 可以在执行时改为其他绝对路径，例如 `sudo env SPARSITY_ROOT=/srv/sparsity bash deploy/manage.sh status`；部署后每次都使用同一个路径。不要复用同一个 Compose 项目名在单台主机上部署多个副本。

## 7. 后续代码和依赖升级约定

- 数据结构先修改 `db/schema.ts`，再运行 `npm run db:generate`。提交新增 SQL 和 journal；已执行的迁移文件不可修改、删除或重排。迁移账本会检查文件 SHA256 和顺序。
- 优先增加字段/表，先兼容旧数据，后在单独版本清理旧字段。需要破坏性迁移时写明停机与数据恢复范围，并对生产备份副本演练。迁移文件不应自行包含 BEGIN/COMMIT 等事务控制语句。
- `content/notes` 只用于一次初始化。升级不会重复导入、覆盖后台文章或重置管理员绑定。
- 保留 `package-lock.json`。依赖变更通过显式 `npm install <包>@<版本>` 更新锁文件，审查后重新构建，不在运行中的容器里执行安装或升级。
- 更新 Node 时同时修改 `Dockerfile` 的版本与 digest、`.nvmrc` 和 CI 的 Node 版本。Caddy 在 `deploy/compose.yaml` 中更新，先验证配置与 HTTPS 行为。保留旧镜像以便回退。
- 登录会话有效期为 12 小时，使用 HttpOnly/SameSite cookie。每个进程五分钟允许 10 次登录尝试。更新密码摘要、用户名或会话密钥会使已有会话失效；更改 `config.env` 后发布一个新版本才生效。历史回滚会恢复该历史版本的登录配置，若旧凭证已泄露，应先用新凭证配置构建兼容版本，而不要直接回滚旧配置。
- 自托管前后端不信任外部 `oai-*` 请求头；不要添加反向代理绕过这层认证。
- 现有 Vinext 是固定版本的 beta，Node 的 `node:sqlite` 在此版本仍有实验性标记，因此每次运行时/框架升级都需重跑部署验证；不承诺任意未来版本直接兼容。[Vinext 官方仓库](https://github.com/cloudflare/vinext)、[Node SQLite 文档](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)。

## 8. 验证命令

```sh
npm ci
npm run check
npm run lint
npm test
npm run test:node
npm run build:node
npm run verify:node
npm run test:deploy

# 验证原来的 Sites 构建；两种构建共享 dist，最后一次构建决定其内容。
npm run build
npm run verify

# 构建生产镜像，并在 Ubuntu 26.04 用户空间运行集成验证。
docker build --target ubuntu-test -t sparsity:ubuntu-test .
docker build -t sparsity:release .
npm run test:compose
```

`test:deploy` 只在本机回环地址和临时数据目录中创建测试文章/图片，验证登录、权限、CSRF、发布、归档、冲突、重启、迁移与恢复。Linux root 环境下的部署脚本测试使用模拟 Docker 驱动注入迁移/健康检查故障，真实执行停机流程中的文件备份与恢复；不会控制测试机的其他容器。

`test:compose` 使用独立 Compose 项目和临时目录，验证实际生产容器的只读文件系统、非 root 写入、Caddy 代理、内容操作与容器重建后的持久化。入口只监听回环地址；测试结束后清理自己的容器和临时数据，不申请真实证书。

`.github/workflows/deployment.yml` 分别检查 Sites 和 Ubuntu 构建。Ubuntu 检查阶段使用真实 `ubuntu:26.04` 容器用户空间；GitHub runner 的宿主系统是 Ubuntu 24.04。这验证应用和运行时兼容性，不等同于在你的生产主机验证内核、DNS、证书签发、磁盘与网络配置。

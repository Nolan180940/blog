# Echoes — Nolan 的个人博客

> 一个纸墨质感的个人博客，记录哲学思考、技术探索与生活碎片。

**在线地址：** https://nolan180940.github.io/blog/

---

## ✨ 功能特性

- **Markdown 写作** — 支持 GFM 语法（表格、任务列表、代码块、引用等）
- **LaTeX 公式** — 集成 KaTeX，行内 `$E=mc^2$` 与块级 `$$\int_0^1 x^2\,dx$$` 均可渲染
- **独立详情页** — 列表只显示标题与摘要，点击进入 `#/post/:id` 详情页
- **发布热力图** — 侧边栏 GitHub 风格贡献图，按日期展示发布频率
- **giscus 评论** — 每篇文章独立评论区，GitHub 账号即可参与讨论
- **安全认证** — bcrypt 加盐哈希 + HttpOnly Cookie + CSRF 防护
- **响应式布局** — 桌面双栏 / 移动端单栏自适应

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | 原生 HTML / CSS / JS（单文件，无框架） |
| 后端 | Supabase（PostgreSQL + Edge Functions） |
| 认证 | bcryptjs + HMAC 签名 Session + CSRF Token |
| 评论 | giscus（GitHub Discussions） |
| 公式 | KaTeX + auto-render |
| Markdown | markdown-it |

## 📁 项目结构

```
├── index.html                          # 前端单文件（全部逻辑）
├── supabase/
│   ├── functions/posts/index.ts        # Edge Function（认证 + 文章 CRUD）
│   └── migrations/001_add_content_md.sql  # 数据库迁移
└── tools/
    ├── hash_password.mjs               # 生成 bcrypt 密码哈希
    └── migrate_content.mjs             # 旧 HTML 文章 → Markdown 迁移
```

## 🚀 本地开发

```bash
# 启动本地服务器（无需构建）
python -m http.server 3000
# 或
npx serve . -l 3000
```

打开 http://localhost:3000 即可。

## 🔧 部署与维护

### 数据库迁移

在 [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor 运行 `supabase/migrations/001_add_content_md.sql`。

### 部署 Edge Function

```bash
supabase login
supabase link --project-ref <你的项目ref>
supabase functions deploy posts
supabase secrets set SESSION_SECRET=<随机字符串>
```

### 修改管理员密码

```bash
cd tools && npm install bcryptjs
node hash_password.mjs <新密码>   # 要求 ≥8 位，含大小写字母和数字
```

将输出的 `UPDATE admin_config ...` 语句在 SQL Editor 中执行。

### 评论配置（giscus）

1. 仓库开启 GitHub Discussions
2. 在 [giscus.app](https://giscus.app) 生成配置
3. 将 `index.html` 中 `GISCUS_CFG` 的 `repoId` / `categoryId` 替换为真实值

> ⚠️ 注意：博客使用 hash 路由，giscus 必须使用 `specific` mapping + 每篇文章唯一 term（`post-<id>`），否则所有文章会共用同一个 discussion。

## 🔐 安全说明

- `posts` 表 RLS：匿名只读，写操作仅通过 Edge Function（service role）
- `admin_config` 表：RLS 完全封锁，密码哈希不对外暴露
- Session Cookie：`HttpOnly` + `Secure` + `SameSite=None`（跨站必需）
- 所有写操作需携带 `X-CSRF-Token`

## 📜 更新日志

- **v2.0 (2026-08-29)** — 全面重构：Markdown + KaTeX、独立详情页、热力图、giscus 评论、安全认证
- **v1.x** — 原始版本：Quill 富文本 + Supabase 直连

---

*Echoes — 有时，我觉得世界是更高维度的。*
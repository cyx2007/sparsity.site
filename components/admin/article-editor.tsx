'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Quote,
  Redo2,
  Undo2,
  Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cleanArticleHtml } from '@/lib/article-content';
import { MAX_IMAGE_BYTES } from '@/lib/image-files';
import {
  statusLabels,
  type Article,
  type ArticleStatus,
} from '@/lib/article-types';

type Props = {
  initialArticle: Article | null;
  initialSlug: string;
  initialDate: string;
};

export function ArticleEditor({
  initialArticle,
  initialSlug,
  initialDate,
}: Props) {
  const [article, setArticle] = useState(initialArticle);
  const [form, setForm] = useState({
    title: initialArticle?.title ?? '',
    slug: initialSlug,
    date: initialDate,
    category: initialArticle?.category ?? '随笔',
    description: initialArticle?.description ?? '',
    html: initialArticle?.html ?? '<p></p>',
    sample: initialArticle?.sample ?? false,
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState('edit');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingNavigation = useRef('/admin');
  const allowLeave = useRef(false);
  const saveRef = useRef<() => void>(() => {});
  const edit = <K extends keyof typeof form>(
    field: K,
    value: (typeof form)[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage('');
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, defaultProtocol: 'https' },
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: '开始写作…' }),
    ],
    content: initialArticle?.html ?? '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose editor-prose',
        role: 'textbox',
        'aria-label': '文章正文',
        'aria-multiline': 'true',
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((file) =>
          file.type.startsWith('image/'),
        );
        if (!file) return false;
        void uploadImage(file);
        return true;
      },
    },
    onUpdate: ({ editor }) => edit('html', editor.getHTML()),
  });
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      h2: editor?.isActive('heading', { level: 2 }),
      h3: editor?.isActive('heading', { level: 3 }),
      bulletList: editor?.isActive('bulletList'),
      orderedList: editor?.isActive('orderedList'),
      quote: editor?.isActive('blockquote'),
      code: editor?.isActive('codeBlock'),
      link: editor?.isActive('link'),
      image: editor?.isActive('image'),
      alt: String(editor?.getAttributes('image').alt ?? ''),
      canUndo: editor?.can().undo(),
      canRedo: editor?.can().redo(),
    }),
  });
  const previewHtml = useMemo(
    () => (view === 'preview' ? cleanArticleHtml(form.html) : ''),
    [form.html, view],
  );
  const status = article?.status ?? 'draft';
  const locked = busy || uploading;
  const wordCount = editor?.getText().replace(/\s/g, '').length ?? 0;

  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);
  useEffect(() => {
    if (!dirty && !uploading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowLeave.current) event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hash ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      event.preventDefault();
      pendingNavigation.current = anchor.href;
      setLeaveOpen(true);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate);
    };
  }, [dirty, uploading]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function save(nextStatus: ArticleStatus) {
    if (locked || !editor) return;
    if (!form.title.trim()) {
      setError('请填写文章标题。');
      document.getElementById('article-title')?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        article ? `/api/admin/articles/${article.id}` : '/api/admin/articles',
        {
          method: article ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'sparsity-admin',
          },
          body: JSON.stringify({
            ...form,
            html: editor.getHTML(),
            status: nextStatus,
            revision: article?.revision ?? 0,
          }),
        },
      );
      const result = (await response.json()) as {
        article?: Article;
        error?: string;
      };
      if (!response.ok || !result.article)
        throw new Error(result.error || '保存失败，请稍后重试。');
      const saved = result.article;
      setArticle(saved);
      setForm({
        title: saved.title,
        slug: saved.slug,
        date: saved.date,
        category: saved.category,
        description: saved.description,
        html: saved.html,
        sample: saved.sample,
      });
      setDirty(false);
      setArchiveOpen(false);
      setMessage(
        nextStatus === 'published'
          ? '已发布'
          : nextStatus === 'archived'
            ? '已归档'
            : '草稿已保存',
      );
      if (!article)
        window.history.replaceState(null, '', `/admin/articles/${saved.id}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '保存失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    saveRef.current = () => {
      void save(status);
    };
  });

  async function uploadImage(file: File) {
    if (locked || !editor) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError('请选择不超过 5 MB 的图片。');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'X-Requested-With': 'sparsity-admin' },
        body,
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error || '图片上传失败。');
      editor
        .chain()
        .focus()
        .setImage({ src: result.url, alt: file.name.replace(/\.[^.]+$/, '') })
        .run();
      setDirty(true);
      setMessage('图片已插入');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '图片上传失败，请重试。',
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function addLink() {
    if (!editor) return;
    const value = linkUrl.trim();
    if (
      !/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value) ||
      /[\s\\]/.test(value)
    ) {
      setError('请输入有效的链接地址。');
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: value })
      .run();
    setLinkOpen(false);
    setError('');
  }
  const toolbar = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    active = false,
    disabled = false,
  ) => (
    <Button
      key={label}
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={locked || !editor || disabled}
      className={active ? 'tool-active' : undefined}
      onClick={action}
    >
      {icon}
    </Button>
  );

  return (
    <main id="main-content" className="editor-main">
      <div className="editor-commandbar">
        <div className="editor-location">
          <a href="/admin" aria-label="返回文章列表">
            <ArrowLeft size={19} />
          </a>
          <span>{article ? '编辑文章' : '新建文章'}</span>
          <span className={`article-status status-${status}`}>
            <i />
            {statusLabels[status]}
          </span>
        </div>
        <div className="editor-actions">
          <output className="save-indicator">
            {busy
              ? '正在保存…'
              : uploading
                ? '正在上传…'
                : dirty
                  ? '未保存'
                  : message || (article ? '已保存' : '')}
          </output>
          {status === 'published' && (
            <a
              className="editor-live-link"
              href={`/notes/${article!.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="查看文章"
            >
              <ArrowUpRight size={19} />
            </a>
          )}
          <Button
            variant="outline"
            disabled={locked || !editor}
            onClick={() => {
              void save(status);
            }}
          >
            {busy ? <LoaderCircle className="spin" /> : <Check />}保存
            {status === 'draft' ? '草稿' : ''}
          </Button>
          {status !== 'published' && (
            <Button
              className="admin-primary"
              disabled={locked || !editor}
              onClick={() => {
                void save('published');
              }}
            >
              发布文章
              <ArrowUpRight size={16} />
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="editor-error" role="alert">
          {error}
        </div>
      )}
      <div className="editor-layout">
        <section className="editor-workspace" aria-label="文章编辑器">
          <Tabs value={view} onValueChange={(value) => setView(String(value))}>
            <div className="editor-viewbar">
              <TabsList variant="line">
                <TabsTrigger value="edit">编辑</TabsTrigger>
                <TabsTrigger value="preview">预览</TabsTrigger>
              </TabsList>
              <span>{wordCount.toLocaleString('zh-CN')} 字</span>
            </div>
            <TabsContent value="edit" className="editor-tab-panel">
              <Input
                id="article-title"
                className="editor-title"
                aria-label="文章标题"
                placeholder="文章标题"
                value={form.title}
                maxLength={160}
                disabled={locked}
                onChange={(event) => edit('title', event.target.value)}
              />
              <div
                className="editor-toolbar"
                role="toolbar"
                aria-label="正文格式"
              >
                {toolbar(
                  '撤销',
                  <Undo2 />,
                  () => editor?.chain().focus().undo().run(),
                  false,
                  !selection?.canUndo,
                )}
                {toolbar(
                  '重做',
                  <Redo2 />,
                  () => editor?.chain().focus().redo().run(),
                  false,
                  !selection?.canRedo,
                )}
                <span className="toolbar-divider" />
                {toolbar(
                  '二级标题',
                  <Heading2 />,
                  () =>
                    editor?.chain().focus().toggleHeading({ level: 2 }).run(),
                  selection?.h2,
                )}
                {toolbar(
                  '三级标题',
                  <Heading3 />,
                  () =>
                    editor?.chain().focus().toggleHeading({ level: 3 }).run(),
                  selection?.h3,
                )}
                {toolbar(
                  '粗体',
                  <Bold />,
                  () => editor?.chain().focus().toggleBold().run(),
                  selection?.bold,
                )}
                {toolbar(
                  '斜体',
                  <Italic />,
                  () => editor?.chain().focus().toggleItalic().run(),
                  selection?.italic,
                )}
                <span className="toolbar-divider" />
                {toolbar(
                  '无序列表',
                  <List />,
                  () => editor?.chain().focus().toggleBulletList().run(),
                  selection?.bulletList,
                )}
                {toolbar(
                  '有序列表',
                  <ListOrdered />,
                  () => editor?.chain().focus().toggleOrderedList().run(),
                  selection?.orderedList,
                )}
                {toolbar(
                  '引用',
                  <Quote />,
                  () => editor?.chain().focus().toggleBlockquote().run(),
                  selection?.quote,
                )}
                {toolbar(
                  '代码块',
                  <Code />,
                  () => editor?.chain().focus().toggleCodeBlock().run(),
                  selection?.code,
                )}
                <span className="toolbar-divider" />
                {toolbar(
                  '插入链接',
                  <Link2 />,
                  () => {
                    setLinkUrl(
                      String(editor?.getAttributes('link').href ?? 'https://'),
                    );
                    setLinkOpen(true);
                  },
                  selection?.link,
                )}
                {selection?.link &&
                  toolbar('移除链接', <Unlink />, () =>
                    editor?.chain().focus().unsetLink().run(),
                  )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="插入图片"
                  title="插入图片"
                  disabled={locked || !editor}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <ImagePlus />
                  )}
                </Button>
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-label="上传图片"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
              </div>
              {selection?.image && (
                <label htmlFor="image-alt" className="image-alt-field">
                  图片说明
                  <Input
                    id="image-alt"
                    value={selection.alt}
                    onChange={(event) =>
                      editor
                        ?.chain()
                        .updateAttributes('image', { alt: event.target.value })
                        .run()
                    }
                    disabled={locked}
                  />
                </label>
              )}
              {!editor && (
                <output className="editor-loading">正在载入编辑器…</output>
              )}
              <EditorContent editor={editor} />
            </TabsContent>
            <TabsContent value="preview" className="editor-preview">
              <p className="eyebrow accent">{form.category}</p>
              <h1>{form.title || '文章标题'}</h1>
              {form.description && (
                <p className="editor-preview-description">{form.description}</p>
              )}
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </TabsContent>
          </Tabs>
        </section>
        <aside className="editor-settings">
          <h2>文章设置</h2>
          <fieldset disabled={locked}>
            <label htmlFor="article-slug">文章地址</label>
            <Input
              id="article-slug"
              value={form.slug}
              readOnly={Boolean(article)}
              onChange={(event) => edit('slug', event.target.value)}
              maxLength={90}
              spellCheck={false}
            />
            <p className="field-hint">/notes/{form.slug || '…'}</p>
            <label htmlFor="article-date">日期</label>
            <Input
              id="article-date"
              type="date"
              value={form.date}
              onChange={(event) => edit('date', event.target.value)}
            />
            <label htmlFor="article-category">分类</label>
            <Input
              id="article-category"
              value={form.category}
              maxLength={40}
              onChange={(event) => edit('category', event.target.value)}
            />
            <label htmlFor="article-description">摘要</label>
            <Textarea
              id="article-description"
              value={form.description}
              maxLength={300}
              placeholder="留空时从正文提取"
              onChange={(event) => edit('description', event.target.value)}
            />
            {initialArticle?.sample && (
              <label htmlFor="article-sample" className="sample-checkbox">
                <Checkbox
                  id="article-sample"
                  checked={form.sample}
                  onCheckedChange={(value) => edit('sample', Boolean(value))}
                />
                标记为示例文章
              </label>
            )}
          </fieldset>
          <div className="editor-state-actions">
            {status === 'published' && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  void save('draft');
                }}
              >
                撤回为草稿
              </Button>
            )}
            {status === 'archived' && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  void save('draft');
                }}
              >
                恢复为草稿
              </Button>
            )}
            {article && status !== 'archived' && (
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => setArchiveOpen(true)}
              >
                <Archive size={16} />
                归档文章
              </Button>
            )}
          </div>
        </aside>
      </div>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>插入链接</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addLink();
            }}
          >
            <Input
              aria-label="链接地址"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
            />
            <Button type="submit" className="admin-primary">
              插入链接
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>归档这篇文章？</AlertDialogTitle>
            <AlertDialogDescription>
              文章会从网站隐藏，可在归档列表中恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                void save('archived');
              }}
            >
              归档
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>离开编辑器？</AlertDialogTitle>
            <AlertDialogDescription>当前修改尚未保存。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                allowLeave.current = true;
                setDirty(false);
                window.location.assign(pendingNavigation.current);
              }}
            >
              放弃修改并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/**
 * @file 联系我们页面
 * @description 提供联系方式、反馈表单和常见问题入口
 * @route /contact
 */
import { useState } from 'react';
import { Mail, MessageSquare, Github } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

const contactLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 16,
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--border-soft)',
  background: 'var(--bg-subtle)',
  textDecoration: 'none',
  color: 'var(--text-body)',
};

function ContactLinks({ onGithubClick }: { onGithubClick: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
      <a href="mailto:support@example.com" style={contactLinkStyle}>
        <Mail className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>邮件支持</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>support@example.com</div>
        </div>
      </a>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onGithubClick();
        }}
        style={contactLinkStyle}
      >
        <Github className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>GitHub Issues</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>提交 Bug 或功能请求</div>
        </div>
      </a>
    </div>
  );
}

function FeedbackForm({
  name,
  email,
  message,
  onNameChange,
  onEmailChange,
  onMessageChange,
  onSubmit,
}: {
  name: string;
  email: string;
  message: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div
        style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <MessageSquare className="w-4 h-4" />
        发送反馈
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="您的姓名"
          className="param-input"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="您的邮箱"
          className="param-input"
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="请描述您的反馈或问题..."
        className="param-input"
        style={{ width: '100%', minHeight: 120, resize: 'vertical', marginBottom: 16 }}
      />
      <button
        type="submit"
        className="main-action-btn"
        style={{ width: 'auto', padding: '0 24px' }}
      >
        <Mail className="w-4 h-4" />
        发送反馈
      </button>
    </form>
  );
}

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const addToast = useToastStore((s) => s.addToast);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      addToast('warning', '请填写所有字段');
      return;
    }
    const subject = encodeURIComponent(`[反馈] ${name} - ${message.slice(0, 30)}...`);
    const body = encodeURIComponent(`姓名: ${name}\n邮箱: ${email}\n\n${message}`);
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
    addToast('success', '正在打开邮件客户端...');
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">联系我们</h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 24, maxWidth: 720 }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          我们欢迎您的反馈、建议和问题报告。请通过以下方式与我们联系。
        </p>
        <ContactLinks onGithubClick={() => addToast('warning', 'GitHub 仓库链接待配置')} />
        <FeedbackForm
          name={name}
          email={email}
          message={message}
          onNameChange={setName}
          onEmailChange={setEmail}
          onMessageChange={setMessage}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

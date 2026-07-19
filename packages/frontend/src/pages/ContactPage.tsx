/**
 * @file 联系我们页面
 * @description 提供联系方式、反馈表单和常见问题入口
 * @route /contact
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
      <a href="mailto:support@example.com" style={contactLinkStyle}>
        <Mail className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('contact.emailSupportTitle')}</div>
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('contact.githubIssuesTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('contact.githubIssuesDesc')}
          </div>
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
  const { t } = useTranslation();
  return (
    <form onSubmit={onSubmit}>
      <div
        style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <MessageSquare className="w-4 h-4" />
        {t('contact.feedbackTitle')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('contact.namePlaceholder')}
          className="param-input"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder={t('contact.emailPlaceholder')}
          className="param-input"
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder={t('contact.messagePlaceholder')}
        className="param-input"
        style={{ width: '100%', minHeight: 120, resize: 'vertical', marginBottom: 16 }}
      />
      <button
        type="submit"
        className="main-action-btn"
        style={{ width: 'auto', padding: '0 24px' }}
      >
        <Mail className="w-4 h-4" />
        {t('contact.submit')}
      </button>
    </form>
  );
}

export default function ContactPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const addToast = useToastStore((s) => s.addToast);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      addToast('warning', t('contact.fillAllFields'));
      return;
    }
    const subject = encodeURIComponent(`[Feedback] ${name} - ${message.slice(0, 30)}...`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
    addToast('success', t('contact.openingMailClient'));
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('contact.title')}</h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 24, maxWidth: 720 }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{t('contact.intro')}</p>
        <ContactLinks onGithubClick={() => addToast('warning', t('contact.githubNotConfigured'))} />
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MessageSquare, Github } from 'lucide-react';
import { Card } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { useToastStore } from '@/store/toastStore';
function ContactLinks({ onGithubClick }: { onGithubClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <a href="mailto:support@example.com" className="flex items-center gap-3 rounded-xl border border-border bg-input-bg p-4 no-underline text-fg-secondary transition-colors hover:border-border-strong">
        <Mail className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.emailSupportTitle')}</div>
          <div className="text-caption text-fg-tertiary">support@example.com</div>
        </div>
      </a>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onGithubClick();
        }}
        className="flex items-center gap-3 rounded-xl border border-border bg-input-bg p-4 no-underline text-fg-secondary transition-colors hover:border-border-strong"
      >
        <Github className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.githubIssuesTitle')}</div>
          <div className="text-caption text-fg-tertiary">{t('contact.githubIssuesDesc')}</div>
        </div>
      </a>
    </div>
  );
}
function FeedbackForm({ name, email, message, onNameChange, onEmailChange, onMessageChange, onSubmit }: { name: string; email: string; message: string; onNameChange: (v: string) => void; onEmailChange: (v: string) => void; onMessageChange: (v: string) => void; onSubmit: (e: React.FormEvent) => void }) {
  const { t } = useTranslation();
  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2 text-body font-semibold text-fg">
        <MessageSquare className="size-4" />
        {t('contact.feedbackTitle')}
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="contact-name">{t('contact.namePlaceholder')}</FieldLabel>
          <Input id="contact-name" type="text" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={t('contact.namePlaceholder')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-email">{t('contact.emailPlaceholder')}</FieldLabel>
          <Input id="contact-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder={t('contact.emailPlaceholder')} />
        </Field>
      </div>
      <Field className="mb-4">
        <FieldLabel htmlFor="contact-message">{t('contact.messagePlaceholder')}</FieldLabel>
        <textarea id="contact-message" value={message} onChange={(e) => onMessageChange(e.target.value)} placeholder={t('contact.messagePlaceholder')} className="w-full resize-y rounded-md border border-border bg-input-bg px-3 py-2 text-body text-fg placeholder:text-fg-tertiary transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" style={{ minHeight: 120 }} />
      </Field>
      <Button type="submit" variant="primary">
        <Mail className="size-4" />
        {t('contact.submit')}
      </Button>
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
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t('contact.title')}</h1>
      <Card className="max-w-3xl p-6">
        <p className="mb-6 text-fg-tertiary">{t('contact.intro')}</p>
        <ContactLinks onGithubClick={() => addToast('warning', t('contact.githubNotConfigured'))} />
        <FeedbackForm name={name} email={email} message={message} onNameChange={setName} onEmailChange={setEmail} onMessageChange={setMessage} onSubmit={handleSubmit} />
      </Card>
    </div>
  );
}

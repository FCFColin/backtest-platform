import type { ReactNode, MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents';
import { type ButtonProps } from '@/components/ui/uiComponents';
interface LoadingButtonProps {
  isLoading: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  loadingText?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonProps['variant'];
}
export default function LoadingButton({ isLoading, onClick, children, loadingText, disabled = false, className, style, type = 'button', variant = 'primary' }: LoadingButtonProps) {
  const { t } = useTranslation();
  return (
    <Button type={type} onClick={onClick} disabled={isLoading || disabled} className={className} style={style} variant={variant}>
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" />
          {loadingText ?? t('common.loading')}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

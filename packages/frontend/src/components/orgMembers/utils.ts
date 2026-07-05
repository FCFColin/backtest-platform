import { Link } from 'react-router-dom';

export function UnauthedMembers() {
  return (
    <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <p style={{ color: 'var(--text-muted)' }}>
          请先{' '}
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            登录
          </Link>{' '}
          后管理组织成员。
        </p>
      </div>
    </div>
  );
}

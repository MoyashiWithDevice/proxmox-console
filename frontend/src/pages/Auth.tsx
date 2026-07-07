import { useEffect, useState } from 'react';
import type { KratosFlow, FlowNode } from '../types';
import { AuthLayout } from '../components/AuthLayout';

interface AuthPageProps {
  isRegistration?: boolean;
}

export function AuthPage({ isRegistration = false }: AuthPageProps) {
  const [flow, setFlow] = useState<KratosFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const flowId = searchParams.get('flow');

    // Check for injected flow data from server-side error rendering
    const injectedFlow = (window as unknown as Record<string, KratosFlow>).FLOW;
    if (injectedFlow) {
      setFlow(injectedFlow);
      setLoading(false);
      return;
    }

    if (!flowId) {
      const kratosUrl = isRegistration ? '/self-service/registration/browser' : '/self-service/login/browser';
      window.location.href = kratosUrl;
      return;
    }

    const flowType = isRegistration ? 'registration' : 'login';
    fetch(`/api/auth/flow?type=${flowType}&flow=${flowId}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch flow');
        return r.json();
      })
      .then((data: KratosFlow) => {
        setFlow(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [isRegistration]);

  if (loading) {
    return (
      <AuthLayout>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>
      </AuthLayout>
    );
  }

  if (!flow) {
    return (
      <AuthLayout>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading authentication form...</div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthForm flow={flow} isRegistration={isRegistration} />
    </AuthLayout>
  );
}

export function ErrorAuthPage() {
  const [errorData, setErrorData] = useState<KratosFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const injectedFlow = (window as unknown as Record<string, KratosFlow>).FLOW;
    if (injectedFlow) {
      setErrorData(injectedFlow);
      setLoading(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const errorCode = searchParams.get('code');
    const errorId = searchParams.get('id');

    if (errorCode) {
      setLoading(false);
      return;
    }

    if (errorId) {
      fetch(`/api/auth/flow?type=error&flow=${errorId}`, { credentials: 'include' })
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch error');
          return r.json();
        })
        .then((data: KratosFlow) => {
          setErrorData(data);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
      return;
    }

    setLoading(false);
  }, []);

  if (loading) {
    return (
      <AuthLayout>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>
      </AuthLayout>
    );
  }

  const searchParams = new URLSearchParams(window.location.search);
  const errorCode = searchParams.get('code');

  if (errorCode) {
    let title = 'Unknown Error';
    let desc = 'An unknown error occurred.';
    if (errorCode === '404') { title = 'Not Found'; desc = 'The requested page was not found.'; }
    else if (errorCode === '500') { title = 'Internal Server Error'; desc = 'An internal server error occurred.'; }
    else if (errorCode === '503') { title = 'Service Unavailable'; desc = 'The authentication service is currently unavailable.'; }

    return (
      <AuthLayout>
        <ErrorCard
          title={`HTTP ${errorCode}`}
          message={title}
          description={desc}
        />
      </AuthLayout>
    );
  }

  if (!errorData) {
    return (
      <AuthLayout>
        <ErrorCard
          title="HTTP 404"
          message="Not Found"
          description="The requested page was not found."
        />
      </AuthLayout>
    );
  }

  const err = (errorData.error as Record<string, unknown>) || {};
  const errTitle = (err.id as string) || 'Error occurred';
  const errMessages = (err.messages as { text: string }[]) || [];

  return (
    <AuthLayout>
      <ErrorCard
        title={errTitle}
        message=""
        description={errMessages.map((m: { text: string }) => m.text).join(' ') || 'An unexpected error occurred.'}
      />
    </AuthLayout>
  );
}

function ErrorCard({ title, message, description }: { title: string; message?: string; description?: string }) {
  return (
    <div className="gloss-card-outer" style={{ borderRadius: 20, overflow: 'hidden' }}>
      <div className="gloss-card-inner" style={{ borderRadius: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: 12, color: '#dc2626', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Error</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12, marginTop: 10 }}>{title}</h1>
        {message && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>{message}</p>}
        {description && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginBottom: 28 }}>{description}</p>}
        <a href="/login" style={{ display: 'inline-block', padding: '12px 22px', background: '#fff', color: '#000', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          Return to sign in
        </a>
      </div>
    </div>
  );
}

function AuthForm({ flow, isRegistration }: { flow: KratosFlow; isRegistration: boolean }) {
  const { ui } = flow;
  const nodes = ui?.nodes || [];
  const method = ui?.method || 'POST';
  const messages = ui?.messages || [];
  const title = isRegistration ? 'Create account' : 'Sign in';
  const subtitle = isRegistration ? 'Create your new account.' : 'Welcome back.';
  const submitLabel = isRegistration ? 'Create account' : 'Sign in';
  const proxyAction = isRegistration ? '/api/auth/registration' : '/api/auth/login';

  let hasPassword = false;
  let submitContent: React.ReactNode = null;

  return (
    <div className="gloss-card-outer" style={{ borderRadius: 20, overflow: 'hidden' }}>
      <div className="gloss-card-inner" style={{ borderRadius: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{title}</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginBottom: 28, lineHeight: 1.5 }}>{subtitle}</p>

        {messages.map((msg, i) => {
          const color = msg.type === 'error' ? '#dc2626' : msg.type === 'success' ? '#22c55e' : '#f59e0b';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(220,38,38,0.08)', borderRadius: 8, marginBottom: 18, fontSize: 12, color, lineHeight: 1.4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{msg.text}</span>
            </div>
          );
        })}

        <form action={proxyAction} method={method} id="auth-form">
          {flow.id && <input type="hidden" name="flow" value={flow.id} />}

          {nodes.map((node: FlowNode, i: number) => {
            const attrs = node.attributes || {};
            const nodeType = node.type;
            const meta = node.meta || {};
            const label = meta.label || {};
            const labelText = label.text || '';

            if (nodeType === 'input') {
              const inputType = attrs.type || 'text';
              const name = attrs.name || '';
              const value = attrs.value || '';
              const required = attrs.required;
              const placeholder = getPlaceholder(attrs);

              if (inputType === 'hidden') {
                if (name) {
                  return <input key={i} type="hidden" name={name} value={String(value)} />;
                }
                return null;
              }

              if (inputType === 'submit') {
                if (name) {
                  submitContent = (
                    <button key={i} type="submit" name={name} value={String(value)} className="btn-primary"
                      style={{ width: '100%', padding: '14px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, marginTop: 6, cursor: 'pointer' }}>
                      {labelText || submitLabel}
                    </button>
                  );
                } else {
                  submitContent = (
                    <button key={i} type="submit" className="btn-primary"
                      style={{ width: '100%', padding: '14px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, marginTop: 6, cursor: 'pointer' }}>
                      {labelText || submitLabel}
                    </button>
                  );
                }
                return null;
              }

              if (name === 'password') hasPassword = true;

              return (
                <div key={i} style={{ marginBottom: 18 }}>
                  {labelText && (
                    <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
                      {labelText}
                    </label>
                  )}
                  <input
                    type={inputType}
                    name={name}
                    defaultValue={String(value)}
                    placeholder={inputType === 'password' ? 'Enter your password' : placeholder}
                    required={required}
                    style={{ width: '100%', padding: '14px 16px', background: '#0a0a12', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, outline: 'none' }}
                  />
                </div>
              );
            }

            return null;
          })}

          {isRegistration && !hasPassword && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>Password</label>
              <input type="password" name="password" placeholder="Enter your password" required
                style={{ width: '100%', padding: '14px 16px', background: '#0a0a12', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, outline: 'none' }} />
            </div>
          )}

          {submitContent || (
            <button type="submit" className="btn-primary"
              style={{ width: '100%', padding: '14px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, marginTop: 6, cursor: 'pointer' }}>
              {submitLabel}
            </button>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
          {isRegistration ? "Already have an account? " : "Don't have an account? "}
          <a href={isRegistration ? '/login' : '/registration'} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontWeight: 500 }}>
            {isRegistration ? 'Sign in' : 'Create account'}
          </a>
        </div>
      </div>

      <style>{`
        .gloss-card-outer { background: linear-gradient(148deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.06) 25%,rgba(255,255,255,0.01) 55%,rgba(255,255,255,0.09) 100%); padding: 1px; box-shadow: 0 0 55px rgba(255,255,255,0.04),0 0 120px rgba(255,255,255,0.015); }
        .gloss-card-inner { background: linear-gradient(160deg,#10101a 0%,#07070f 45%,#04040a 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); padding: 44px 40px 36px; }
        .btn-primary:not(:disabled):hover { box-shadow: 0 0 32px rgba(255,255,255,0.25),0 0 64px rgba(255,255,255,0.08); }
        .btn-primary:not(:disabled):active { transform: scale(0.988); }
      `}</style>
    </div>
  );
}

function getPlaceholder(attrs: Record<string, string | boolean | undefined>): string {
  const autocomplete = String(attrs.autocomplete || '');
  const name = String(attrs.name || '');
  const inputType = String(attrs.type || 'text');

  if (inputType === 'password') return 'Enter your password';
  if (autocomplete === 'email') return 'Enter your email';
  if (autocomplete === 'username') return 'Enter your username';
  if (autocomplete === 'current-password') return 'Enter your current password';
  if (autocomplete === 'new-password') return 'Enter your new password';
  if (name.includes('email')) return 'Enter your email';
  if (name.includes('password')) return 'Enter your password';
  if (name.includes('username') || name.includes('traits.username')) return 'Enter your username';
  if (name.includes('name')) return 'Enter your name';
  return 'Please enter a value';
}

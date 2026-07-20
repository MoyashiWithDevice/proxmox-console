import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KratosFlow, FlowNode } from '../types';
import { AuthLayout } from '../components/AuthLayout';
import { submitAuthFlow } from '../api';

interface AuthPageProps {
  isRegistration?: boolean;
}

export function AuthPage({ isRegistration = false }: AuthPageProps) {
  const [flow, setFlow] = useState<KratosFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const flowId = searchParams.get('flow');

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
        <div style={{ color: '#555', fontSize: 14 }}>Loading...</div>
      </AuthLayout>
    );
  }

  if (!flow) {
    return (
      <AuthLayout>
        <div style={{ color: '#555', fontSize: 14 }}>Loading authentication form...</div>
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
        <div style={{ color: '#555', fontSize: 14 }}>Loading...</div>
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
    <div style={{ border: '1px solid #111', borderRadius: 4, padding: '36px 32px', background: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{ fontSize: 12, color: '#f43f5e', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Error</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12, marginTop: 10, color: '#fff' }}>{title}</h1>
      {message && <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>{message}</p>}
      {description && <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, marginBottom: 28 }}>{description}</p>}
      <a href="/login" style={{ display: 'inline-block', padding: '10px 20px', background: 'transparent', border: '1px solid #111', borderRadius: 4, color: '#444', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
        Return to sign in
      </a>
    </div>
  );
}

function AuthForm({ flow, isRegistration }: { flow: KratosFlow; isRegistration: boolean }) {
  const navigate = useNavigate();
  const { ui } = flow;
  const nodes = ui?.nodes || [];
  const title = isRegistration ? 'Create account' : 'Sign in';
  const subtitle = isRegistration ? 'Create your new account.' : 'Welcome back.';
  const submitLabel = isRegistration ? 'Create account' : 'Sign in';
  const proxyAction = isRegistration ? '/api/auth/registration' : '/api/auth/login';

  const [submitting, setSubmitting] = useState(false);
  const [globalMessages, setGlobalMessages] = useState<{ type: string; text: string }[]>(ui?.messages || []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, { type: string; text: string }[]>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    syncErrorsFromFlow(flow);
  }, [flow]);

  function syncErrorsFromFlow(f: KratosFlow) {
    const fieldMsgs: Record<string, { type: string; text: string }[]> = {};
    f.ui?.nodes?.forEach((node) => {
      if (node.messages?.length) {
        const name = node.attributes?.name;
        if (name) fieldMsgs[name] = node.messages;
      }
    });
    setFieldErrors(fieldMsgs);
    setGlobalMessages(f.ui?.messages || []);
  }

  function validate(form: HTMLFormElement): Record<string, string> {
    const errs: Record<string, string> = {};
    const fd = new FormData(form);
    const email = (fd.get('traits.email') as string) || (fd.get('identifier') as string) || '';
    const password = (fd.get('password') as string) || '';

    if (isRegistration || fd.has('identifier')) {
      if (!email) errs.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email format';
    }

    if (isRegistration) {
      if (!password) errs.password = 'Password is required';
      else if (password.length < 4) errs.password = 'Password must be at least 4 characters';
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationErrors({});

    const vErrs = validate(e.currentTarget);
    if (Object.keys(vErrs).length > 0) {
      setValidationErrors(vErrs);
      return;
    }

    setSubmitting(true);
    const formData = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => formData.append(k, v.toString()));

    const methodBtn = nodes.find(
      (n) => n.type === 'input' && n.attributes?.type === 'submit' && n.attributes?.name
    );
    if (methodBtn?.attributes?.name && methodBtn.attributes.value) {
      formData.append(methodBtn.attributes.name, String(methodBtn.attributes.value));
    }

    try {
      const data = await submitAuthFlow(proxyAction, formData);
      if ('redirect_to' in data && data.redirect_to) {
        navigate(data.redirect_to);
        return;
      }
      syncErrorsFromFlow(data as KratosFlow);
    } catch {
      setGlobalMessages([{ type: 'error', text: 'Network error. Please try again.' }]);
    } finally {
      setSubmitting(false);
    }
  }

  let hasPassword = false;
  let submitContent: React.ReactNode = null;

  function getFieldError(name: string): string | null {
    if (validationErrors[name]) return validationErrors[name];
    const msgs = fieldErrors[name];
    if (msgs?.length) return msgs.map((m) => m.text).join(' ');
    return null;
  }

  return (
    <div style={{ border: '1px solid #111', borderRadius: 4, padding: '36px 32px', background: '#000' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4, color: '#fff' }}>{title}</h1>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 28, lineHeight: 1.5 }}>{subtitle}</p>

      {globalMessages.map((msg, i) => {
        const color = msg.type === 'error' ? '#f43f5e' : msg.type === 'success' ? '#22c55e' : '#f59e0b';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #111', borderRadius: 4, marginBottom: 18, fontSize: 12, color, lineHeight: 1.4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{msg.text}</span>
          </div>
        );
      })}

      <form onSubmit={handleSubmit} id="auth-form">
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
            const fieldErr = getFieldError(name);
            const borderColor = fieldErr ? '#f43f5e' : '#111';

            if (inputType === 'hidden') {
              if (name) {
                return <input key={i} type="hidden" name={name} value={String(value)} />;
              }
              return null;
            }

            if (inputType === 'submit') {
              submitContent = (
                <button key={i} type="submit" name={name} value={String(value)} disabled={submitting}
                  style={{ width: '100%', padding: '12px 20px', background: submitting ? '#333' : '#fff', color: submitting ? '#666' : '#000', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, marginTop: 6, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                  {submitting ? 'Submitting...' : (labelText || submitLabel)}
                </button>
              );
              return null;
            }

            if (name === 'password') hasPassword = true;

            return (
              <div key={i} style={{ marginBottom: 18 }}>
                {labelText && (
                  <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
                    {labelText}
                  </label>
                )}
                <input
                  type={inputType}
                  name={name}
                  defaultValue={String(value)}
                  placeholder={inputType === 'password' ? 'Enter your password' : placeholder}
                  required={required}
                  style={{ width: '100%', padding: '12px 14px', background: '#000', border: `1px solid ${borderColor}`, color: '#fff', fontSize: 14, outline: 'none', borderRadius: 4 }}
                />
                {fieldErr && (
                  <div style={{ color: '#f43f5e', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{fieldErr}</div>
                )}
              </div>
            );
          }

          return null;
        })}

        {isRegistration && !hasPassword && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>Password</label>
            <input type="password" name="password" placeholder="Enter your password" required
              style={{ width: '100%', padding: '12px 14px', background: '#000', border: `1px solid ${getFieldError('password') ? '#f43f5e' : '#111'}`, color: '#fff', fontSize: 14, outline: 'none', borderRadius: 4 }} />
            {getFieldError('password') && (
              <div style={{ color: '#f43f5e', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{getFieldError('password')}</div>
            )}
          </div>
        )}

        {submitContent || (
          <button type="submit" disabled={submitting}
            style={{ width: '100%', padding: '12px 20px', background: submitting ? '#333' : '#fff', color: submitting ? '#666' : '#000', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, marginTop: 6, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Submitting...' : submitLabel}
          </button>
        )}
      </form>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#444' }}>
        {isRegistration ? "Already have an account? " : "Don't have an account? "}
        <a href={isRegistration ? '/login' : '/registration'} style={{ color: '#888', textDecoration: 'none', fontWeight: 500 }}>
          {isRegistration ? 'Sign in' : 'Create account'}
        </a>
      </div>
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

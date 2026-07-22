import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from './Icon';
import { useVM } from '../context/VMContext';
import { statusColors } from '../types';
import { useEffect, useState } from 'react';
import { api } from '../api';

interface ItemProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  status?: string;
  icon?: string;
  depth?: number;
}

function Item({ label, active, onClick, status, icon, depth = 0 }: ItemProps) {
  const [hovered, setHovered] = useState(false);
  const color = active ? '#fff' : hovered ? '#aaa' : '#555';
  const bg = active ? '#111' : 'transparent';
  const sc = status ? (statusColors[status] || statusColors.unknown) : null;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px', paddingLeft: 16 + depth * 16,
        cursor: 'pointer', fontSize: 13, color,
        background: bg,
        borderLeft: active ? '2px solid #fff' : '2px solid transparent',
        userSelect: 'none',
        transition: 'color 0.15s',
      }}
    >
      {sc && <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />}
      {icon && !sc && <Icon name={icon} size={13} color={color} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { vms, jobs } = useVM();
  const [vmOpen, setVmOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api<any>('/api/admin/users')
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  const currentID = searchParams.get('id');

  const isVMPage = location.pathname === '/vm';
  const isJobPage = location.pathname === '/job';

  return (
    <div style={{
      width: 210, minWidth: 210,
      borderRight: '1px solid #111',
      overflowY: 'auto', flexShrink: 0,
      background: '#000',
      paddingTop: 8, paddingBottom: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 18px',
        fontSize: 10, color: '#2a2a2a',
        textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
        userSelect: 'none',
      }}>
        <Icon name="server" size={11} color="#333" />
        <span>Datacenter</span>
      </div>

      <Item
        label="Dashboard"
        icon="layers"
        active={location.pathname === '/'}
        onClick={() => navigate('/')}
      />

      <div
        onClick={() => setVmOpen(!vmOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 16px', paddingLeft: 16,
          cursor: 'pointer',
          fontSize: 10, color: '#2a2a2a',
          textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
          userSelect: 'none',
        }}
      >
        <Icon name={vmOpen ? 'chevronDown' : 'chevronRight'} size={10} color="#333" />
        <Icon name="monitor" size={11} color="#333" />
        <span>Virtual Machines</span>
      </div>
      {vmOpen && (
        <div>
          {vms.length === 0 && jobs.length === 0 ? (
            <div style={{ padding: '6px 16px 6px 32px', fontSize: 12, color: '#333' }}>None</div>
          ) : (
            <>
              {vms.map((v) => (
                <Item
                  key={v.uuid}
                  label={v.servername || `VM ${v.VMID}`}
                  status={v.Status || v.status || 'unknown'}
                  active={v.uuid === currentID && isVMPage}
                  depth={1}
                  onClick={() => { if (v.uuid) navigate(`/vm?id=${v.uuid}`); }}
                />
              ))}
              {jobs.map((j) => {
                const jid = j.JOBID || j.job_id || j.id || '';
                return (
                  <Item
                    key={jid}
                    label={(j.Servername || j.servername || 'VM') + ' (creating)'}
                    status={j.Status || j.status || ''}
                    active={jid === currentID && isJobPage}
                    depth={1}
                    onClick={() => navigate(`/job?id=${jid}`)}
                  />
                );
              })}
            </>
          )}
          <Item
            label="Create VM"
            icon="plus"
            active={location.pathname === '/vm/create'}
            depth={1}
            onClick={() => navigate('/vm/create')}
          />
        </div>
      )}

      <Item
        label="Storage"
        icon="database"
        onClick={() => {}}
      />
      <Item
        label="Network"
        icon="network"
        onClick={() => {}}
      />
      <Item
        label="Backups"
        icon="folder"
        onClick={() => {}}
      />
      <Item
        label="Support"
        icon="shield"
        active={location.pathname === '/support'}
        onClick={() => navigate('/support')}
      />
      
      {isAdmin && (
        <>
          <div style={{
            margin: '16px 0 8px 0',
            borderTop: '1px solid #111',
            paddingTop: 8,
            paddingLeft: 16,
            fontSize: 10, color: '#2a2a2a',
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
          }}>
            Administrator
          </div>
          <Item
            label="Settings"
            icon="settings"
            active={location.pathname === '/admin/settings'}
            onClick={() => navigate('/admin/settings')}
          />
          <Item
            label="Users"
            icon="shield"
            active={location.pathname === '/admin/users'}
            onClick={() => navigate('/admin/users')}
          />
          <Item
            label="Support Requests"
            icon="terminal"
            active={location.pathname === '/admin/support'}
            onClick={() => navigate('/admin/support')}
          />
        </>
      )}
    </div>
  );
}

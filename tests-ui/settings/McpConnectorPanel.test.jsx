// @vitest-environment jsdom
//
// Lot E du connecteur Claude — section « Connecteur Claude » : rendu des réglages avec leur
// source, clé verrouillée par l'environnement grisée, bouton « Couper l'écriture ».

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { McpConnectorPanel } = await import('../../src/components/settings/McpConnectorPanel.jsx');

const STATUS = {
  enabled: true,
  settings: [
    {
      key: 'mcp.api_bridge_enabled',
      value: true,
      source: 'défaut',
      locked: false,
      env: null,
      type: 'boolean',
      values: null,
    },
    {
      key: 'mcp.sql_write_enabled',
      value: false,
      source: 'env',
      locked: true,
      env: 'MCP_SQL_WRITE_ENABLED',
      type: 'boolean',
      values: null,
    },
    {
      key: 'mcp.write_mode',
      value: 'direct',
      source: 'base',
      locked: false,
      env: null,
      type: 'enum',
      values: ['direct', 'plan'],
    },
  ],
  privacy_bypass: { active: true, ack: null, ack_missing_reason: 'absent' },
  profiles: [
    { profile: 'admin', connector: true, scopes: ['foretmap.read', 'foretmap.write'], count: 60 },
    { profile: 'prof_classe', connector: false, scopes: [], tools: [] },
  ],
  activity: [
    {
      id: 1,
      at: '2026-11-05T10:00:00Z',
      actor: 'Admin',
      tool: 'foretmap_tasks',
      action: 'validate_task',
    },
  ],
};

describe('McpConnectorPanel', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (url) => {
      if (url === '/api/settings/admin/mcp/status') return STATUS;
      if (url === '/api/settings/admin/mcp/write-off') return { ok: true, applied: [], locked: [] };
      return {};
    });
  });

  it('affiche les réglages, leur source et l’activité', async () => {
    render(<McpConnectorPanel canWrite saveSetting={vi.fn()} />);
    await screen.findByTestId('mcp-row-mcp.api_bridge_enabled');
    expect(screen.getByTestId('mcp-row-mcp.write_mode').textContent).toMatch(/Source : réglage/);
    expect(screen.getByText(/60 outil\(s\), écriture possible/)).toBeTruthy();
    expect(screen.getByText(/connecteur non autorisé/)).toBeTruthy();
    expect(screen.getByText('foretmap_tasks')).toBeTruthy();
    expect(screen.getByText(/accessibles/)).toBeTruthy();
  });

  it('grise une clé verrouillée par l’environnement', async () => {
    render(<McpConnectorPanel canWrite saveSetting={vi.fn()} />);
    const row = await screen.findByTestId('mcp-row-mcp.sql_write_enabled');
    expect(row.textContent).toMatch(/fixé par le serveur \(MCP_SQL_WRITE_ENABLED\)/);
    expect(row.querySelector('input').disabled).toBe(true);
    const free = screen.getByTestId('mcp-row-mcp.api_bridge_enabled');
    expect(free.querySelector('input').disabled).toBe(false);
  });

  it('enregistre un réglage par saveSetting', async () => {
    const saveSetting = vi.fn(async () => {});
    render(<McpConnectorPanel canWrite saveSetting={saveSetting} />);
    const row = await screen.findByTestId('mcp-row-mcp.api_bridge_enabled');
    fireEvent.click(row.querySelector('input'));
    await waitFor(() =>
      expect(saveSetting).toHaveBeenCalledWith(
        'mcp.api_bridge_enabled',
        false,
        'Réglage du connecteur enregistré',
      ),
    );
  });

  it('« Couper l’écriture » appelle la route après confirmation', async () => {
    const confirm = vi.fn(async () => true);
    const onMessage = vi.fn();
    render(
      <McpConnectorPanel canWrite saveSetting={vi.fn()} confirm={confirm} onMessage={onMessage} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Couper l’écriture' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/settings/admin/mcp/write-off', 'POST', {}),
    );
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(onMessage).toHaveBeenCalled());
  });

  it('pas de bouton de coupure en lecture seule', async () => {
    render(<McpConnectorPanel canWrite={false} saveSetting={vi.fn()} />);
    await screen.findByTestId('mcp-row-mcp.api_bridge_enabled');
    expect(screen.queryByRole('button', { name: 'Couper l’écriture' })).toBeNull();
  });
});

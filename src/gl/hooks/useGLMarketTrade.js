import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiGL } from '../services/apiGL.js';
import { withAppBase } from '../../services/api.js';

export function useGLMarketTrade({ token, classId, enabled, onTradeCompleted }) {
  const [classmates, setClassmates] = useState([]);
  const [trades, setTrades] = useState([]);
  const [activeTradeId, setActiveTradeId] = useState(null);
  const [activeTrade, setActiveTrade] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onTradeCompletedRef = useRef(onTradeCompleted);

  useEffect(() => {
    onTradeCompletedRef.current = onTradeCompleted;
  }, [onTradeCompleted]);

  const loadClassmates = useCallback(async () => {
    const data = await apiGL('/api/gl/market/classmates');
    setClassmates(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadTrades = useCallback(async () => {
    const data = await apiGL('/api/gl/market/trades');
    setTrades(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadTrade = useCallback(async (tradeId) => {
    if (tradeId == null) {
      setActiveTrade(null);
      return;
    }
    const trade = await apiGL(`/api/gl/market/trades/${tradeId}`);
    setActiveTrade(trade);
    if (trade?.status === 'completed') {
      onTradeCompletedRef.current?.(trade);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!enabled) return;
    try {
      await Promise.all([loadClassmates(), loadTrades()]);
      if (activeTradeId != null) {
        await loadTrade(activeTradeId);
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement marché impossible');
    }
  }, [enabled, loadClassmates, loadTrades, loadTrade, activeTradeId]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshAll();
    return undefined;
  }, [enabled, refreshAll]);

  useEffect(() => {
    if (!token || !classId || !enabled) return undefined;
    const socket = io(withAppBase(''), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
    });
    socket.on('connect', () => {
      socket.emit('subscribe:gl-class', { classId });
    });
    socket.on('gl:market:trade-changed', (evt) => {
      if (Number(evt?.classId) !== Number(classId)) return;
      refreshAll();
    });
    return () => {
      socket.close();
    };
  }, [token, classId, enabled, refreshAll]);

  const runAction = useCallback(async (action) => {
    setBusy(true);
    try {
      await action();
      setError('');
    } catch (err) {
      setError(err.message || 'Action impossible');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const startTrade = useCallback(
    async (peerPlayerId) => {
      await runAction(async () => {
        try {
          const trade = await apiGL('/api/gl/market/trades', 'POST', { peerPlayerId });
          setActiveTradeId(trade.id);
          setActiveTrade(trade);
          await loadTrades();
        } catch (err) {
          if (err?.body?.trade?.id) {
            setActiveTradeId(err.body.trade.id);
            setActiveTrade(err.body.trade);
            await loadTrades();
          }
          throw err;
        }
      });
    },
    [runAction, loadTrades],
  );

  const updateOffer = useCallback(
    async (offerHealth, offerPower) => {
      if (activeTradeId == null) return;
      await runAction(async () => {
        const trade = await apiGL(`/api/gl/market/trades/${activeTradeId}/offer`, 'PATCH', {
          offerHealth,
          offerPower,
        });
        setActiveTrade(trade);
        await loadTrades();
      });
    },
    [activeTradeId, runAction, loadTrades],
  );

  const setAccepted = useCallback(
    async (accepted) => {
      if (activeTradeId == null) return;
      await runAction(async () => {
        const trade = await apiGL(`/api/gl/market/trades/${activeTradeId}/accept`, 'PATCH', {
          accepted,
        });
        setActiveTrade(trade);
        await loadTrades();
        if (trade?.status === 'completed') {
          onTradeCompletedRef.current?.(trade);
        }
      });
    },
    [activeTradeId, runAction, loadTrades],
  );

  const sendMessage = useCallback(
    async (body) => {
      if (activeTradeId == null) return;
      await runAction(async () => {
        const data = await apiGL(`/api/gl/market/trades/${activeTradeId}/messages`, 'POST', {
          body,
        });
        setActiveTrade(data?.trade || null);
      });
    },
    [activeTradeId, runAction],
  );

  const cancelTrade = useCallback(async () => {
    if (activeTradeId == null) return;
    await runAction(async () => {
      const trade = await apiGL(`/api/gl/market/trades/${activeTradeId}/cancel`, 'POST');
      setActiveTrade(trade);
      await loadTrades();
    });
  }, [activeTradeId, runAction, loadTrades]);

  const selectTrade = useCallback(
    (tradeId) => {
      setActiveTradeId(tradeId);
      loadTrade(tradeId);
    },
    [loadTrade],
  );

  return {
    classmates,
    trades,
    activeTradeId,
    activeTrade,
    error,
    busy,
    refreshAll,
    startTrade,
    updateOffer,
    setAccepted,
    sendMessage,
    cancelTrade,
    selectTrade,
  };
}

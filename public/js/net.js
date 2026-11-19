// 실시간 통신 레이어 (Supabase Realtime Broadcast)
(function () {
  const cfg = window.APP_CONFIG;
  let client = null;
  let channel = null;

  const Net = {
    connected: false,
    // 연결이 가끔 첫 시도에 늦게 붙는 경우가 있어 최대 3번 재시도
    async connect(code, onMessage, onStatus) {
      let lastErr;
      for (let i = 0; i < 3; i++) {
        try { return await Net._connectOnce(code, onMessage, onStatus); }
        catch (e) { lastErr = e; console.warn('connect retry', i + 1, e.message); }
      }
      throw lastErr;
    },
    async _connectOnce(code, onMessage, onStatus) {
      if (!client) {
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
          realtime: { params: { eventsPerSecond: 30 } }
        });
      }
      if (channel) { try { await client.removeChannel(channel); } catch (e) {} }
      channel = client.channel(cfg.CHANNEL_PREFIX + code, {
        config: { broadcast: { self: false, ack: false } }
      });
      channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
        try { onMessage(payload); } catch (e) { console.error(e); }
      });
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('연결 시간이 초과되었어요.')); }
        }, 7000);
        channel.subscribe((status) => {
          Net.connected = status === 'SUBSCRIBED';
          if (onStatus) onStatus(status);
          if (status === 'SUBSCRIBED' && !settled) {
            settled = true; clearTimeout(timer); resolve();
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
            settled = true; clearTimeout(timer); reject(new Error('실시간 서버에 연결하지 못했어요.'));
          }
        });
      });
    },
    send(type, data) {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'msg', payload: Object.assign({ type }, data || {}) });
    }
  };
  window.Net = Net;
})();

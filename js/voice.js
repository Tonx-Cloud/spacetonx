// VoiceChat - Sistema de bate-papo de voz via WebRTC + Supabase Realtime
// Sala única para todos os jogadores logados
// Usa Supabase Presence para descobrir peers (garante sincronização)
// e broadcast para sinalização WebRTC (offer/answer/ICE)

const VoiceChat = (() => {
  let supabase = null;
  let channel = null;
  let localStream = null;
  let peers = {};          // peerId -> RTCPeerConnection
  let isActive = false;
  let isMuted = false;
  let myPeerId = '';
  let connectedPeers = new Set();
  let pendingOffers = new Set(); // evita ofertas duplicadas

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  function generatePeerId() {
    return 'peer_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  }

  async function init() {
    const SUPABASE_URL = window.SUPABASE_URL || '';
    const SUPABASE_KEY = window.SUPABASE_KEY || '';

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      updateVoiceStatus('offline', 'Configure Supabase para voz');
      return false;
    }

    myPeerId = generatePeerId();

    try {
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      }
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return true;
    } catch {
      updateVoiceStatus('offline', 'Erro ao conectar');
      return false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Retorna todos os peerIds presentes no canal (exceto o próprio)
  function getPresencePeerIds() {
    if (!channel) return [];
    const state = channel.presenceState();
    const ids = [];
    for (const key of Object.keys(state)) {
      for (const entry of state[key]) {
        if (entry.peerId && entry.peerId !== myPeerId) {
          ids.push(entry.peerId);
        }
      }
    }
    return ids;
  }

  // Decide quem inicia a oferta para evitar duplicação:
  // o peer com ID lexicograficamente menor cria a offer
  function shouldInitiate(remotePeerId) {
    return myPeerId < remotePeerId;
  }

  async function join() {
    if (isActive) return;

    const ok = await init();
    if (!ok) return;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch (err) {
      updateVoiceStatus('offline', 'Microfone negado');
      return;
    }

    isActive = true;
    isMuted = false;
    updateVoiceUI();

    channel = supabase.channel('voice-room', {
      config: { broadcast: { self: false }, presence: { key: myPeerId } }
    });

    // --- Sinalização WebRTC via Broadcast ---
    channel.on('broadcast', { event: 'voice-signal' }, async (payload) => {
      const data = payload.payload;
      if (!data || data.target !== myPeerId) return;

      try {
        switch (data.type) {
          case 'offer':
            await handleOffer(data.from, data.sdp);
            break;
          case 'answer':
            await handleAnswer(data.from, data.sdp);
            break;
          case 'ice-candidate':
            await handleIceCandidate(data.from, data.candidate);
            break;
        }
      } catch (e) {
        console.warn('[Voice] Sinal ignorado:', e);
      }
    });

    // --- Presence: sincroniza quem está na sala ---
    channel.on('presence', { event: 'sync' }, () => {
      // sync é chamado sempre que o estado de presença muda.
      // Conectar a todos os peers que ainda não estamos conectados.
      const remotePeers = getPresencePeerIds();
      for (const rId of remotePeers) {
        if (!peers[rId] && !pendingOffers.has(rId) && shouldInitiate(rId)) {
          pendingOffers.add(rId);
          createOffer(rId);
        }
      }
      updatePeerCount();
    });

    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const p of leftPresences) {
        if (p.peerId && peers[p.peerId]) {
          removePeer(p.peerId);
        }
      }
    });

    // Aguardar confirmação real da inscrição antes de rastrear presença
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Registrar presença — todos os inscritos receberão sync
        await channel.track({ peerId: myPeerId });
        updateVoiceStatus('connected', 'Na sala de voz');
      }
    });
  }

  async function createOffer(remotePeerId) {
    const pc = createPeerConnection(remotePeerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    channel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: {
        type: 'offer',
        from: myPeerId,
        target: remotePeerId,
        sdp: pc.localDescription
      }
    });
  }

  async function handleOffer(remotePeerId, sdp) {
    const pc = createPeerConnection(remotePeerId);

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: {
        type: 'answer',
        from: myPeerId,
        target: remotePeerId,
        sdp: pc.localDescription
      }
    });
  }

  async function handleAnswer(remotePeerId, sdp) {
    const pc = peers[remotePeerId];
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async function handleIceCandidate(remotePeerId, candidate) {
    const pc = peers[remotePeerId];
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  function createPeerConnection(remotePeerId) {
    if (peers[remotePeerId]) {
      peers[remotePeerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[remotePeerId] = pc;

    // Adicionar stream local
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channel) {
        channel.send({
          type: 'broadcast',
          event: 'voice-signal',
          payload: {
            type: 'ice-candidate',
            from: myPeerId,
            target: remotePeerId,
            candidate: event.candidate
          }
        });
      }
    };

    // Receber áudio remoto
    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
      audio.id = 'voice-audio-' + remotePeerId;
      // Remover se já existia
      const old = document.getElementById(audio.id);
      if (old) old.remove();
      document.body.appendChild(audio);

      connectedPeers.add(remotePeerId);
      updatePeerCount();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(remotePeerId);
      }
    };

    return pc;
  }

  function removePeer(peerId) {
    if (peers[peerId]) {
      peers[peerId].close();
      delete peers[peerId];
    }
    pendingOffers.delete(peerId);
    const audioEl = document.getElementById('voice-audio-' + peerId);
    if (audioEl) audioEl.remove();
    connectedPeers.delete(peerId);
    updatePeerCount();
  }

  function leave() {
    if (!isActive) return;

    // Remover presença e canal
    if (channel) {
      channel.untrack();
      supabase.removeChannel(channel);
      channel = null;
    }

    // Fechar todas as conexões
    Object.keys(peers).forEach(removePeer);

    // Parar microfone
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    isActive = false;
    isMuted = false;
    connectedPeers.clear();
    pendingOffers.clear();
    updateVoiceUI();
    updateVoiceStatus('offline', 'Desconectado da voz');
  }

  function toggleMute() {
    if (!isActive || !localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
    updateVoiceUI();
  }

  function toggle() {
    if (isActive) {
      leave();
    } else {
      join();
    }
  }

  // ===== UI Helpers =====
  function updateVoiceUI() {
    const btn = document.getElementById('voice-toggle-btn');
    const muteBtn = document.getElementById('voice-mute-btn');
    const indicator = document.getElementById('voice-indicator');

    if (btn) {
      const label = btn.querySelector('.menu-item-label');
      const desc = btn.querySelector('.menu-item-desc');
      const icon = btn.querySelector('.menu-item-icon');
      if (label) label.textContent = isActive ? 'Sair da Voz' : 'Entrar na Voz';
      if (desc) desc.textContent = isActive ? 'Conectado — clique para sair' : 'Sala de voz com todos os jogadores';
      if (icon) icon.textContent = isActive ? '🔊' : '🎙️';
      btn.classList.toggle('voice-active', isActive);
    }

    if (muteBtn) {
      muteBtn.style.display = isActive ? 'inline-flex' : 'none';
      muteBtn.textContent = isMuted ? '🔇' : '🎤';
      muteBtn.classList.toggle('muted', isMuted);
    }

    if (indicator) {
      indicator.style.display = isActive ? 'flex' : 'none';
      indicator.classList.toggle('voice-muted', isMuted);
    }
  }

  function updatePeerCount() {
    const countEl = document.getElementById('voice-peer-count');
    if (countEl) {
      const count = connectedPeers.size + (isActive ? 1 : 0);
      countEl.textContent = `${count} na sala`;
    }
  }

  function updateVoiceStatus(status, msg) {
    const statusEl = document.getElementById('voice-status');
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.className = 'voice-status voice-' + status;
    }
    updateVoiceUI();
  }

  return {
    join,
    leave,
    toggle,
    toggleMute,
    get isActive() { return isActive; },
    get isMuted() { return isMuted; }
  };
})();

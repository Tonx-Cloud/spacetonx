// VoiceChat - Sala de voz fixa com auto-join
// WebRTC P2P com sinalização via Supabase broadcast
// Vanilla ICE + retry + health check + reconnect automático

const VoiceChat = (() => {
  let localStream = null;
  let peers = {};           // remotePeerId -> { pc, state, retries, lastOffer }
  let isActive = false;
  let isMuted = false;
  let myPeerId = '';
  let connectedPeers = new Set();
  let chatChannel = null;
  let audioContext = null;
  let listenersRegistered = false;
  let scanInterval = null;
  let healthInterval = null;
  let autoJoinDone = false;

  const MAX_RETRIES = 3;
  const OFFER_TIMEOUT = 8000;   // 8s para receber answer
  const SCAN_INTERVAL = 5000;   // scan peers a cada 5s
  const HEALTH_INTERVAL = 8000; // health check a cada 8s

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'b093b4e78e16e45f53e24660',
      credential: '5USROhVAhm/fcFnl'
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'b093b4e78e16e45f53e24660',
      credential: '5USROhVAhm/fcFnl'
    },
    {
      urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
      username: 'b093b4e78e16e45f53e24660',
      credential: '5USROhVAhm/fcFnl'
    }
  ];

  function generatePeerId() {
    return 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  }

  function getChannel() {
    return ChatSystem && ChatSystem.channel;
  }

  function waitForChannel() {
    return new Promise((resolve) => {
      if (getChannel()) return resolve(getChannel());
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (getChannel()) { clearInterval(iv); resolve(getChannel()); }
        else if (tries > 60) { clearInterval(iv); resolve(null); }
      }, 500);
    });
  }

  // Lê peers com voz ativa da presença do Supabase
  function getVoicePeerIds() {
    const ch = getChannel();
    if (!ch) return [];
    const state = ch.presenceState();
    const ids = [];
    for (const key of Object.keys(state)) {
      for (const entry of state[key]) {
        if (entry.voicePeerId && entry.voicePeerId !== myPeerId) {
          ids.push(entry.voicePeerId);
        }
      }
    }
    return ids;
  }

  // Determinístico: o ID menor inicia a conexão
  function shouldInitiate(remotePeerId) {
    return myPeerId < remotePeerId;
  }

  // Aguarda ICE gathering completar (vanilla ICE)
  function waitForIceGathering(pc, timeout) {
    timeout = timeout || 6000;
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(() => {
        console.log('[Voice] ICE gathering timeout, enviando parcial');
        resolve();
      }, timeout);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  // ===== AUTO-JOIN: entra na voz após o primeiro gesto de usuário =====
  function setupAutoJoin() {
    if (autoJoinDone) return;
    const handler = () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchstart', handler, true);
      autoJoinDone = true;
      // Pequeno delay pra não bloquear o gesto
      setTimeout(() => {
        if (!isActive) join();
      }, 500);
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('touchstart', handler, true);
  }

  // ===== ENTRAR NA SALA DE VOZ =====
  async function join() {
    if (isActive) return;
    updateVoiceStatus('connecting', 'Conectando...');

    if (!ChatSystem.channel) ChatSystem.init();
    const ch = await waitForChannel();
    if (!ch) {
      updateVoiceStatus('offline', 'Chat não conectado');
      return;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (err) {
      console.error('[Voice] Mic erro:', err);
      updateVoiceStatus('offline', 'Microfone negado');
      return;
    }

    // Desbloquear áudio no mobile
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
    } catch (e) {}

    myPeerId = generatePeerId();
    isActive = true;
    isMuted = false;
    chatChannel = ch;
    syncGlobals();
    updateVoiceUI();

    // Registrar listeners de sinalização (apenas 1 vez)
    if (!listenersRegistered) {
      chatChannel.on('broadcast', { event: 'voice-signal' }, handleSignal);
      chatChannel.on('presence', { event: 'sync' }, scanPeers);
      chatChannel.on('presence', { event: 'leave' }, handlePresenceLeave);
      listenersRegistered = true;
    }

    await ChatSystem.updatePresence();
    updateVoiceStatus('connected', 'Na sala de voz');
    console.log('[Voice] Entrou, peerId:', myPeerId);

    // Scan inicial com retries escalonados
    setTimeout(scanPeers, 1500);
    setTimeout(scanPeers, 4000);

    // Scan periódico de novos peers
    scanInterval = setInterval(scanPeers, SCAN_INTERVAL);
    // Health check periódico
    healthInterval = setInterval(healthCheck, HEALTH_INTERVAL);
  }

  // ===== SCAN DE PEERS: descobre novos e conecta =====
  function scanPeers() {
    if (!isActive) return;
    const remotePeers = getVoicePeerIds();
    
    for (const rId of remotePeers) {
      const peer = peers[rId];
      // Já conectado e saudável? Pula
      if (peer && peer.pc &&
          (peer.pc.iceConnectionState === 'connected' || peer.pc.iceConnectionState === 'completed')) {
        continue;
      }
      // Nenhuma conexão ou conexão falha — iniciar se somos o menor ID
      if (shouldInitiate(rId)) {
        if (!peer || peer.state !== 'offering') {
          console.log('[Voice] Scan: iniciando conexão com', rId);
          initiateConnection(rId);
        }
      }
    }
    updatePeerCount();
  }

  // ===== HEALTH CHECK: limpa conexões mortas, reconecta =====
  function healthCheck() {
    if (!isActive) return;
    const now = Date.now();
    const remotePeers = new Set(getVoicePeerIds());

    for (const [rId, peer] of Object.entries(peers)) {
      // Peer saiu da presença? Remove
      if (!remotePeers.has(rId)) {
        console.log('[Voice] Health: peer saiu da presença:', rId);
        removePeer(rId);
        continue;
      }

      const iceState = peer.pc ? peer.pc.iceConnectionState : 'none';

      // Oferta pendente que expirou?
      if (peer.state === 'offering' && peer.lastOffer && (now - peer.lastOffer > OFFER_TIMEOUT)) {
        peer.retries = (peer.retries || 0) + 1;
        if (peer.retries >= MAX_RETRIES) {
          console.log('[Voice] Health: max retries para', rId, '— removendo');
          removePeer(rId);
          // Tentar de novo no próximo scan
        } else {
          console.log('[Voice] Health: retry oferta', peer.retries, '→', rId);
          initiateConnection(rId, true);
        }
        continue;
      }

      // Conexão falhou ou desconectou?
      if (iceState === 'failed') {
        console.log('[Voice] Health: ICE failed para', rId, '— tentando ICE restart');
        tryIceRestart(rId);
      } else if (iceState === 'disconnected') {
        // Aguarda um ciclo antes de agir
        if (!peer._disconnectedAt) {
          peer._disconnectedAt = now;
        } else if (now - peer._disconnectedAt > 10000) {
          console.log('[Voice] Health: desconectado 10s, removendo', rId);
          removePeer(rId);
        }
      } else {
        peer._disconnectedAt = null;
      }
    }
    updatePeerCount();
  }

  // ===== INICIAR CONEXÃO COM PEER =====
  async function initiateConnection(remotePeerId, isRetry) {
    // Limpar conexão anterior se existir
    if (peers[remotePeerId] && peers[remotePeerId].pc) {
      peers[remotePeerId].pc.close();
    }

    const pc = createPeerConnection(remotePeerId);
    const retries = isRetry && peers[remotePeerId] ? (peers[remotePeerId].retries || 0) : 0;
    peers[remotePeerId] = { pc, state: 'offering', retries, lastOffer: Date.now() };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      if (!isActive || peers[remotePeerId]?.pc !== pc) return;

      const completeSdp = pc.localDescription;
      console.log('[Voice] Oferta →', remotePeerId, isRetry ? '(retry)' : '');

      chatChannel.send({
        type: 'broadcast',
        event: 'voice-signal',
        payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: completeSdp }
      });
    } catch (e) {
      console.warn('[Voice] Erro criar oferta:', e);
    }
  }

  // ===== ICE RESTART: tenta reconectar sem refazer tudo =====
  async function tryIceRestart(remotePeerId) {
    const peer = peers[remotePeerId];
    if (!peer || !peer.pc) return;

    try {
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      await waitForIceGathering(peer.pc);

      if (!isActive) return;
      const completeSdp = peer.pc.localDescription;
      console.log('[Voice] ICE restart →', remotePeerId);

      chatChannel.send({
        type: 'broadcast',
        event: 'voice-signal',
        payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: completeSdp }
      });
      peer.state = 'offering';
      peer.lastOffer = Date.now();
    } catch (e) {
      console.warn('[Voice] ICE restart falhou, recriando:', e);
      removePeer(remotePeerId);
    }
  }

  // ===== SINALIZAÇÃO: recebe ofertas e respostas =====
  async function handleSignal(payload) {
    const data = payload.payload;
    if (!data || data.target !== myPeerId || !isActive) return;
    console.log('[Voice] Sinal:', data.type, 'de', data.from);

    try {
      if (data.type === 'offer') {
        await handleOffer(data.from, data.sdp);
      } else if (data.type === 'answer') {
        await handleAnswer(data.from, data.sdp);
      }
    } catch (e) {
      console.warn('[Voice] Erro sinal:', data.type, e);
    }
  }

  async function handleOffer(remotePeerId, sdp) {
    // Se já temos uma conexão saudável e somos o iniciador, ignorar
    const existing = peers[remotePeerId];
    if (existing && existing.pc) {
      const state = existing.pc.iceConnectionState;
      if ((state === 'connected' || state === 'completed') && shouldInitiate(remotePeerId)) {
        console.log('[Voice] Ignorando oferta — já conectado e sou iniciador');
        return;
      }
      existing.pc.close();
    }

    const pc = createPeerConnection(remotePeerId);
    peers[remotePeerId] = { pc, state: 'answering', retries: 0, lastOffer: null };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    if (!isActive || peers[remotePeerId]?.pc !== pc) return;

    const completeSdp = pc.localDescription;
    console.log('[Voice] Resposta →', remotePeerId);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'answer', from: myPeerId, target: remotePeerId, sdp: completeSdp }
    });
  }

  async function handleAnswer(remotePeerId, sdp) {
    const peer = peers[remotePeerId];
    if (!peer || !peer.pc) return;
    console.log('[Voice] Resposta de', remotePeerId);
    await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    peer.state = 'connected';
    peer.lastOffer = null;
  }

  function handlePresenceLeave(ev) {
    for (const p of ev.leftPresences) {
      if (p.voicePeerId && peers[p.voicePeerId]) {
        removePeer(p.voicePeerId);
      }
    }
  }

  // ===== CRIAR RTCPeerConnection =====
  function createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Vanilla ICE: não enviamos candidates separados
    pc.onicecandidate = () => {};

    pc.ontrack = (event) => {
      console.log('[Voice] Track de', remotePeerId);
      attachAudio(remotePeerId, event.streams[0]);
      connectedPeers.add(remotePeerId);
      updatePeerCount();
      updateVoiceStatus('connected', connectedPeers.size + ' conectado(s)');
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Voice] ICE:', remotePeerId, state);

      if (state === 'connected' || state === 'completed') {
        connectedPeers.add(remotePeerId);
        if (peers[remotePeerId]) {
          peers[remotePeerId].state = 'connected';
          peers[remotePeerId]._disconnectedAt = null;
        }
        updatePeerCount();
        updateVoiceStatus('connected', connectedPeers.size + ' conectado(s)');
      }
      // Failed e disconnected são tratados pelo healthCheck
    };

    return pc;
  }

  // ===== REPRODUZIR ÁUDIO DO PEER =====
  function attachAudio(remotePeerId, stream) {
    // AudioContext (mobile unlock)
    if (audioContext) {
      try {
        if (audioContext.state === 'suspended') audioContext.resume();
        const src = audioContext.createMediaStreamSource(stream);
        src.connect(audioContext.destination);
      } catch (e) {}
    }

    const audioId = 'voice-audio-' + remotePeerId;
    let audio = document.getElementById(audioId);
    if (audio) { audio.srcObject = stream; }
    else {
      audio = document.createElement('audio');
      audio.id = audioId;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = 1.0;
      audio.setAttribute('playsinline', '');
      audio.srcObject = stream;
      document.body.appendChild(audio);
    }
    audio.play().catch((e) => console.warn('[Voice] play():', e));
  }

  // ===== REMOVER PEER =====
  function removePeer(peerId) {
    const peer = peers[peerId];
    if (peer) {
      if (peer.pc) peer.pc.close();
      delete peers[peerId];
    }
    const audioEl = document.getElementById('voice-audio-' + peerId);
    if (audioEl) audioEl.remove();
    connectedPeers.delete(peerId);
    updatePeerCount();
  }

  // ===== SAIR DA SALA =====
  function leave() {
    if (!isActive) return;
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }
    Object.keys(peers).forEach(removePeer);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    isActive = false;
    isMuted = false;
    myPeerId = '';
    connectedPeers.clear();
    chatChannel = null;
    syncGlobals();
    ChatSystem.updatePresence();
    updateVoiceUI();
    updateVoiceStatus('offline', 'Desconectado');
  }

  function toggleMute() {
    if (!isActive || !localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !isMuted; });
    syncGlobals();
    ChatSystem.updatePresence();
    updateVoiceUI();
  }

  function toggle() {
    if (isActive) leave(); else join();
  }

  function syncGlobals() {
    window._voiceActive = isActive;
    window._voiceMuted = isMuted;
    window._voicePeerId = myPeerId || null;
  }

  // ===== UI =====
  function updateVoiceUI() {
    const btn = document.getElementById('voice-toggle-btn');
    const muteBtn = document.getElementById('voice-mute-btn');
    const indicator = document.getElementById('voice-indicator');

    if (btn) {
      const label = btn.querySelector('.menu-item-label');
      const desc = btn.querySelector('.menu-item-desc');
      const icon = btn.querySelector('.menu-item-icon');
      if (label) label.textContent = isActive ? 'Sair da Voz' : 'Entrar na Voz';
      if (desc) desc.textContent = isActive ? 'Conectado' : 'Sala de voz';
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

    const chatMic = document.getElementById('chat-mic-btn');
    if (chatMic) {
      chatMic.textContent = !isActive ? '🎙️' : (isMuted ? '🔇' : '🎤');
      chatMic.classList.toggle('mic-active', isActive && !isMuted);
      chatMic.classList.toggle('mic-muted', isActive && isMuted);
    }
  }

  function updatePeerCount() {
    const countEl = document.getElementById('voice-peer-count');
    if (countEl) {
      const count = connectedPeers.size + (isActive ? 1 : 0);
      countEl.textContent = count + ' na sala';
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

  // Auto-join: ativa ao primeiro gesto do usuário
  setupAutoJoin();

  return {
    join,
    leave,
    toggle,
    toggleMute,
    setupAutoJoin,
    get isActive() { return isActive; },
    get isMuted() { return isMuted; }
  };
})();

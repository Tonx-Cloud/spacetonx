// VoiceChat - Chat de voz via WebRTC
// Reutiliza o canal Supabase Realtime do ChatSystem
// Sinalização WebRTC via broadcast + descoberta de peers via Presence

const VoiceChat = (() => {
  let localStream = null;
  let peers = {};
  let isActive = false;
  let isMuted = false;
  let myPeerId = '';
  let connectedPeers = new Set();
  let pendingOffers = new Set();
  let chatChannel = null;
  let audioContext = null;
  let iceCandidateBuffer = {};
  let remoteDescSet = {};
  let listenersRegistered = false;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  function generatePeerId() {
    return 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  }

  function getChannel() {
    return ChatSystem.channel;
  }

  function waitForChannel() {
    return new Promise((resolve) => {
      if (getChannel()) return resolve(getChannel());
      let tries = 0;
      const interval = setInterval(() => {
        tries++;
        if (getChannel()) { clearInterval(interval); resolve(getChannel()); }
        else if (tries > 40) { clearInterval(interval); resolve(null); }
      }, 250);
    });
  }

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

  function shouldInitiate(remotePeerId) {
    return myPeerId < remotePeerId;
  }

  async function join() {
    if (isActive) return;
    updateVoiceStatus('connecting', 'Conectando...');

    if (!ChatSystem.channel) { ChatSystem.init(); }
    const ch = await waitForChannel();
    if (!ch) {
      updateVoiceStatus('offline', 'Chat não conectado — tente novamente');
      return;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (err) {
      console.error('[Voice] Mic error:', err);
      updateVoiceStatus('offline', 'Microfone negado');
      return;
    }

    // Desbloquear áudio no mobile (dentro do gesto do usuário)
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      console.log('[Voice] AudioContext desbloqueado, state:', audioContext.state);
    } catch (e) {
      console.warn('[Voice] AudioContext falhou:', e);
    }

    myPeerId = generatePeerId();
    isActive = true;
    isMuted = false;
    chatChannel = ch;
    syncGlobals();
    updateVoiceUI();

    // Registrar listeners apenas uma vez para não acumular
    if (!listenersRegistered) {
      chatChannel.on('broadcast', { event: 'voice-signal' }, handleSignal);
      chatChannel.on('presence', { event: 'sync' }, handlePresenceSync);
      chatChannel.on('presence', { event: 'leave' }, handlePresenceLeave);
      listenersRegistered = true;
    }

    await ChatSystem.updatePresence();

    updateVoiceStatus('connected', 'Na sala de voz');
    console.log('[Voice] Entrou na sala, peerId:', myPeerId);

    // Retry: verificar peers após 2s caso sync tenha sido perdido
    setTimeout(() => { if (isActive) handlePresenceSync(); }, 2000);
    setTimeout(() => { if (isActive) handlePresenceSync(); }, 5000);
  }

  async function handleSignal(payload) {
    const data = payload.payload;
    if (!data || data.target !== myPeerId) return;

    console.log('[Voice] Sinal recebido:', data.type, 'de', data.from);

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
      console.warn('[Voice] Erro ao processar sinal:', data.type, e);
    }
  }

  function handlePresenceSync() {
    if (!isActive) return;
    const remotePeers = getVoicePeerIds();
    console.log('[Voice] Presence sync — peers de voz:', remotePeers.length, remotePeers);
    for (const rId of remotePeers) {
      if (!peers[rId] && !pendingOffers.has(rId) && shouldInitiate(rId)) {
        console.log('[Voice] Iniciando oferta para', rId);
        pendingOffers.add(rId);
        createOffer(rId);
      }
    }
    updatePeerCount();
  }

  function handlePresenceLeave({ leftPresences }) {
    for (const p of leftPresences) {
      if (p.voicePeerId && peers[p.voicePeerId]) {
        removePeer(p.voicePeerId);
      }
    }
  }

  async function createOffer(remotePeerId) {
    const pc = createPeerConnection(remotePeerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log('[Voice] Oferta criada para', remotePeerId);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: pc.localDescription }
    });
  }

  async function handleOffer(remotePeerId, sdp) {
    console.log('[Voice] Processando oferta de', remotePeerId);
    const pc = createPeerConnection(remotePeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet[remotePeerId] = true;

    // Flush ICE candidates que chegaram antes do SDP
    await flushIceCandidates(remotePeerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log('[Voice] Resposta enviada para', remotePeerId);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'answer', from: myPeerId, target: remotePeerId, sdp: pc.localDescription }
    });
  }

  async function handleAnswer(remotePeerId, sdp) {
    const pc = peers[remotePeerId];
    if (!pc) return;
    console.log('[Voice] Processando resposta de', remotePeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet[remotePeerId] = true;

    await flushIceCandidates(remotePeerId);
  }

  async function handleIceCandidate(remotePeerId, candidate) {
    const pc = peers[remotePeerId];
    if (!pc) return;

    if (!remoteDescSet[remotePeerId]) {
      // Buffering: SDP ainda não chegou
      if (!iceCandidateBuffer[remotePeerId]) iceCandidateBuffer[remotePeerId] = [];
      iceCandidateBuffer[remotePeerId].push(candidate);
      console.log('[Voice] ICE candidate bufferizado para', remotePeerId);
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async function flushIceCandidates(remotePeerId) {
    const buffer = iceCandidateBuffer[remotePeerId];
    if (!buffer || buffer.length === 0) return;
    const pc = peers[remotePeerId];
    if (!pc) return;

    console.log('[Voice] Flushing', buffer.length, 'ICE candidates para', remotePeerId);
    for (const c of buffer) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('[Voice] ICE candidate falhou:', e);
      }
    }
    iceCandidateBuffer[remotePeerId] = [];
  }

  function createPeerConnection(remotePeerId) {
    if (peers[remotePeerId]) {
      peers[remotePeerId].close();
    }

    iceCandidateBuffer[remotePeerId] = [];
    remoteDescSet[remotePeerId] = false;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[remotePeerId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && chatChannel) {
        chatChannel.send({
          type: 'broadcast',
          event: 'voice-signal',
          payload: { type: 'ice-candidate', from: myPeerId, target: remotePeerId, candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[Voice] Track recebida de', remotePeerId);

      // Rota 1: AudioContext (funciona no mobile)
      if (audioContext && audioContext.state === 'running') {
        try {
          const stream = new MediaStream([event.track]);
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(audioContext.destination);
          console.log('[Voice] Áudio roteado via AudioContext');
        } catch (e) {
          console.warn('[Voice] AudioContext routing falhou:', e);
        }
      }

      // Rota 2: Audio element (fallback)
      const audioId = 'voice-audio-' + remotePeerId;
      const old = document.getElementById(audioId);
      if (old) old.remove();

      const audio = document.createElement('audio');
      audio.srcObject = event.streams[0];
      audio.id = audioId;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.play().catch(e => console.warn('[Voice] Audio.play() bloqueado:', e));
      document.body.appendChild(audio);

      connectedPeers.add(remotePeerId);
      updatePeerCount();
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Voice] ICE state com', remotePeerId, ':', state);

      if (state === 'failed') {
        console.log('[Voice] ICE failed, tentando restart...');
        if (shouldInitiate(remotePeerId)) {
          recreateOffer(remotePeerId);
        }
      }
      if (state === 'disconnected') {
        setTimeout(() => {
          if (peers[remotePeerId] && peers[remotePeerId].iceConnectionState === 'disconnected') {
            removePeer(remotePeerId);
          }
        }, 5000);
      }
      if (state === 'connected') {
        console.log('[Voice] ✅ Conectado com áudio a', remotePeerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Voice] Connection state com', remotePeerId, ':', pc.connectionState);
      if (pc.connectionState === 'failed') {
        removePeer(remotePeerId);
      }
    };

    return pc;
  }

  async function recreateOffer(remotePeerId) {
    const pc = peers[remotePeerId];
    if (!pc) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      chatChannel.send({
        type: 'broadcast',
        event: 'voice-signal',
        payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: pc.localDescription }
      });
      console.log('[Voice] ICE restart offer enviada para', remotePeerId);
    } catch (e) {
      console.warn('[Voice] ICE restart falhou:', e);
    }
  }

  function removePeer(peerId) {
    if (peers[peerId]) {
      peers[peerId].close();
      delete peers[peerId];
    }
    pendingOffers.delete(peerId);
    delete iceCandidateBuffer[peerId];
    delete remoteDescSet[peerId];
    const audioEl = document.getElementById('voice-audio-' + peerId);
    if (audioEl) audioEl.remove();
    connectedPeers.delete(peerId);
    updatePeerCount();
  }

  function leave() {
    if (!isActive) return;

    Object.keys(peers).forEach(removePeer);

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
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
    pendingOffers.clear();
    chatChannel = null;
    // NÃO resetar listenersRegistered — o canal é o mesmo
    syncGlobals();
    ChatSystem.updatePresence();
    updateVoiceUI();
    updateVoiceStatus('offline', 'Desconectado da voz');
  }

  function toggleMute() {
    if (!isActive || !localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
    syncGlobals();
    ChatSystem.updatePresence();
    updateVoiceUI();
  }

  function toggle() {
    if (isActive) { leave(); } else { join(); }
  }

  function syncGlobals() {
    window._voiceActive = isActive;
    window._voiceMuted = isMuted;
    window._voicePeerId = myPeerId || null;
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

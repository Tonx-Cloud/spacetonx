// VoiceChat - Chat de voz via WebRTC
// Reutiliza o canal Supabase Realtime do ChatSystem (mesmo canal = mesma sala)
// Sinalização WebRTC via broadcast no canal do chat
// Descoberta de peers via Presence do canal do chat

const VoiceChat = (() => {
  let localStream = null;
  let peers = {};          // peerId -> RTCPeerConnection
  let isActive = false;
  let isMuted = false;
  let myPeerId = '';
  let connectedPeers = new Set();
  let pendingOffers = new Set();
  let signalHandler = null;
  let presenceSyncHandler = null;
  let presenceLeaveHandler = null;
  let chatChannel = null;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  function generatePeerId() {
    return 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  }

  function getChannel() {
    return ChatSystem.channel;
  }

  // Aguarda o canal do chat ficar disponível (até 10s)
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

  // Retorna todos os peerIds de voz presentes no canal
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

    // Garante que o chat esteja inicializado
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
      updateVoiceStatus('offline', 'Microfone negado');
      return;
    }

    myPeerId = generatePeerId();
    isActive = true;
    isMuted = false;
    chatChannel = ch;
    syncGlobals();
    updateVoiceUI();

    // Escutar sinais WebRTC via broadcast no canal do chat
    chatChannel.on('broadcast', { event: 'voice-signal' }, handleSignal);

    // Escutar Presence sync para detectar peers de voz
    chatChannel.on('presence', { event: 'sync' }, handlePresenceSync);
    chatChannel.on('presence', { event: 'leave' }, handlePresenceLeave);

    // Atualizar presença com voicePeerId via ChatSystem
    ChatSystem.updatePresence();

    updateVoiceStatus('connected', 'Na sala de voz');
    console.log('[Voice] Entrou na sala, peerId:', myPeerId);
  }

  async function handleSignal(payload) {
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
  }

  function handlePresenceSync() {
    if (!isActive) return;
    const remotePeers = getVoicePeerIds();
    for (const rId of remotePeers) {
      if (!peers[rId] && !pendingOffers.has(rId) && shouldInitiate(rId)) {
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

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: pc.localDescription }
    });
  }

  async function handleOffer(remotePeerId, sdp) {
    const pc = createPeerConnection(remotePeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'answer', from: myPeerId, target: remotePeerId, sdp: pc.localDescription }
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
      const audioId = 'voice-audio-' + remotePeerId;
      const old = document.getElementById(audioId);
      if (old) old.remove();

      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.id = audioId;
      audio.play().catch(() => {});
      document.body.appendChild(audio);

      connectedPeers.add(remotePeerId);
      updatePeerCount();
      console.log('[Voice] Áudio conectado com', remotePeerId);
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

    // Fechar todas as conexões WebRTC
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
    chatChannel = null;
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

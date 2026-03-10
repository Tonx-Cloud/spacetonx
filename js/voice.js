// VoiceChat - Chat de voz via WebRTC (estilo Discord - sala única)
// Usa Supabase Realtime broadcast para sinalização WebRTC
// Vanilla ICE: aguarda todos os ICE candidates antes de enviar SDP
// Isso evita perda de candidates em canais unreliable

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
  let listenersRegistered = false;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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

  // Aguarda ICE gathering completar (vanilla ICE)
  function waitForIceGathering(pc, timeout) {
    timeout = timeout || 5000;
    return new Promise(function(resolve) {
      if (pc.iceGatheringState === 'complete') {
        return resolve();
      }
      var timer = setTimeout(function() {
        console.log('[Voice] ICE gathering timeout, enviando parcial');
        resolve();
      }, timeout);
      pc.addEventListener('icegatheringstatechange', function() {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  async function join() {
    if (isActive) return;
    updateVoiceStatus('connecting', 'Conectando...');

    if (!ChatSystem.channel) { ChatSystem.init(); }
    var ch = await waitForChannel();
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
      console.error('[Voice] Mic error:', err);
      updateVoiceStatus('offline', 'Microfone negado');
      return;
    }

    // Desbloquear áudio no mobile
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
    } catch (e) { /* ok */ }

    myPeerId = generatePeerId();
    isActive = true;
    isMuted = false;
    chatChannel = ch;
    syncGlobals();
    updateVoiceUI();

    if (!listenersRegistered) {
      chatChannel.on('broadcast', { event: 'voice-signal' }, handleSignal);
      chatChannel.on('presence', { event: 'sync' }, handlePresenceSync);
      chatChannel.on('presence', { event: 'leave' }, handlePresenceLeave);
      listenersRegistered = true;
    }

    await ChatSystem.updatePresence();

    updateVoiceStatus('connected', 'Na sala de voz');
    console.log('[Voice] Entrou, peerId:', myPeerId);

    // Retries para encontrar peers
    setTimeout(function() { if (isActive) handlePresenceSync(); }, 2000);
    setTimeout(function() { if (isActive) handlePresenceSync(); }, 5000);
    setTimeout(function() { if (isActive) handlePresenceSync(); }, 10000);
  }

  async function handleSignal(payload) {
    var data = payload.payload;
    if (!data || data.target !== myPeerId) return;
    if (!isActive) return;

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

  function handlePresenceSync() {
    if (!isActive) return;
    var remotePeers = getVoicePeerIds();
    console.log('[Voice] Sync — peers:', remotePeers);
    for (var i = 0; i < remotePeers.length; i++) {
      var rId = remotePeers[i];
      if (!peers[rId] && !pendingOffers.has(rId) && shouldInitiate(rId)) {
        console.log('[Voice] Criando oferta para', rId);
        pendingOffers.add(rId);
        createOffer(rId);
      }
    }
    updatePeerCount();
  }

  function handlePresenceLeave(ev) {
    var leftPresences = ev.leftPresences;
    for (var i = 0; i < leftPresences.length; i++) {
      var p = leftPresences[i];
      if (p.voicePeerId && peers[p.voicePeerId]) {
        removePeer(p.voicePeerId);
      }
    }
  }

  // Vanilla ICE: cria offer → aguarda TODOS ICE candidates → envia SDP completo
  async function createOffer(remotePeerId) {
    var pc = createPeerConnection(remotePeerId);
    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await waitForIceGathering(pc);

    var completeSdp = pc.localDescription;
    console.log('[Voice] Oferta completa →', remotePeerId);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'offer', from: myPeerId, target: remotePeerId, sdp: completeSdp }
    });
  }

  // Vanilla ICE: processa offer → cria answer → aguarda ICE → envia
  async function handleOffer(remotePeerId, sdp) {
    console.log('[Voice] Processando oferta de', remotePeerId);

    if (peers[remotePeerId]) {
      peers[remotePeerId].close();
      delete peers[remotePeerId];
    }

    var pc = createPeerConnection(remotePeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    var answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await waitForIceGathering(pc);

    var completeSdp = pc.localDescription;
    console.log('[Voice] Resposta completa →', remotePeerId);

    chatChannel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { type: 'answer', from: myPeerId, target: remotePeerId, sdp: completeSdp }
    });
  }

  async function handleAnswer(remotePeerId, sdp) {
    var pc = peers[remotePeerId];
    if (!pc) return;
    console.log('[Voice] Resposta de', remotePeerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  function createPeerConnection(remotePeerId) {
    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[remotePeerId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, localStream);
      });
    }

    // Vanilla ICE: não enviamos candidates separados
    pc.onicecandidate = function() {};

    pc.ontrack = function(event) {
      console.log('[Voice] Track de', remotePeerId);

      // AudioContext (mobile)
      if (audioContext) {
        try {
          if (audioContext.state === 'suspended') audioContext.resume();
          var source = audioContext.createMediaStreamSource(event.streams[0]);
          source.connect(audioContext.destination);
        } catch (e) { /* fallback below */ }
      }

      // Audio element
      var audioId = 'voice-audio-' + remotePeerId;
      var old = document.getElementById(audioId);
      if (old) old.remove();

      var audio = document.createElement('audio');
      audio.srcObject = event.streams[0];
      audio.id = audioId;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = 1.0;
      audio.setAttribute('playsinline', '');
      document.body.appendChild(audio);
      audio.play().catch(function(e) { console.warn('[Voice] play():', e); });

      connectedPeers.add(remotePeerId);
      updatePeerCount();
      updateVoiceStatus('connected', connectedPeers.size + ' conectado(s)');
    };

    pc.oniceconnectionstatechange = function() {
      var state = pc.iceConnectionState;
      console.log('[Voice] ICE:', remotePeerId, state);

      if (state === 'connected' || state === 'completed') {
        connectedPeers.add(remotePeerId);
        updatePeerCount();
        updateVoiceStatus('connected', connectedPeers.size + ' conectado(s)');
      }
      if (state === 'failed') {
        removePeer(remotePeerId);
        pendingOffers.delete(remotePeerId);
        if (shouldInitiate(remotePeerId)) {
          setTimeout(function() {
            if (isActive && !peers[remotePeerId]) {
              pendingOffers.add(remotePeerId);
              createOffer(remotePeerId);
            }
          }, 3000);
        }
      }
      if (state === 'disconnected') {
        setTimeout(function() {
          if (peers[remotePeerId] && peers[remotePeerId].iceConnectionState === 'disconnected') {
            removePeer(remotePeerId);
          }
        }, 5000);
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
    var audioEl = document.getElementById('voice-audio-' + peerId);
    if (audioEl) audioEl.remove();
    connectedPeers.delete(peerId);
    updatePeerCount();
  }

  function leave() {
    if (!isActive) return;
    Object.keys(peers).forEach(removePeer);
    if (localStream) {
      localStream.getTracks().forEach(function(t) { t.stop(); });
      localStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(function() {});
      audioContext = null;
    }
    isActive = false;
    isMuted = false;
    myPeerId = '';
    connectedPeers.clear();
    pendingOffers.clear();
    chatChannel = null;
    syncGlobals();
    ChatSystem.updatePresence();
    updateVoiceUI();
    updateVoiceStatus('offline', 'Desconectado');
  }

  function toggleMute() {
    if (!isActive || !localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(function(track) { track.enabled = !isMuted; });
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

  function updateVoiceUI() {
    var btn = document.getElementById('voice-toggle-btn');
    var muteBtn = document.getElementById('voice-mute-btn');
    var indicator = document.getElementById('voice-indicator');

    if (btn) {
      var label = btn.querySelector('.menu-item-label');
      var desc = btn.querySelector('.menu-item-desc');
      var icon = btn.querySelector('.menu-item-icon');
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

    // Atualizar botão mic no chat
    var chatMic = document.getElementById('chat-mic-btn');
    if (chatMic) {
      chatMic.textContent = !isActive ? '🎙️' : (isMuted ? '🔇' : '🎤');
      chatMic.classList.toggle('mic-active', isActive && !isMuted);
      chatMic.classList.toggle('mic-muted', isActive && isMuted);
    }
  }

  function updatePeerCount() {
    var countEl = document.getElementById('voice-peer-count');
    if (countEl) {
      var count = connectedPeers.size + (isActive ? 1 : 0);
      countEl.textContent = count + ' na sala';
    }
  }

  function updateVoiceStatus(status, msg) {
    var statusEl = document.getElementById('voice-status');
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

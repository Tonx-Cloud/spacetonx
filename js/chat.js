// Chat System - Usa Supabase Realtime para chat entre jogadores
// Presence para lista de online + sinalização de voz

const ChatSystem = (() => {
  let supabase = null;
  let channel = null;
  let username = '';
  let isOpen = false;
  let initialized = false;
  let presenceKey = '';
  let onlinePlayers = [];  // [{username, voiceActive, isMuted, isMe}]
  let onPresenceChange = null; // callback externo
  let unreadCount = 0;

  function generateUsername() {
    const adjectives = ['Astro', 'Cosmic', 'Star', 'Nova', 'Blaze', 'Shadow', 'Neon', 'Turbo', 'Hyper', 'Pixel'];
    const nouns = ['Pilot', 'Hunter', 'Ace', 'Wing', 'Storm', 'Fury', 'Ghost', 'Blade', 'Hawk', 'Fox'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
  }

  function init() {
    if (initialized) return;
    initialized = true;

    username = localStorage.getItem('space_chat_user') || generateUsername();
    localStorage.setItem('space_chat_user', username);
    presenceKey = 'u_' + Math.random().toString(36).substring(2, 8);

    connectSupabase();

    const input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendChatMessage();
          e.preventDefault();
        }
        e.stopPropagation();
      });
    }

    addSystemMessage(`Bem-vindo! Seu nome: ${username}`);
    addSystemMessage('Conectando ao chat...');
  }

  async function connectSupabase() {
    // Supabase config - será preenchido no deploy
    const SUPABASE_URL = window.SUPABASE_URL || '';
    const SUPABASE_KEY = window.SUPABASE_KEY || '';

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      addSystemMessage('Chat em modo local (configure Supabase para online)');
      return;
    }

    try {
      // Carregar Supabase client dinamicamente
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      }

      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      channel = supabase.channel('space-shooter-chat', {
        config: { broadcast: { self: true }, presence: { key: presenceKey } }
      });

      channel.on('broadcast', { event: 'message' }, (payload) => {
        const data = payload.payload;
        if (data && data.user && data.text) {
          addChatMessage(data.user, data.text);
        }
      });

      channel.on('broadcast', { event: 'player_event' }, (payload) => {
        const data = payload.payload;
        if (data && data.text) {
          addSystemMessage(data.text);
        }
      });

      // Presence: atualizar lista de jogadores online
      channel.on('presence', { event: 'sync' }, () => {
        refreshOnlinePlayers();
      });

      channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences) {
          if (p.username && p.presenceKey !== presenceKey) {
            addSystemMessage(`${p.username} entrou`);
          }
        }
      });

      channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences) {
          if (p.username && p.presenceKey !== presenceKey) {
            addSystemMessage(`${p.username} saiu`);
          }
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(getPresencePayload());
          addSystemMessage('Conectado ao chat online!');
        }
      });

    } catch (err) {
      addSystemMessage('Chat offline - jogue e configure depois');
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function addChatMessage(user, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';

    const span = document.createElement('span');
    span.className = 'chat-user';
    span.textContent = user + ':';

    const msgText = document.createTextNode(' ' + text);

    div.appendChild(span);
    div.appendChild(msgText);
    container.appendChild(div);

    // Auto-scroll
    container.scrollTop = container.scrollHeight;

    // Limitar mensagens
    while (container.children.length > 100) {
      container.removeChild(container.firstChild);
    }

    // Badge de mensagem nova quando chat fechado
    if (!isOpen) {
      unreadCount++;
      updateChatBadge();
    }
  }

  function addSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Se Supabase conectado, envia broadcast
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'message',
        payload: { user: username, text: text }
      });
    } else {
      // Modo local
      addChatMessage(username, text);
    }
  }

  // Notificar eventos do jogo no chat
  function notifyGameEvent(eventText) {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'player_event',
        payload: { text: `${username}: ${eventText}` }
      });
    }
    addSystemMessage(eventText);
  }

  // Gera payload de presença com estado atual
  function getPresencePayload() {
    return {
      username: username,
      presenceKey: presenceKey,
      voicePeerId: window._voicePeerId || null,
      voiceActive: !!window._voiceActive,
      voiceMuted: !!window._voiceMuted
    };
  }

  // Atualizar presença (chamada quando voz muda, nome muda, etc)
  async function updatePresence() {
    if (channel) {
      try {
        await channel.track(getPresencePayload());
      } catch (e) {
        console.warn('[Chat] Presence track falhou:', e);
      }
    }
  }

  // Lê estado de presença e monta lista de jogadores online
  function refreshOnlinePlayers() {
    if (!channel) return;
    const state = channel.presenceState();
    const players = [];
    let foundSelf = false;
    for (const key of Object.keys(state)) {
      for (const entry of state[key]) {
        if (entry.username) {
          const isMe = entry.presenceKey === presenceKey;
          if (isMe) foundSelf = true;
          players.push({
            username: entry.username,
            voiceActive: !!entry.voiceActive,
            voiceMuted: !!entry.voiceMuted,
            voicePeerId: entry.voicePeerId || null,
            isMe
          });
        }
      }
    }
    // Garante que o jogador local SEMPRE aparece na lista
    if (!foundSelf && username) {
      players.unshift({
        username: username,
        voiceActive: !!window._voiceActive,
        voiceMuted: !!window._voiceMuted,
        voicePeerId: window._voicePeerId || null,
        isMe: true
      });
    }
    onlinePlayers = players;
    renderOnlineList();
    if (onPresenceChange) onPresenceChange(players);
  }

  function renderOnlineList() {
    const list = document.getElementById('online-list');
    if (!list) return;
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.textContent = onlinePlayers.length;

    list.innerHTML = '';
    for (const p of onlinePlayers) {
      const li = document.createElement('div');
      li.className = 'online-player' + (p.isMe ? ' online-player-me' : '');

      // Ícone de status de voz
      let voiceIcon = '';
      if (p.voiceActive) {
        voiceIcon = p.voiceMuted ? '<span class="op-mic muted" title="Mutado">🔇</span>'
                                 : '<span class="op-mic active" title="No mic">🎤</span>';
      }

      // Se for eu, botão de mic toggle + editar nome
      if (p.isMe) {
        li.innerHTML = `
          <span class="op-name">${p.username} <small>(você)</small></span>
          <span class="op-actions">
            ${window._voiceActive ? '<button class="op-mic-btn" onclick="VoiceChat.toggleMute()" title="Mutar/Desmutar">' + (window._voiceMuted ? '🔇' : '🎤') + '</button>' : ''}
            <button class="op-edit-btn" onclick="ChatSystem.promptChangeName()" title="Trocar nome">✏️</button>
          </span>`;
      } else {
        li.innerHTML = `<span class="op-name">${p.username}</span>${voiceIcon}`;
      }
      list.appendChild(li);
    }
  }

  // Trocar nome
  function promptChangeName() {
    const modal = document.getElementById('name-modal');
    const input = document.getElementById('name-input');
    if (modal && input) {
      input.value = username;
      modal.classList.add('modal-visible');
      setTimeout(() => input.focus(), 100);
    }
  }

  function confirmChangeName() {
    const input = document.getElementById('name-input');
    if (!input) return;
    const newName = input.value.trim().substring(0, 20);
    if (!newName || newName === username) {
      closeNameModal();
      return;
    }
    const oldName = username;
    username = newName;
    localStorage.setItem('space_chat_user', username);
    addSystemMessage(`Nome alterado para ${username}`);
    updatePresence();

    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'player_event',
        payload: { text: `${oldName} agora é ${username}` }
      });
    }
    closeNameModal();
  }

  function closeNameModal() {
    const modal = document.getElementById('name-modal');
    if (modal) modal.classList.remove('modal-visible');
  }

  function toggle() {
    const overlay = document.getElementById('chat-overlay');
    if (!overlay) return;

    isOpen = !isOpen;
    overlay.classList.toggle('chat-hidden', !isOpen);

    if (isOpen && !initialized) {
      init();
    }

    if (isOpen) {
      unreadCount = 0;
      updateChatBadge();
      setTimeout(() => {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
      }, 100);
    }
  }

  function updateChatBadge() {
    const badge = document.getElementById('chat-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  return {
    init,
    sendMessage,
    toggle,
    notifyGameEvent,
    promptChangeName,
    confirmChangeName,
    closeNameModal,
    updatePresence,
    refreshOnlinePlayers,
    get username() { return username; },
    get supabase() { return supabase; },
    get channel() { return channel; },
    get onlinePlayers() { return onlinePlayers; },
    set onPresenceChange(fn) { onPresenceChange = fn; }
  };
})();

// Funções globais chamadas pelo HTML
function toggleChat() {
  ChatSystem.toggle();
}

function sendChatMessage() {
  ChatSystem.sendMessage();
}

// Inicializar chat quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  ChatSystem.init();
});

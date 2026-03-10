// Chat System - Usa Supabase Realtime para chat entre jogadores
// Se Supabase não estiver configurado, funciona em modo local

const ChatSystem = (() => {
  let supabase = null;
  let channel = null;
  let username = '';
  let isOpen = false;
  let initialized = false;

  // Gera nome aleatório se não tiver
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

    // Recuperar ou gerar username
    username = localStorage.getItem('space_chat_user') || generateUsername();
    localStorage.setItem('space_chat_user', username);

    // Tentar conectar ao Supabase
    connectSupabase();

    // Event listeners do chat
    const input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendChatMessage();
          e.preventDefault();
        }
        // Impedir que teclas do chat afetem o jogo
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

      // Criar canal de chat com Presence habilitado
      channel = supabase.channel('space-shooter-chat', {
        config: { broadcast: { self: true }, presence: { key: 'user_' + Math.random().toString(36).substring(2, 8) } }
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

      await channel.subscribe();
      addSystemMessage('Conectado ao chat online!');

      // Anunciar entrada
      channel.send({
        type: 'broadcast',
        event: 'player_event',
        payload: { text: `${username} entrou no jogo!` }
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

  function toggle() {
    const overlay = document.getElementById('chat-overlay');
    if (!overlay) return;

    isOpen = !isOpen;
    overlay.classList.toggle('chat-hidden', !isOpen);

    // Inicializar na primeira abertura
    if (isOpen && !initialized) {
      init();
    }

    // Focus no input
    if (isOpen) {
      setTimeout(() => {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
      }, 100);
    }
  }

  return {
    init,
    sendMessage,
    toggle,
    notifyGameEvent,
    get username() { return username; },
    get supabase() { return supabase; },
    get channel() { return channel; }
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

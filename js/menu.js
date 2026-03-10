// HamburgerMenu - Menu sanduíche com todas as funções do PWA
const HamburgerMenu = (() => {
  let isOpen = false;
  let deferredInstallPrompt = null;
  let soundEnabled = true;

  function init() {
    // Capturar evento de instalação do PWA
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      updateInstallButton(true);
    });

    // Detectar se já instalado
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateInstallButton(false);
    });

    // Fechar menu ao clicar fora
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('hamburger-panel');
      const btn = document.getElementById('hamburger-btn');
      if (isOpen && menu && !menu.contains(e.target) && !btn.contains(e.target)) {
        close();
      }
    });

    // Carregar preferência de som
    soundEnabled = localStorage.getItem('space_sound') !== 'off';
    updateSoundButton();
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function open() {
    isOpen = true;
    const panel = document.getElementById('hamburger-panel');
    if (panel) {
      panel.classList.remove('menu-hidden');
      panel.classList.add('menu-visible');
    }
    const btn = document.getElementById('hamburger-btn');
    if (btn) btn.classList.add('menu-open');
  }

  function close() {
    isOpen = false;
    const panel = document.getElementById('hamburger-panel');
    if (panel) {
      panel.classList.remove('menu-visible');
      panel.classList.add('menu-hidden');
    }
    const btn = document.getElementById('hamburger-btn');
    if (btn) btn.classList.remove('menu-open');
  }

  // ===== INSTALAR PWA =====
  async function installPWA() {
    if (!deferredInstallPrompt) {
      showToast('App já instalado ou não suportado neste navegador');
      return;
    }
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      showToast('App instalado com sucesso!');
    }
    deferredInstallPrompt = null;
    updateInstallButton(false);
    close();
  }

  function updateInstallButton(available) {
    const btn = document.getElementById('menu-install');
    if (btn) {
      btn.style.opacity = available ? '1' : '0.4';
      btn.querySelector('.menu-item-desc').textContent = available
        ? 'Instalar no celular/PC'
        : 'Já instalado ou indisponível';
    }
  }

  // ===== TELA CHEIA =====
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        showToast('Tela cheia não suportada');
      });
    } else {
      document.exitFullscreen();
    }
    close();
  }

  // ===== SOM =====
  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('space_sound', soundEnabled ? 'on' : 'off');
    updateSoundButton();

    // Comunicar com o jogo
    if (window.game && window.game.scene) {
      const gameScene = window.game.scene.getScene('Game');
      if (gameScene && gameScene.audioCtx) {
        if (soundEnabled) {
          gameScene.audioCtx.resume();
        } else {
          gameScene.audioCtx.suspend();
        }
      }
    }

    showToast(soundEnabled ? 'Som ativado' : 'Som desativado');
  }

  function updateSoundButton() {
    const btn = document.getElementById('menu-sound');
    if (btn) {
      const icon = btn.querySelector('.menu-item-icon');
      const desc = btn.querySelector('.menu-item-desc');
      if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
      if (desc) desc.textContent = soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros';
    }
  }

  // ===== COMPARTILHAR =====
  async function share() {
    const shareData = {
      title: 'Space Shooter - Ataque Galáctico',
      text: 'Vem jogar Space Shooter comigo! Um jogo de naves estilo arcade direto no navegador.',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Usuário cancelou
      }
    } else {
      // Fallback: copiar link
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copiado! Envie para seus amigos');
      } catch {
        showToast('Copie este link: ' + window.location.href);
      }
    }
    close();
  }

  // ===== CHAT DE TEXTO =====
  function openChat() {
    close();
    const overlay = document.getElementById('chat-overlay');
    if (overlay && overlay.classList.contains('chat-hidden')) {
      toggleChat();
    }
  }

  // ===== CHAT DE VOZ =====
  function toggleVoice() {
    VoiceChat.toggle();
  }

  function toggleVoiceMute() {
    VoiceChat.toggleMute();
  }

  // ===== JOGADORES ONLINE =====
  function toggleOnline() {
    close();
    const panel = document.getElementById('online-panel');
    if (panel) panel.classList.toggle('online-hidden');
  }

  // ===== SOBRE =====
  function showAbout() {
    close();
    const modal = document.getElementById('about-modal');
    if (modal) modal.classList.add('modal-visible');
  }

  function closeAbout() {
    const modal = document.getElementById('about-modal');
    if (modal) modal.classList.remove('modal-visible');
  }

  // ===== TOAST =====
  function showToast(msg) {
    let toast = document.getElementById('menu-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'menu-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 2500);
  }

  return {
    init,
    toggle,
    open,
    close,
    installPWA,
    toggleFullscreen,
    toggleSound,
    share,
    openChat,
    toggleVoice,
    toggleVoiceMute,
    toggleOnline,
    showAbout,
    closeAbout,
    get isSoundEnabled() { return soundEnabled; }
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  HamburgerMenu.init();
});

# 🚀 Space Shooter — Ataque Galáctico

Jogo de nave espacial estilo arcade com chat multiplayer, construído como **PWA** (Progressive Web App) com gráficos 100% procedurais.

![Phaser 3](https://img.shields.io/badge/Phaser-3.80.1-blue) ![PWA](https://img.shields.io/badge/PWA-ready-brightgreen) ![WebRTC](https://img.shields.io/badge/Voice-WebRTC-orange)

---

## 🎮 Funcionalidades

| Recurso | Descrição |
|---------|-----------|
| **Shooter Arcade** | Movimentação por toque/teclado, disparo automático, waves infinitas com chefões a cada 5 ondas |
| **Gráficos Procedurais** | Todos os sprites são gerados em tempo de execução — zero dependência de imagens externas |
| **Power-ups** | Escudo, aumento de poder de fogo e vida extra |
| **7 Padrões de Movimento** | Inimigos com trajetórias variadas (reto, zigue-zague, seno, mergulho, espiral, curva, oito) |
| **Chat de Texto** | Sala global via Supabase Realtime (broadcast) |
| **Chat de Voz** | WebRTC peer-to-peer com sinalização via Supabase Realtime |
| **Menu Sanduíche** | Instalar PWA, tela cheia, som, compartilhar, chat, voz, sobre |
| **PWA Completa** | Instalável, offline-first com Service Worker, orientação retrato |
| **Áudio Procedural** | Efeitos sonoros gerados via Web Audio API |

---

## 📁 Estrutura do Projeto

```
JOGO-ESPACIAL/
├── index.html              # Entrada principal + UI overlays
├── manifest.json           # Manifesto PWA
├── sw.js                   # Service Worker (cache-first)
├── vercel.json             # Configuração de deploy estático
├── css/
│   └── style.css           # Estilos (tema neon arcade)
├── js/
│   ├── game.js             # Config Phaser e inicialização
│   ├── chat.js             # Chat de texto (Supabase Realtime)
│   ├── voice.js            # Chat de voz (WebRTC + Supabase)
│   ├── menu.js             # Menu hamburger com funções PWA
│   └── scenes/
│       ├── BootScene.js    # Geração procedural de assets
│       ├── MenuScene.js    # Tela de título
│       ├── GameScene.js    # Engine principal do jogo
│       └── GameOverScene.js# Tela de fim de jogo + high score
└── assets/
    └── icon-192.svg        # Ícone PWA
```

---

## 🛠️ Tecnologias

- **[Phaser 3.80.1](https://phaser.io/)** — Game engine (Arcade Physics)
- **Supabase Realtime** — Chat de texto (broadcast) e sinalização WebRTC
- **WebRTC** — Chat de voz peer-to-peer
- **Web Audio API** — Efeitos sonoros procedurais
- **Service Worker** — Cache offline (PWA)
- **Web Share API** — Compartilhamento nativo
- **Fullscreen API** — Modo tela cheia

---

## ⚡ Início Rápido

### Rodar localmente

Qualquer servidor estático funciona. Exemplos:

```bash
# Com Python
python -m http.server 8000

# Com Node.js
npx serve .

# Com VS Code
# Instale a extensão "Live Server" e clique em "Go Live"
```

Acesse `http://localhost:8000` no navegador.

### Controles

| Plataforma | Ação |
|-----------|------|
| **Desktop** | `←` `→` `↑` `↓` ou `W` `A` `S` `D` para mover — disparo automático |
| **Mobile** | Arraste o dedo para mover a nave — disparo automático |

---

## 🔧 Configuração do Supabase

O chat de texto e voz utilizam **Supabase Realtime**. Para ativá-los:

1. Crie um projeto no [Supabase](https://supabase.com/)
2. Copie a **URL** e a **anon key** do projeto
3. Edite `js/chat.js` e `js/voice.js`, substituindo:

```js
window.SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
window.SUPABASE_KEY = 'sua-anon-key-aqui';
```

> Sem configuração, o jogo funciona normalmente — apenas os chats ficam desabilitados.

---

## 🚀 Deploy na Vercel

```bash
# Instale a Vercel CLI (se necessário)
npm i -g vercel

# Deploy
vercel --prod
```

O projeto já inclui `vercel.json` configurado para deploy estático.

---

## 📱 PWA

O jogo é uma Progressive Web App completa:

- **Instalável** em dispositivos móveis e desktop (via menu sanduíche ou prompt do navegador)
- **Offline** — Service Worker cacheia todos os assets
- **Orientação retrato** otimizada para mobile
- **Tela cheia** disponível no menu

---

## 🎯 Mecânicas do Jogo

- **Waves progressivas** — Dificuldade aumenta a cada onda (mais inimigos, mais rápidos, mais HP)
- **Chefões** — A cada 5 ondas surge um boss com barra de HP
- **Power-ups** — Drops aleatórios dos inimigos:
  - 🛡️ **Escudo** — absorve um hit
  - 🔥 **Fire Up** — aumenta nível de arma (até 5)
  - ❤️ **Vida** — +1 vida
- **High Score** — Salvo no `localStorage` do navegador

---

## 📄 Licença

MIT

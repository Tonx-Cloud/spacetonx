// game.js - Configuração do Phaser e inicialização
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 420,
  height: 720,
  backgroundColor: '#000011',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  input: {
    activePointers: 3
  },
  render: {
    pixelArt: false,
    antialias: true,
    transparent: false
  }
};

const game = new Phaser.Game(config);

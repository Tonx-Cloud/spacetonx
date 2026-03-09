// MenuScene - Tela inicial do jogo
class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;

    // Fundo estrelado
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(Phaser.Math.FloatBetween(0.2, 1));
      star.speed = Phaser.Math.FloatBetween(0.3, 1.5);
      this.stars.push(star);
    }

    // Título com efeito neon
    this.add.text(width / 2, height * 0.18, '🚀 SPACE SHOOTER', {
      fontSize: '32px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#00ffff',
      stroke: '#004466',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#00ffff', blur: 20, fill: true }
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.26, 'ATAQUE GALÁCTICO', {
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      color: '#ff0044',
      stroke: '#440011',
      strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0044', blur: 15, fill: true }
    }).setOrigin(0.5);

    // Nave decorativa girando
    const ship = this.add.image(width / 2, height * 0.42, 'player').setScale(2);
    this.tweens.add({
      targets: ship,
      y: height * 0.42 - 10,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Partículas de propulsão no menu
    const particles = this.add.particles(0, 0, 'particle_fire', {
      follow: ship,
      followOffset: { x: 0, y: 28 },
      speed: { min: 20, max: 60 },
      angle: { min: 80, max: 100 },
      scale: { start: 0.6, end: 0 },
      lifespan: 400,
      frequency: 50,
      tint: [0xff6600, 0xff4400, 0xff0000]
    });

    // Botão JOGAR
    this.createButton(width / 2, height * 0.6, '▶  JOGAR', () => {
      this.scene.start('Game');
    });

    // Instruções
    const instructions = [
      '🎮 Toque/Arraste para mover',
      '🔫 Tiro automático',
      '🛡️ Colete power-ups',
      '💬 Chat com amigos no botão 💬'
    ];

    instructions.forEach((text, i) => {
      this.add.text(width / 2, height * 0.72 + i * 24, text, {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: '#8888aa'
      }).setOrigin(0.5);
    });

    // Versão
    this.add.text(width / 2, height - 20, 'v1.0 • PWA Edition', {
      fontSize: '11px',
      color: '#444466'
    }).setOrigin(0.5);
  }

  createButton(x, y, text, callback) {
    const btn = this.add.text(x, y, text, {
      fontSize: '24px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      backgroundColor: '#ff0044',
      padding: { x: 30, y: 12 },
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0044', blur: 20, fill: false, stroke: true }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#ff3366' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#ff0044' }));
    btn.on('pointerdown', callback);

    // Pulso
    this.tweens.add({
      targets: btn,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return btn;
  }

  update() {
    const { height } = this.scale;
    this.stars.forEach(star => {
      star.y += star.speed;
      if (star.y > height + 5) {
        star.y = -5;
        star.x = Phaser.Math.Between(0, this.scale.width);
      }
    });
  }
}

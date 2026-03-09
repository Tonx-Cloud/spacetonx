// GameOverScene - Tela de fim de jogo
class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.finalScore = data.score || 0;
    this.finalWave = data.wave || 1;
  }

  create() {
    const { width, height } = this.scale;

    // Fundo
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(Phaser.Math.FloatBetween(0.2, 0.8));
      star.speed = Phaser.Math.FloatBetween(0.2, 1);
      this.stars.push(star);
    }

    // GAME OVER
    this.add.text(width / 2, height * 0.2, 'GAME OVER', {
      fontSize: '40px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ff0044',
      stroke: '#440011',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0044', blur: 30, fill: true }
    }).setOrigin(0.5);

    // Score
    this.add.text(width / 2, height * 0.35, `PONTUAÇÃO:  ${this.finalScore}`, {
      fontSize: '22px',
      fontFamily: 'Courier New, monospace',
      color: '#00ffff',
      stroke: '#003344',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.42, `ONDA ALCANÇADA:  ${this.finalWave}`, {
      fontSize: '18px',
      fontFamily: 'Courier New, monospace',
      color: '#ff8800',
      stroke: '#442200',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Salvar high score
    const hiScore = parseInt(localStorage.getItem('space_hiscore') || '0', 10);
    if (this.finalScore > hiScore) {
      localStorage.setItem('space_hiscore', String(this.finalScore));
      this.add.text(width / 2, height * 0.5, '🏆 NOVO RECORDE!', {
        fontSize: '20px',
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#ffcc00',
        shadow: { offsetX: 0, offsetY: 0, color: '#ffcc00', blur: 15, fill: true }
      }).setOrigin(0.5);
    }

    this.add.text(width / 2, height * 0.57, `RECORDE: ${Math.max(hiScore, this.finalScore)}`, {
      fontSize: '14px',
      color: '#888'
    }).setOrigin(0.5);

    // Botão jogar de novo
    const btnReplay = this.add.text(width / 2, height * 0.7, '🔄  JOGAR NOVAMENTE', {
      fontSize: '20px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      backgroundColor: '#ff0044',
      padding: { x: 24, y: 10 },
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0044', blur: 15, fill: false, stroke: true }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnReplay.on('pointerover', () => btnReplay.setStyle({ backgroundColor: '#ff3366' }));
    btnReplay.on('pointerout', () => btnReplay.setStyle({ backgroundColor: '#ff0044' }));
    btnReplay.on('pointerdown', () => this.scene.start('Game'));

    this.tweens.add({
      targets: btnReplay,
      scaleX: 1.05, scaleY: 1.05,
      duration: 700, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Botão menu
    const btnMenu = this.add.text(width / 2, height * 0.82, 'MENU PRINCIPAL', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaacc'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnMenu.on('pointerover', () => btnMenu.setColor('#ffffff'));
    btnMenu.on('pointerout', () => btnMenu.setColor('#aaaacc'));
    btnMenu.on('pointerdown', () => this.scene.start('Menu'));
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

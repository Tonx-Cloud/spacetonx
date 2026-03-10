// GameScene - Motor principal do jogo
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    // Carregar dados do jogador
    const shipStats = PlayerData.getShipStats();
    const weaponConfig = PlayerData.getWeaponConfig();

    this.score = 0;
    this.coinsEarned = 0;
    this.lives = PlayerData.getStartLives();
    this.wave = 1;
    this.fireLevel = 1;
    this.hasShield = PlayerData.hasStartShield();
    this.shieldTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.bossActive = false;
    this.lastFire = 0;
    this.fireRate = weaponConfig.fireRate;
    this.weaponConfig = weaponConfig;
    this.shipStats = shipStats;
    this.playerSpeed = shipStats.speed;
    this.touchTarget = null;
    this.enemiesKilled = 0;
    this.enemiesPerWave = 8;
    this.waveEnemiesSpawned = 0;
    this.waveComplete = false;
    this.spawnTimer = 0;
    this.isBossWave = false;
    this.hasMagnet = PlayerData.hasMagnet();
  }

  create() {
    const { width, height } = this.scale;

    // ===== FUNDO ESTRELADO COM PARALLAX =====
    this.bgStars = { far: [], mid: [], near: [] };

    for (let i = 0; i < 60; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(0.3).setScale(0.5);
      star.speed = 0.3;
      this.bgStars.far.push(star);
    }
    for (let i = 0; i < 40; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(0.6);
      star.speed = 0.8;
      this.bgStars.mid.push(star);
    }
    for (let i = 0; i < 20; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(1).setScale(1.5);
      star.speed = 1.5;
      this.bgStars.near.push(star);
    }

    // ===== GRUPOS DE OBJETOS =====
    this.playerBullets = this.physics.add.group({ maxSize: 50 });
    this.enemyBullets = this.physics.add.group({ maxSize: 80 });
    this.enemies = this.physics.add.group();
    this.powerUps = this.physics.add.group();
    this.coins = this.physics.add.group();

    // ===== JOGADOR (nave equipada) =====
    const shipKey = 'ship_' + PlayerData.get('equippedShip');
    this.player = this.physics.add.image(width / 2, height - 80, shipKey);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.body.setSize(30, 30);

    // Propulsão do jogador
    this.thrusterParticles = this.add.particles(0, 0, 'particle_fire', {
      follow: this.player,
      followOffset: { x: 0, y: 24 },
      speed: { min: 30, max: 80 },
      angle: { min: 75, max: 105 },
      scale: { start: 0.5, end: 0 },
      lifespan: 300,
      frequency: 40,
      tint: [0xff6600, 0xff4400, 0x00ccff],
      blendMode: 'ADD'
    });
    this.thrusterParticles.setDepth(9);

    // Escudo visual
    this.shieldSprite = this.add.image(this.player.x, this.player.y, 'shield');
    this.shieldSprite.setDepth(11);
    this.shieldSprite.setVisible(this.hasShield);
    this.shieldSprite.setBlendMode('ADD');

    // ===== CONTROLES =====
    // Teclado
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // Touch / Mouse
    this.input.on('pointerdown', (pointer) => {
      this.touchTarget = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown) {
        this.touchTarget = { x: pointer.x, y: pointer.y };
      }
    });
    this.input.on('pointerup', () => {
      this.touchTarget = null;
    });

    // ===== COLISÕES =====
    this.physics.add.overlap(this.playerBullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerHitByEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.playerHitByBullet, null, this);
    this.physics.add.overlap(this.player, this.powerUps, this.collectPowerUp, null, this);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, null, this);

    // ===== HUD =====
    this.scoreText = this.add.text(10, 10, 'SCORE: 0', {
      fontSize: '16px', fontFamily: 'Courier New, monospace',
      color: '#00ffff',
      stroke: '#003344', strokeThickness: 2
    }).setDepth(100).setScrollFactor(0);

    this.waveText = this.add.text(width - 10, 10, 'ONDA 1', {
      fontSize: '16px', fontFamily: 'Courier New, monospace',
      color: '#ff8800',
      stroke: '#442200', strokeThickness: 2
    }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    this.livesContainer = this.add.container(10, 36).setDepth(100).setScrollFactor(0);
    this.updateLivesDisplay();

    this.fireLevelText = this.add.text(10, 58, `🔫 ${this.weaponConfig.name}`, {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: '#ffcc00'
    }).setDepth(100).setScrollFactor(0);

    // HUD de moedas
    this.coinHudText = this.add.text(width - 10, 30, `🪙 ${this.coinsEarned}`, {
      fontSize: '14px', fontFamily: 'Courier New, monospace',
      color: '#ffcc00',
      stroke: '#332200', strokeThickness: 2
    }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    // ===== BOTÃO PAUSE =====
    this.pauseBtn = this.add.text(width / 2, 12, '⏸️', {
      fontSize: '22px'
    }).setOrigin(0.5, 0).setDepth(100).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => this.togglePause());

    // Overlay de pausa (inicialmente invisível)
    this.pauseOverlay = this.add.container(0, 0).setDepth(200).setVisible(false);

    const pauseBg = this.add.graphics();
    pauseBg.fillStyle(0x000000, 0.75);
    pauseBg.fillRect(0, 0, width, height);
    this.pauseOverlay.add(pauseBg);

    const pauseTitle = this.add.text(width / 2, height * 0.25, '⏸️ PAUSADO', {
      fontSize: '32px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);
    this.pauseOverlay.add(pauseTitle);

    const btnContinue = this.createPauseButton(width / 2, height * 0.42, '▶  CONTINUAR', () => {
      this.togglePause();
    });
    this.pauseOverlay.add(btnContinue);

    const btnShop = this.createPauseButton(width / 2, height * 0.54, '🛒  LOJA', () => {
      this.scene.start('Shop', { returnScene: 'Menu' });
    });
    this.pauseOverlay.add(btnShop);

    const btnMenu = this.createPauseButton(width / 2, height * 0.66, '🏠  MENU', () => {
      this.scene.start('Menu');
    });
    this.pauseOverlay.add(btnMenu);

    // ===== INICIAR PRIMEIRA ONDA =====
    this.startWave(1);

    // ===== ÁUDIO (Web Audio API) =====
    this.setupAudio();
  }

  // ==========================================
  //              SISTEMA DE ÁUDIO
  // ==========================================
  setupAudio() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.audioCtx = null;
    }
  }

  // ==========================================
  //              PAUSE
  // ==========================================
  createPauseButton(x, y, text, callback) {
    const btn = this.add.text(x, y, text, {
      fontSize: '20px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffffff',
      backgroundColor: '#ff0044',
      padding: { x: 24, y: 10 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', callback);
    return btn;
  }

  togglePause() {
    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    if (this.paused) {
      this.physics.pause();
      this.pauseBtn.setText('▶️');
    } else {
      this.physics.resume();
      this.pauseBtn.setText('⏸️');
    }
  }

  // ==========================================
  //          COLETA DE MOEDAS
  // ==========================================
  dropCoin(x, y) {
    const c = this.coins.create(x, y, 'coin');
    c.body.setVelocityY(80);
    this.tweens.add({
      targets: c,
      angle: 360,
      duration: 1500,
      repeat: -1
    });
  }

  collectCoin(player, coin) {
    coin.destroy();
    this.coinsEarned++;
    PlayerData.addCoins(1);
    this.coinHudText.setText(`🪙 ${this.coinsEarned}`);
    this.playSound('powerup');
  }

  playSound(type) {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'explosion':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'powerup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'hit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'wave':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(990, now + 0.4);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
    }
  }

  // ==========================================
  //        SISTEMA DE ONDAS / DIFICULDADE
  // ==========================================
  startWave(waveNum) {
    this.wave = waveNum;
    this.waveEnemiesSpawned = 0;
    this.enemiesKilled = 0;
    this.waveComplete = false;
    this.isBossWave = (waveNum % 5 === 0); // Boss a cada 5 ondas

    // Dificuldade progressiva
    this.enemiesPerWave = 8 + Math.floor(waveNum * 1.5);
    this.spawnTimer = 0;

    // Anúncio de onda
    const { width, height } = this.scale;
    const waveLabel = this.isBossWave
      ? `⚠️ BOSS - ONDA ${waveNum}`
      : `ONDA ${waveNum}`;

    const announce = this.add.text(width / 2, height / 2 - 40, waveLabel, {
      fontSize: '28px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: this.isBossWave ? '#ff0044' : '#00ffff',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: {
        offsetX: 0, offsetY: 0,
        color: this.isBossWave ? '#ff0044' : '#00ffff',
        blur: 30, fill: true
      }
    }).setOrigin(0.5).setDepth(200);

    this.tweens.add({
      targets: announce,
      alpha: 0,
      y: height / 2 - 80,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => announce.destroy()
    });

    this.waveText.setText(`ONDA ${waveNum}`);
    this.playSound('wave');
  }

  getSpawnInterval() {
    // Intervalo entre spawns diminui com a dificuldade
    return Math.max(300, 1500 - this.wave * 80);
  }

  getEnemySpeed() {
    // Velocidade dos inimigos aumenta
    return 80 + this.wave * 12;
  }

  getEnemyType() {
    if (this.isBossWave && this.waveEnemiesSpawned === 0) return 'boss';
    const roll = Math.random();
    if (this.wave < 3) return 'enemy1';
    if (this.wave < 6) return roll < 0.6 ? 'enemy1' : 'enemy2';
    if (roll < 0.4) return 'enemy1';
    if (roll < 0.7) return 'enemy2';
    return 'enemy3';
  }

  // ==========================================
  //           PADRÕES DE MOVIMENTO
  // ==========================================
  getMovementPattern() {
    if (this.wave <= 2) {
      // Ondas 1-2: só desce reto
      return 'straight';
    }
    const patterns = ['straight', 'zigzag', 'sine_wide', 'dive'];
    if (this.wave >= 5) patterns.push('spiral', 'swoop');
    if (this.wave >= 8) patterns.push('figure8');
    return Phaser.Utils.Array.GetRandom(patterns);
  }

  applyMovementPattern(enemy, delta) {
    enemy._time = (enemy._time || 0) + delta * 0.001;
    const speed = enemy._speed || 100;

    switch (enemy._pattern) {
      case 'straight':
        // Desce reto
        break;

      case 'zigzag':
        // Zigue-zague clássico
        enemy.body.setVelocityX(Math.sin(enemy._time * 4) * 150);
        break;

      case 'sine_wide':
        // Onda senoidal ampla
        enemy.body.setVelocityX(Math.sin(enemy._time * 2) * 200);
        break;

      case 'dive':
        // Mergulha em direção ao jogador
        if (enemy._time > 1 && !enemy._diving) {
          enemy._diving = true;
          const angle = Phaser.Math.Angle.Between(
            enemy.x, enemy.y, this.player.x, this.player.y
          );
          enemy.body.setVelocity(
            Math.cos(angle) * speed * 2,
            Math.sin(angle) * speed * 2
          );
        }
        break;

      case 'spiral':
        enemy.body.setVelocityX(Math.cos(enemy._time * 3) * 180);
        enemy.body.setVelocityY(speed + Math.sin(enemy._time * 3) * 60);
        break;

      case 'swoop':
        // Entra pelo lado e faz curva
        const swoopPhase = enemy._time * 2;
        enemy.body.setVelocityX(Math.cos(swoopPhase) * 200);
        break;

      case 'figure8':
        enemy.body.setVelocityX(Math.sin(enemy._time * 2) * 200);
        enemy.body.setVelocityY(speed + Math.cos(enemy._time * 4) * 50);
        break;
    }
  }

  // ==========================================
  //            SPAWN DE INIMIGOS
  // ==========================================
  spawnEnemy() {
    const { width } = this.scale;
    const type = this.getEnemyType();

    if (type === 'boss') {
      this.spawnBoss();
      return;
    }

    const enemy = this.enemies.create(
      Phaser.Math.Between(30, width - 30),
      -40,
      type
    );

    const speed = this.getEnemySpeed();
    enemy.body.setVelocityY(speed);
    enemy._speed = speed;
    enemy._type = type;
    enemy._pattern = this.getMovementPattern();
    enemy._time = 0;
    enemy._canShoot = this.wave >= 3;
    enemy._shootTimer = Phaser.Math.Between(500, 2000);
    enemy._diving = false;

    // HP baseado no tipo
    switch (type) {
      case 'enemy1': enemy._hp = 1; enemy._score = 100; break;
      case 'enemy2': enemy._hp = 2; enemy._score = 200; break;
      case 'enemy3': enemy._hp = 4; enemy._score = 400; break;
    }

    // HP escala com a onda
    enemy._hp = Math.ceil(enemy._hp * (1 + (this.wave - 1) * 0.15));

    this.waveEnemiesSpawned++;
  }

  spawnBoss() {
    const { width } = this.scale;
    const boss = this.enemies.create(width / 2, -60, 'boss');
    boss.body.setVelocityY(40);
    boss._type = 'boss';
    boss._pattern = 'zigzag';
    boss._time = 0;
    boss._speed = 40;
    boss._hp = 30 + this.wave * 10;
    boss._maxHp = boss._hp;
    boss._score = 5000;
    boss._canShoot = true;
    boss._shootTimer = 0;
    boss._diving = false;

    this.bossActive = true;
    this.waveEnemiesSpawned = this.enemiesPerWave; // Boss conta como toda a wave

    // Barra de vida do boss
    boss._hpBar = this.add.graphics().setDepth(100);
    this.updateBossHpBar(boss);
  }

  updateBossHpBar(boss) {
    if (!boss._hpBar || !boss.active) return;
    boss._hpBar.clear();
    const { width } = this.scale;
    const barWidth = width - 40;
    const pct = boss._hp / boss._maxHp;

    boss._hpBar.fillStyle(0x330000, 0.8);
    boss._hpBar.fillRect(20, 80, barWidth, 10);
    boss._hpBar.fillStyle(pct > 0.3 ? 0xff0044 : 0xff0000, 1);
    boss._hpBar.fillRect(20, 80, barWidth * pct, 10);
    boss._hpBar.lineStyle(1, 0xff4466, 0.8);
    boss._hpBar.strokeRect(20, 80, barWidth, 10);
  }

  // ==========================================
  //           TIRO DO JOGADOR
  // ==========================================
  firePlayerBullet() {
    const now = this.time.now;
    if (now - this.lastFire < this.fireRate) return;
    this.lastFire = now;

    const x = this.player.x;
    const y = this.player.y - 20;
    const wc = this.weaponConfig;
    const bulletKey = wc.bulletKey || 'bullet_player';

    const shootBullet = (offsetX, angle) => {
      const bullet = this.playerBullets.get(x + offsetX, y, bulletKey);
      if (!bullet) return;
      bullet.setActive(true).setVisible(true);
      bullet.body.enable = true;
      const speed = -500;
      bullet.body.setVelocity(
        Math.sin(angle) * Math.abs(speed) * 0.3,
        speed
      );
      bullet._damage = wc.damage || 1;
      bullet.setDepth(8);
    };

    if (wc.pattern === 'spread') {
      // Spread: sempre atira em leque (3-5 tiros conforme fireLevel)
      const count = Math.min(2 + this.fireLevel, 5);
      const arc = 0.4; // amplitude do leque
      for (let i = 0; i < count; i++) {
        const angle = -arc + (arc * 2 / (count - 1)) * i;
        shootBullet(0, count === 1 ? 0 : angle);
      }
    } else if (wc.pattern === 'plasma') {
      // Plasma: tiro único poderoso (escala com fireLevel)
      const bullet = this.playerBullets.get(x, y, bulletKey);
      if (!bullet) return;
      bullet.setActive(true).setVisible(true);
      bullet.body.enable = true;
      bullet.body.setVelocity(0, -350);
      bullet._damage = wc.damage + Math.floor(this.fireLevel / 2);
      bullet.setDepth(8);
      bullet.setScale(1 + this.fireLevel * 0.15);
    } else {
      // Laser (padrão): baseado no fireLevel
      switch (this.fireLevel) {
        case 1:
          shootBullet(0, 0);
          break;
        case 2:
          shootBullet(-8, 0);
          shootBullet(8, 0);
          break;
        case 3:
          shootBullet(-8, 0);
          shootBullet(8, 0);
          shootBullet(0, -0.15);
          break;
        case 4:
          shootBullet(-12, -0.1);
          shootBullet(-4, 0);
          shootBullet(4, 0);
          shootBullet(12, 0.1);
          break;
        case 5:
          shootBullet(-16, -0.2);
          shootBullet(-8, -0.1);
          shootBullet(0, 0);
          shootBullet(8, 0.1);
          shootBullet(16, 0.2);
          break;
      }
    }

    this.playSound('shoot');
  }

  // ==========================================
  //           TIRO DOS INIMIGOS
  // ==========================================
  enemyShoot(enemy) {
    if (!enemy._canShoot || this.gameOver) return;

    const texKey = enemy._type === 'boss' ? 'bullet_boss' : 'bullet_enemy';
    const speed = enemy._type === 'boss' ? 250 : 180;

    if (enemy._type === 'boss') {
      // Boss atira em leque
      for (let a = -0.4; a <= 0.4; a += 0.2) {
        const b = this.enemyBullets.get(enemy.x, enemy.y + 30, texKey);
        if (!b) continue;
        b.setActive(true).setVisible(true);
        b.body.enable = true;
        b.body.setVelocity(Math.sin(a) * speed, speed);
      }
    } else {
      // Inimigo normal atira pra baixo
      const angle = Phaser.Math.Angle.Between(
        enemy.x, enemy.y, this.player.x, this.player.y
      );
      const b = this.enemyBullets.get(enemy.x, enemy.y + 15, texKey);
      if (!b) return;
      b.setActive(true).setVisible(true);
      b.body.enable = true;
      b.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
  }

  // ==========================================
  //             COLISÕES
  // ==========================================
  hitEnemy(bullet, enemy) {
    const dmg = bullet._damage || 1;
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    bullet.setScale(1); // reset escala plasma

    enemy._hp -= dmg;

    // Flash branco ao ser atingido
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (enemy.active) enemy.clearTint();
    });

    if (enemy._hp <= 0) {
      this.destroyEnemy(enemy);
    } else if (enemy._type === 'boss') {
      this.updateBossHpBar(enemy);
    }
  }

  destroyEnemy(enemy) {
    // Explosão de partículas
    const colors = enemy._type === 'boss'
      ? [0xff0044, 0xff6600, 0xffff00, 0xff00ff]
      : [0xff4400, 0xff8800, 0xffcc00];

    this.add.particles(enemy.x, enemy.y, 'particle', {
      speed: { min: 50, max: enemy._type === 'boss' ? 300 : 150 },
      scale: { start: 0.8, end: 0 },
      lifespan: { min: 200, max: enemy._type === 'boss' ? 800 : 400 },
      quantity: enemy._type === 'boss' ? 60 : 15,
      tint: colors,
      blendMode: 'ADD',
      emitting: false
    }).explode();

    this.score += enemy._score;
    this.scoreText.setText(`SCORE: ${this.score}`);

    // Drop de moedas (baseado no tipo)
    const coinCount = enemy._type === 'boss' ? 15 : (enemy._type === 'enemy3' ? 3 : (enemy._type === 'enemy2' ? 2 : 1));
    for (let i = 0; i < coinCount; i++) {
      this.dropCoin(enemy.x + Phaser.Math.Between(-20, 20), enemy.y + Phaser.Math.Between(-10, 10));
    }

    // Chance de dropar power-up
    if (Math.random() < 0.2) {
      this.dropPowerUp(enemy.x, enemy.y);
    }

    // Limpar barra de HP do boss
    if (enemy._type === 'boss' && enemy._hpBar) {
      enemy._hpBar.destroy();
      this.bossActive = false;
    }

    enemy.destroy();
    this.enemiesKilled++;

    this.playSound('explosion');

    // Verificar se a onda acabou
    this.checkWaveComplete();
  }

  playerHitByEnemy(player, enemy) {
    this.applyDamage();
    if (enemy._type !== 'boss') {
      this.destroyEnemy(enemy);
    }
  }

  playerHitByBullet(player, bullet) {
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    this.applyDamage();
  }

  applyDamage() {
    if (this.hasShield) {
      this.hasShield = false;
      this.shieldSprite.setVisible(false);
      this.playSound('hit');

      // Flash do escudo quebrando
      this.cameras.main.flash(200, 0, 255, 200);
      return;
    }

    this.lives--;
    this.updateLivesDisplay();
    this.playSound('hit');

    // Invencibilidade temporá
    this.player.setAlpha(0.4);
    this.physics.world.removeCollider(this.physics.world.colliders.getActive()
      .find(c => c.object1 === this.player || c.object2 === this.player));

    // Flash vermelho
    this.cameras.main.flash(300, 255, 0, 0);
    this.cameras.main.shake(200, 0.01);

    this.time.delayedCall(1500, () => {
      if (!this.gameOver) {
        this.player.setAlpha(1);
        // Recria colisões
        this.physics.add.overlap(this.player, this.enemies, this.playerHitByEnemy, null, this);
        this.physics.add.overlap(this.player, this.enemyBullets, this.playerHitByBullet, null, this);
      }
    });

    if (this.lives <= 0) {
      this.triggerGameOver();
    }
  }

  // ==========================================
  //             POWER-UPS
  // ==========================================
  dropPowerUp(x, y) {
    const types = ['powerup_shield', 'powerup_fire', 'powerup_life'];
    const weights = [0.35, 0.45, 0.2];
    let roll = Math.random();
    let type = types[0];
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { type = types[i]; break; }
    }

    const pu = this.powerUps.create(x, y, type);
    pu.body.setVelocityY(60);
    pu._type = type;

    // Efeito pulsante
    this.tweens.add({
      targets: pu,
      scale: 1.3,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  collectPowerUp(player, powerUp) {
    const type = powerUp._type;
    powerUp.destroy();
    this.playSound('powerup');

    switch (type) {
      case 'powerup_shield':
        this.hasShield = true;
        this.shieldSprite.setVisible(true);
        this.showPowerUpText('ESCUDO!', '#00ffcc');
        break;
      case 'powerup_fire':
        this.fireLevel = Math.min(5, this.fireLevel + 1);
        this.fireRate = Math.max(80, this.weaponConfig.fireRate - this.fireLevel * 15);
        this.fireLevelText.setText(`🔫 ${this.weaponConfig.name} Nv.${this.fireLevel}`);
        this.showPowerUpText(`ARMA Nv.${this.fireLevel}!`, '#ffcc00');
        break;
      case 'powerup_life':
        this.lives = Math.min(5, this.lives + 1);
        this.updateLivesDisplay();
        this.showPowerUpText('+1 VIDA!', '#ff0066');
        break;
    }
  }

  showPowerUpText(msg, color) {
    const { width, height } = this.scale;
    const txt = this.add.text(width / 2, height / 2, msg, {
      fontSize: '22px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: color,
      stroke: '#000000',
      strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 0, color: color, blur: 20, fill: true }
    }).setOrigin(0.5).setDepth(200);

    this.tweens.add({
      targets: txt,
      y: height / 2 - 50,
      alpha: 0,
      duration: 1000,
      onComplete: () => txt.destroy()
    });
  }

  // ==========================================
  //              HUD
  // ==========================================
  updateLivesDisplay() {
    this.livesContainer.removeAll(true);
    for (let i = 0; i < this.lives; i++) {
      const heart = this.add.image(i * 22, 0, 'heart').setScale(0.8);
      this.livesContainer.add(heart);
    }
  }

  // ==========================================
  //           CHECAGEM DE ONDA
  // ==========================================
  checkWaveComplete() {
    const allSpawned = this.waveEnemiesSpawned >= this.enemiesPerWave;
    const allDead = this.enemies.countActive() === 0;

    if (allSpawned && allDead && !this.waveComplete) {
      this.waveComplete = true;
      this.time.delayedCall(1500, () => {
        if (!this.gameOver) {
          this.startWave(this.wave + 1);
        }
      });
    }
  }

  // ==========================================
  //           GAME OVER
  // ==========================================
  triggerGameOver() {
    this.gameOver = true;
    this.player.setVisible(false);
    this.thrusterParticles.stop();

    // Salvar hi-score
    if (this.score > PlayerData.hiScore) {
      PlayerData.hiScore = this.score;
    }

    // Explosão do jogador
    this.add.particles(this.player.x, this.player.y, 'particle', {
      speed: { min: 50, max: 250 },
      scale: { start: 1, end: 0 },
      lifespan: { min: 300, max: 800 },
      quantity: 40,
      tint: [0x00ccff, 0x0088ff, 0xffffff, 0xff4400],
      blendMode: 'ADD',
      emitting: false
    }).explode();

    this.cameras.main.shake(500, 0.02);
    this.cameras.main.flash(500, 255, 0, 0);

    this.time.delayedCall(2000, () => {
      this.scene.start('GameOver', {
        score: this.score,
        wave: this.wave,
        coins: this.coinsEarned
      });
    });
  }

  // ==========================================
  //           UPDATE LOOP
  // ==========================================
  update(time, delta) {
    if (this.gameOver || this.paused) return;

    const { width, height } = this.scale;

    // --- Parallax stars ---
    Object.values(this.bgStars).forEach(layer => {
      layer.forEach(star => {
        star.y += star.speed * (delta * 0.06);
        if (star.y > height + 5) {
          star.y = -5;
          star.x = Phaser.Math.Between(0, width);
        }
      });
    });

    // --- Movimento do jogador ---
    const speed = this.playerSpeed;
    let vx = 0, vy = 0;

    // Teclado
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx = speed;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -speed;
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy = speed;

    // Touch
    if (this.touchTarget) {
      const dx = this.touchTarget.x - this.player.x;
      const dy = this.touchTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
      }
    }

    this.player.body.setVelocity(vx, vy);

    // Escudo segue o jogador
    this.shieldSprite.setPosition(this.player.x, this.player.y);
    if (this.hasShield) {
      this.shieldSprite.rotation += 0.02;
    }

    // --- Tiro automático ---
    this.firePlayerBullet();

    // --- Spawn de inimigos ---
    if (!this.waveComplete && this.waveEnemiesSpawned < this.enemiesPerWave) {
      this.spawnTimer += delta;
      if (this.spawnTimer >= this.getSpawnInterval()) {
        this.spawnTimer = 0;
        this.spawnEnemy();
      }
    }

    // --- Atualizar inimigos ---
    this.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;

      // Aplicar padrão de movimento
      this.applyMovementPattern(enemy, delta);

      // Inimigo atira
      if (enemy._canShoot) {
        enemy._shootTimer -= delta;
        if (enemy._shootTimer <= 0) {
          this.enemyShoot(enemy);
          enemy._shootTimer = enemy._type === 'boss'
            ? Phaser.Math.Between(400, 800)
            : Phaser.Math.Between(1500, 3000 - this.wave * 100);
        }
      }

      // Remover se saiu da tela
      if (enemy.y > height + 60 || enemy.x < -60 || enemy.x > width + 60) {
        if (enemy._hpBar) enemy._hpBar.destroy();
        enemy.destroy();
        this.checkWaveComplete();
      }

      // Boss barra de vida
      if (enemy._type === 'boss' && enemy._hpBar) {
        this.updateBossHpBar(enemy);
        // Boss não sai da tela, fica oscilando
        if (enemy.y > 100) {
          enemy.body.setVelocityY(0);
          enemy.body.setVelocityX(Math.sin(enemy._time * 2) * 120);
        }
      }
    });

    // --- Limpar balas fora da tela ---
    this.playerBullets.getChildren().forEach(b => {
      if (b.active && (b.y < -20 || b.y > height + 20)) {
        b.setActive(false).setVisible(false);
        b.body.enable = false;
      }
    });

    this.enemyBullets.getChildren().forEach(b => {
      if (b.active && (b.y < -20 || b.y > height + 20 || b.x < -20 || b.x > width + 20)) {
        b.setActive(false).setVisible(false);
        b.body.enable = false;
      }
    });

    // --- Power-ups fora da tela ---
    this.powerUps.getChildren().forEach(pu => {
      if (pu.active && pu.y > height + 30) {
        pu.destroy();
      }
    });

    // --- Moedas: magnetismo + fora da tela ---
    this.coins.getChildren().forEach(c => {
      if (!c.active) return;
      if (c.y > height + 30) { c.destroy(); return; }
      // Magnetismo atrai moedas ao jogador
      if (this.hasMagnet) {
        const dx = this.player.x - c.x;
        const dy = this.player.y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const pull = 200;
          c.body.setVelocity((dx / dist) * pull, (dy / dist) * pull);
        }
      }
    });
  }
}

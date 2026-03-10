// BootScene - Gera todos os assets proceduralmente (sem arquivos externos)
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.generatePlayerShips();
    this.generateEnemyShips();
    this.generateBullets();
    this.generatePowerUps();
    this.generateParticles();
    this.generateUI();
    this.generateCoin();

    this.scene.start('Menu');
  }

  // ========== NAVES DO JOGADOR (3 modelos) ==========
  generatePlayerShips() {
    // --- FALCON (azul, padrão) ---
    const g = this.make.graphics({ add: false });
    g.fillStyle(0x00ccff, 1);
    g.fillTriangle(24, 0, 0, 48, 48, 48);
    g.fillStyle(0x0088cc, 1);
    g.fillTriangle(24, 8, 8, 44, 40, 44);
    g.fillStyle(0x00ffff, 1);
    g.fillCircle(24, 20, 5);
    g.fillStyle(0x0066aa, 1);
    g.fillTriangle(0, 48, -8, 56, 12, 48);
    g.fillTriangle(48, 48, 56, 56, 36, 48);
    g.fillStyle(0xff6600, 1);
    g.fillRect(10, 46, 6, 6);
    g.fillRect(32, 46, 6, 6);
    g.lineStyle(1, 0x00ffff, 0.6);
    g.strokeTriangle(24, 0, 0, 48, 48, 48);
    g.generateTexture('ship_falcon', 56, 56);
    g.generateTexture('player', 56, 56); // retrocompat
    g.destroy();

    // --- VIPER (vermelha, rápida) ---
    const v = this.make.graphics({ add: false });
    // Corpo esguio
    v.fillStyle(0xff2244, 1);
    v.fillTriangle(24, 0, 4, 52, 44, 52);
    v.fillStyle(0xcc1133, 1);
    v.fillTriangle(24, 6, 10, 48, 38, 48);
    // Cockpit
    v.fillStyle(0xff6677, 1);
    v.fillCircle(24, 18, 4);
    // Asas finas e longas
    v.fillStyle(0xdd0022, 1);
    v.fillTriangle(4, 40, -12, 54, 14, 44);
    v.fillTriangle(44, 40, 60, 54, 34, 44);
    // Propulsores  
    v.fillStyle(0xff8800, 1);
    v.fillRect(14, 50, 4, 6);
    v.fillRect(30, 50, 4, 6);
    // Detalhe neon
    v.lineStyle(1, 0xff4466, 0.7);
    v.strokeTriangle(24, 0, 4, 52, 44, 52);
    // Listras racing
    v.lineStyle(1, 0xffcc00, 0.4);
    v.lineBetween(24, 4, 24, 46);
    v.generateTexture('ship_viper', 60, 58);
    v.destroy();

    // --- TITAN (verde, tanque) ---
    const t = this.make.graphics({ add: false });
    // Corpo largo e robusto
    t.fillStyle(0x22ff66, 1);
    t.fillRoundedRect(4, 8, 48, 44, 6);
    t.fillStyle(0x11cc44, 1);
    t.fillTriangle(28, 0, 10, 16, 46, 16);
    // Armadura lateral
    t.fillStyle(0x119933, 1);
    t.fillRect(0, 14, 8, 32);
    t.fillRect(48, 14, 8, 32);
    // Cockpit 
    t.fillStyle(0x88ffaa, 1);
    t.fillCircle(28, 24, 6);
    t.fillStyle(0x44ff88, 1);
    t.fillCircle(28, 24, 3);
    // Propulsores (3)
    t.fillStyle(0xff6600, 1);
    t.fillRect(12, 50, 6, 6);
    t.fillRect(25, 50, 6, 6);
    t.fillRect(38, 50, 6, 6);
    // Contorno
    t.lineStyle(2, 0x44ff88, 0.5);
    t.strokeRoundedRect(4, 8, 48, 44, 6);
    t.generateTexture('ship_titan', 56, 56);
    t.destroy();

    // Escudo (reutilizável)
    const sg = this.make.graphics({ add: false });
    sg.lineStyle(2, 0x00ffcc, 0.5);
    sg.strokeCircle(30, 30, 30);
    sg.lineStyle(1, 0x00ffcc, 0.2);
    sg.strokeCircle(30, 30, 34);
    sg.generateTexture('shield', 68, 68);
    sg.destroy();
  }

  // ========== NAVES INIMIGAS ==========
  generateEnemyShips() {
    // Inimigo tipo 1 - Drone básico (vermelho)
    const e1 = this.make.graphics({ add: false });
    e1.fillStyle(0xff0044, 1);
    e1.fillTriangle(20, 40, 0, 0, 40, 0);
    e1.fillStyle(0xcc0033, 1);
    e1.fillTriangle(20, 32, 6, 4, 34, 4);
    e1.fillStyle(0xff6666, 1);
    e1.fillCircle(20, 14, 4);
    e1.lineStyle(1, 0xff0044, 0.5);
    e1.strokeTriangle(20, 40, 0, 0, 40, 0);
    e1.generateTexture('enemy1', 40, 40);
    e1.destroy();

    // Inimigo tipo 2 - Caça (laranja)
    const e2 = this.make.graphics({ add: false });
    e2.fillStyle(0xff8800, 1);
    e2.fillTriangle(22, 44, 0, 8, 44, 8);
    e2.fillStyle(0xcc6600, 1);
    e2.fillRect(8, 0, 28, 12);
    e2.fillStyle(0xffaa44, 1);
    e2.fillCircle(22, 16, 5);
    // Canhões laterais
    e2.fillStyle(0xff6600, 1);
    e2.fillRect(0, 4, 6, 20);
    e2.fillRect(38, 4, 6, 20);
    e2.lineStyle(1, 0xff8800, 0.5);
    e2.strokeTriangle(22, 44, 0, 8, 44, 8);
    e2.generateTexture('enemy2', 44, 44);
    e2.destroy();

    // Inimigo tipo 3 - Tanque (roxo) 
    const e3 = this.make.graphics({ add: false });
    e3.fillStyle(0x8800ff, 1);
    e3.fillRoundedRect(4, 4, 44, 44, 8);
    e3.fillStyle(0x6600cc, 1);
    e3.fillRoundedRect(10, 10, 32, 32, 6);
    e3.fillStyle(0xaa44ff, 1);
    e3.fillCircle(26, 26, 8);
    e3.fillStyle(0xff00ff, 1);
    e3.fillCircle(26, 26, 4);
    e3.lineStyle(2, 0xaa44ff, 0.6);
    e3.strokeRoundedRect(4, 4, 44, 44, 8);
    e3.generateTexture('enemy3', 52, 52);
    e3.destroy();

    // Boss
    const boss = this.make.graphics({ add: false });
    boss.fillStyle(0xff0066, 1);
    boss.fillRoundedRect(0, 10, 100, 60, 12);
    boss.fillStyle(0xcc0044, 1);
    boss.fillTriangle(50, 80, 20, 10, 80, 10);
    // Olhos do boss
    boss.fillStyle(0xffff00, 1);
    boss.fillCircle(30, 35, 8);
    boss.fillCircle(70, 35, 8);
    boss.fillStyle(0xff0000, 1);
    boss.fillCircle(30, 35, 4);
    boss.fillCircle(70, 35, 4);
    // Canhões
    boss.fillStyle(0xff4488, 1);
    boss.fillRect(0, 55, 12, 20);
    boss.fillRect(88, 55, 12, 20);
    boss.fillRect(42, 70, 16, 15);
    boss.lineStyle(2, 0xff0066, 0.7);
    boss.strokeRoundedRect(0, 10, 100, 60, 12);
    boss.generateTexture('boss', 100, 85);
    boss.destroy();
  }

  // ========== PROJÉTEIS ==========
  generateBullets() {
    // Tiro do jogador (retrocompat)
    const b1 = this.make.graphics({ add: false });
    b1.fillStyle(0x00ffff, 1);
    b1.fillRoundedRect(1, 0, 6, 16, 3);
    b1.fillStyle(0xffffff, 1);
    b1.fillRoundedRect(2, 2, 4, 12, 2);
    b1.generateTexture('bullet_player', 8, 16);
    b1.generateTexture('bullet_laser', 8, 16); // Laser = mesmo visual ciano
    b1.destroy();

    // Bullet Spread (laranja, mais largo)
    const bs = this.make.graphics({ add: false });
    bs.fillStyle(0xff8800, 1);
    bs.fillRoundedRect(0, 0, 8, 12, 3);
    bs.fillStyle(0xffcc44, 1);
    bs.fillRoundedRect(1, 1, 6, 10, 2);
    bs.generateTexture('bullet_spread', 8, 12);
    bs.destroy();

    // Bullet Plasma (roxo, grande e brilhante)
    const bp = this.make.graphics({ add: false });
    bp.fillStyle(0xaa00ff, 0.6);
    bp.fillCircle(8, 8, 8);
    bp.fillStyle(0xcc44ff, 1);
    bp.fillCircle(8, 8, 5);
    bp.fillStyle(0xffffff, 1);
    bp.fillCircle(8, 8, 2);
    bp.generateTexture('bullet_plasma', 16, 16);
    bp.destroy();

    // Tiro inimigo
    const b2 = this.make.graphics({ add: false });
    b2.fillStyle(0xff0044, 1);
    b2.fillCircle(5, 5, 5);
    b2.fillStyle(0xff6688, 1);
    b2.fillCircle(5, 5, 3);
    b2.generateTexture('bullet_enemy', 10, 10);
    b2.destroy();

    // Tiro do boss
    const b3 = this.make.graphics({ add: false });
    b3.fillStyle(0xff00ff, 1);
    b3.fillCircle(7, 7, 7);
    b3.fillStyle(0xff88ff, 1);
    b3.fillCircle(7, 7, 4);
    b3.generateTexture('bullet_boss', 14, 14);
    b3.destroy();
  }

  // ========== POWER-UPS ==========
  generatePowerUps() {
    // Escudo
    const pu1 = this.make.graphics({ add: false });
    pu1.fillStyle(0x00ff88, 0.3);
    pu1.fillCircle(14, 14, 14);
    pu1.lineStyle(2, 0x00ffcc, 1);
    pu1.strokeCircle(14, 14, 12);
    pu1.fillStyle(0x00ffcc, 1);
    pu1.fillTriangle(14, 5, 7, 20, 21, 20);
    pu1.generateTexture('powerup_shield', 28, 28);
    pu1.destroy();

    // Poder de fogo
    const pu2 = this.make.graphics({ add: false });
    pu2.fillStyle(0xff4400, 0.3);
    pu2.fillCircle(14, 14, 14);
    pu2.lineStyle(2, 0xff6600, 1);
    pu2.strokeCircle(14, 14, 12);
    pu2.fillStyle(0xff8800, 1);
    pu2.fillTriangle(14, 4, 6, 24, 22, 24);
    pu2.fillStyle(0xffcc00, 1);
    pu2.fillTriangle(14, 8, 9, 20, 19, 20);
    pu2.generateTexture('powerup_fire', 28, 28);
    pu2.destroy();

    // Vida
    const pu3 = this.make.graphics({ add: false });
    pu3.fillStyle(0xff0066, 0.3);
    pu3.fillCircle(14, 14, 14);
    pu3.lineStyle(2, 0xff0066, 1);
    pu3.strokeCircle(14, 14, 12);
    pu3.fillStyle(0xff0066, 1);
    // Coração simples
    pu3.fillCircle(10, 11, 4);
    pu3.fillCircle(18, 11, 4);
    pu3.fillTriangle(14, 22, 5, 14, 23, 14);
    pu3.generateTexture('powerup_life', 28, 28);
    pu3.destroy();
  }

  // ========== PARTÍCULAS ==========
  generateParticles() {
    // Partícula genérica (branca)
    const p = this.make.graphics({ add: false });
    p.fillStyle(0xffffff, 1);
    p.fillCircle(4, 4, 4);
    p.generateTexture('particle', 8, 8);
    p.destroy();

    // Partícula de fogo
    const pf = this.make.graphics({ add: false });
    pf.fillStyle(0xff6600, 1);
    pf.fillCircle(3, 3, 3);
    pf.generateTexture('particle_fire', 6, 6);
    pf.destroy();

    // Estrela de fundo
    const s = this.make.graphics({ add: false });
    s.fillStyle(0xffffff, 1);
    s.fillCircle(1, 1, 1);
    s.generateTexture('star', 3, 3);
    s.destroy();
  }

  // ========== UI ==========
  generateUI() {
    // Ícone de coração pra vida
    const h = this.make.graphics({ add: false });
    h.fillStyle(0xff0044, 1);
    h.fillCircle(8, 6, 5);
    h.fillCircle(16, 6, 5);
    h.fillTriangle(12, 18, 3, 8, 21, 8);
    h.generateTexture('heart', 24, 20);
    h.destroy();

    // Gerar ícones PWA simples (placeholder)
    const icon = this.make.graphics({ add: false });
    icon.fillStyle(0x000011, 1);
    icon.fillRect(0, 0, 192, 192);
    icon.fillStyle(0x00ccff, 1);
    icon.fillTriangle(96, 30, 40, 160, 152, 160);
    icon.fillStyle(0xff0044, 1);
    icon.fillCircle(96, 90, 20);
    icon.generateTexture('icon-192', 192, 192);
    icon.destroy();
  }

  // ========== MOEDA ==========
  generateCoin() {
    const g = this.make.graphics({ add: false });
    // Círculo dourado
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xffdd44, 1);
    g.fillCircle(10, 10, 7);
    // Símbolo $
    g.fillStyle(0xaa8800, 1);
    g.fillRect(8, 4, 4, 2);
    g.fillRect(6, 6, 4, 2);
    g.fillRect(8, 8, 4, 2);
    g.fillRect(10, 10, 4, 2);
    g.fillRect(8, 12, 4, 2);
    g.fillRect(8, 14, 4, 2);
    g.lineStyle(1, 0xffee88, 0.5);
    g.strokeCircle(10, 10, 9);
    g.generateTexture('coin', 20, 20);
    g.destroy();
  }
}

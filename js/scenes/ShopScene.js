// ShopScene - Loja de naves, armas e upgrades
class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  init(data) {
    this.returnScene = data.returnScene || 'Menu';
    this.activeTab = 'ships';
  }

  create() {
    const { width, height } = this.scale;

    // Fundo estrelado
    this.stars = [];
    for (let i = 0; i < 60; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star'
      ).setAlpha(Phaser.Math.FloatBetween(0.2, 0.8));
      star.speed = Phaser.Math.FloatBetween(0.2, 1);
      this.stars.push(star);
    }

    // Header
    this.add.text(width / 2, 20, '🛒 LOJA', {
      fontSize: '28px',
      fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffcc00',
      stroke: '#443300',
      strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 0, color: '#ffcc00', blur: 15, fill: true }
    }).setOrigin(0.5, 0).setDepth(10);

    // Moedas
    this.coinText = this.add.text(width / 2, 54, `🪙 ${PlayerData.coins}`, {
      fontSize: '18px',
      fontFamily: 'Courier New, monospace',
      color: '#ffdd00'
    }).setOrigin(0.5, 0).setDepth(10);

    // Abas
    const tabY = 82;
    const tabs = [
      { key: 'ships', label: '🚀 Naves' },
      { key: 'weapons', label: '🔫 Armas' },
      { key: 'upgrades', label: '⬆️ Upgrades' }
    ];
    const tabWidth = width / tabs.length;

    this.tabButtons = [];
    tabs.forEach((tab, i) => {
      const tx = tabWidth * i + tabWidth / 2;
      const btn = this.add.text(tx, tabY, tab.label, {
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        backgroundColor: this.activeTab === tab.key ? '#ff0044' : '#222244',
        padding: { x: 8, y: 6 },
        align: 'center'
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true }).setDepth(10);

      btn.on('pointerdown', () => {
        this.activeTab = tab.key;
        this.refreshShop();
      });

      this.tabButtons.push({ btn, key: tab.key });
    });

    // Container de itens (scrollável via listagem)
    this.itemContainer = this.add.container(0, 0).setDepth(5);

    // Botão voltar
    const btnBack = this.add.text(width / 2, height - 30, '← VOLTAR', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaacc',
      padding: { x: 16, y: 6 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(10);
    btnBack.on('pointerover', () => btnBack.setColor('#ffffff'));
    btnBack.on('pointerout', () => btnBack.setColor('#aaaacc'));
    btnBack.on('pointerdown', () => this.scene.start(this.returnScene));

    this.refreshShop();
  }

  refreshShop() {
    const { width } = this.scale;

    // Atualizar abas
    this.tabButtons.forEach(({ btn, key }) => {
      btn.setStyle({
        backgroundColor: this.activeTab === key ? '#ff0044' : '#222244'
      });
    });

    // Limpar itens antigos
    this.itemContainer.removeAll(true);

    // Atualizar moedas
    this.coinText.setText(`🪙 ${PlayerData.coins}`);

    const catalog = PlayerData.getShopCatalog();
    const startY = 118;

    if (this.activeTab === 'ships') {
      this.renderShips(catalog.ships, startY);
    } else if (this.activeTab === 'weapons') {
      this.renderWeapons(catalog.weapons, startY);
    } else {
      this.renderUpgrades(catalog.upgrades, startY);
    }
  }

  renderShips(ships, startY) {
    const { width } = this.scale;
    const equipped = PlayerData.get('equippedShip');

    ships.forEach((ship, i) => {
      const y = startY + i * 120;
      const owned = PlayerData.owns('ship', ship.id);
      const isEquipped = equipped === ship.id;

      // Card de fundo
      const card = this.add.graphics();
      card.fillStyle(isEquipped ? 0x003344 : 0x111133, 0.85);
      card.fillRoundedRect(12, y, width - 24, 108, 8);
      card.lineStyle(1, isEquipped ? 0x00ffff : 0x333366, 0.6);
      card.strokeRoundedRect(12, y, width - 24, 108, 8);
      this.itemContainer.add(card);

      // Preview da nave
      const texKey = 'ship_' + ship.id;
      const preview = this.add.image(60, y + 40, texKey).setScale(1.2);
      this.itemContainer.add(preview);

      // Nome e descrição
      const nameColor = owned ? '#ffffff' : '#888899';
      const nameText = this.add.text(105, y + 10, ship.name, {
        fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif', color: nameColor
      });
      this.itemContainer.add(nameText);

      const descText = this.add.text(105, y + 32, ship.desc, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#8888aa'
      });
      this.itemContainer.add(descText);

      const statsText = this.add.text(105, y + 48, ship.stats, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#ffcc00'
      });
      this.itemContainer.add(statsText);

      // Botão de ação
      if (isEquipped) {
        const eqLabel = this.add.text(width - 30, y + 76, '✓ EQUIPADA', {
          fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#00ffcc'
        }).setOrigin(1, 0.5);
        this.itemContainer.add(eqLabel);
      } else if (owned) {
        const eqBtn = this.createShopButton(width - 80, y + 68, 'EQUIPAR', '#0088cc', () => {
          PlayerData.equip('ship', ship.id);
          this.refreshShop();
        });
        this.itemContainer.add(eqBtn);
      } else {
        const buyBtn = this.createShopButton(width - 90, y + 68, `🪙 ${ship.price}`, '#ff6600', () => {
          if (PlayerData.spendCoins(ship.price)) {
            PlayerData.buy('ship', ship.id);
            PlayerData.equip('ship', ship.id);
            this.refreshShop();
          } else {
            this.showToast('Moedas insuficientes!');
          }
        });
        this.itemContainer.add(buyBtn);
      }
    });
  }

  renderWeapons(weapons, startY) {
    const { width } = this.scale;
    const equipped = PlayerData.get('equippedWeapon');

    weapons.forEach((weapon, i) => {
      const y = startY + i * 105;
      const owned = PlayerData.owns('weapon', weapon.id);
      const isEquipped = equipped === weapon.id;

      const card = this.add.graphics();
      card.fillStyle(isEquipped ? 0x332200 : 0x111133, 0.85);
      card.fillRoundedRect(12, y, width - 24, 92, 8);
      card.lineStyle(1, isEquipped ? 0xff8800 : 0x333366, 0.6);
      card.strokeRoundedRect(12, y, width - 24, 92, 8);
      this.itemContainer.add(card);

      // Preview do projétil
      const texKey = 'bullet_' + weapon.id;
      const preview = this.add.image(50, y + 36, texKey).setScale(2);
      this.itemContainer.add(preview);

      const nameText = this.add.text(85, y + 10, weapon.name, {
        fontSize: '18px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: owned ? '#ffffff' : '#888899'
      });
      this.itemContainer.add(nameText);

      const descText = this.add.text(85, y + 32, weapon.desc, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#8888aa'
      });
      this.itemContainer.add(descText);

      if (isEquipped) {
        const eqLabel = this.add.text(width - 30, y + 64, '✓ EQUIPADA', {
          fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ff8800'
        }).setOrigin(1, 0.5);
        this.itemContainer.add(eqLabel);
      } else if (owned) {
        const eqBtn = this.createShopButton(width - 80, y + 56, 'EQUIPAR', '#0088cc', () => {
          PlayerData.equip('weapon', weapon.id);
          this.refreshShop();
        });
        this.itemContainer.add(eqBtn);
      } else {
        const buyBtn = this.createShopButton(width - 90, y + 56, `🪙 ${weapon.price}`, '#ff6600', () => {
          if (PlayerData.spendCoins(weapon.price)) {
            PlayerData.buy('weapon', weapon.id);
            PlayerData.equip('weapon', weapon.id);
            this.refreshShop();
          } else {
            this.showToast('Moedas insuficientes!');
          }
        });
        this.itemContainer.add(buyBtn);
      }
    });
  }

  renderUpgrades(upgrades, startY) {
    const { width } = this.scale;

    upgrades.forEach((upg, i) => {
      const y = startY + i * 100;
      const currentLevel = PlayerData.get(upg.id) || 0;
      const maxed = currentLevel >= upg.maxLevel;
      const nextPrice = upg.pricePerLevel * (currentLevel + 1);

      const card = this.add.graphics();
      card.fillStyle(maxed ? 0x222200 : 0x111133, 0.85);
      card.fillRoundedRect(12, y, width - 24, 88, 8);
      card.lineStyle(1, maxed ? 0xffcc00 : 0x333366, 0.6);
      card.strokeRoundedRect(12, y, width - 24, 88, 8);
      this.itemContainer.add(card);

      // Ícone
      const iconText = this.add.text(36, y + 20, upg.icon, {
        fontSize: '28px'
      }).setOrigin(0.5);
      this.itemContainer.add(iconText);

      // Nome
      const nameText = this.add.text(65, y + 8, upg.name, {
        fontSize: '16px', fontFamily: 'Impact, Arial Black, sans-serif', color: '#ffffff'
      });
      this.itemContainer.add(nameText);

      // Descrição
      const descText = this.add.text(65, y + 28, upg.desc, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8888aa'
      });
      this.itemContainer.add(descText);

      // Nível (barrinhas)
      const levelStr = '■'.repeat(currentLevel) + '□'.repeat(upg.maxLevel - currentLevel);
      const levelText = this.add.text(65, y + 44, `Nv. ${currentLevel}/${upg.maxLevel}  ${levelStr}`, {
        fontSize: '12px', fontFamily: 'Courier New, monospace', color: '#ffcc00'
      });
      this.itemContainer.add(levelText);

      // Botão
      if (maxed) {
        const maxLabel = this.add.text(width - 30, y + 66, 'MÁXIMO', {
          fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ffcc00'
        }).setOrigin(1, 0.5);
        this.itemContainer.add(maxLabel);
      } else {
        const buyBtn = this.createShopButton(width - 90, y + 58, `🪙 ${nextPrice}`, '#22aa44', () => {
          if (PlayerData.spendCoins(nextPrice)) {
            PlayerData.set(upg.id, currentLevel + 1);
            this.refreshShop();
          } else {
            this.showToast('Moedas insuficientes!');
          }
        });
        this.itemContainer.add(buyBtn);
      }
    });
  }

  createShopButton(x, y, text, bgColor, callback) {
    const btn = this.add.text(x, y, text, {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      backgroundColor: bgColor,
      padding: { x: 10, y: 5 }
    }).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', callback);
    return btn;
  }

  showToast(msg) {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height - 60, msg, {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#ff4444',
      backgroundColor: '#220000',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: height - 90,
      duration: 1500,
      onComplete: () => toast.destroy()
    });
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

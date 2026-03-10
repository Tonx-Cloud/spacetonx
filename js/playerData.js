// PlayerData - Persistência de dados do jogador (localStorage)
const PlayerData = (() => {
  const STORAGE_KEY = 'spaceton_save';

  const DEFAULTS = {
    coins: 0,
    hiScore: 0,
    // Naves: falcon (grátis), viper, titan
    ownedShips: ['falcon'],
    equippedShip: 'falcon',
    // Armas: laser (grátis), spread, plasma
    ownedWeapons: ['laser'],
    equippedWeapon: 'laser',
    // Upgrades (nível 0 = não comprado)
    upgradeFireRate: 0,    // 0-3
    upgradeExtraLife: 0,   // 0-2
    upgradeMagnet: 0,      // 0-1
    upgradeStartShield: 0  // 0-1
  };

  let data = {};

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = Object.assign({}, DEFAULTS, parsed);
      } else {
        data = Object.assign({}, DEFAULTS);
      }
      // Migrar hiScore antigo
      const oldHi = parseInt(localStorage.getItem('space_hiscore') || '0', 10);
      if (oldHi > data.hiScore) data.hiScore = oldHi;
    } catch (e) {
      data = Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem('space_hiscore', String(data.hiScore));
    } catch (e) { /* quota */ }
  }

  function get(key) { return data[key]; }

  function set(key, value) {
    data[key] = value;
    save();
  }

  function addCoins(amount) {
    data.coins = (data.coins || 0) + amount;
    save();
  }

  function spendCoins(amount) {
    if (data.coins < amount) return false;
    data.coins -= amount;
    save();
    return true;
  }

  function owns(type, id) {
    if (type === 'ship') return data.ownedShips.includes(id);
    if (type === 'weapon') return data.ownedWeapons.includes(id);
    return false;
  }

  function buy(type, id) {
    if (type === 'ship' && !data.ownedShips.includes(id)) {
      data.ownedShips.push(id);
    }
    if (type === 'weapon' && !data.ownedWeapons.includes(id)) {
      data.ownedWeapons.push(id);
    }
    save();
  }

  function equip(type, id) {
    if (type === 'ship') data.equippedShip = id;
    if (type === 'weapon') data.equippedWeapon = id;
    save();
  }

  // Retorna stats da nave equipada
  function getShipStats() {
    const ships = {
      falcon: { name: 'Falcon', speed: 300, lives: 3, color: 0x00ccff },
      viper:  { name: 'Viper',  speed: 400, lives: 2, color: 0xff2244 },
      titan:  { name: 'Titan',  speed: 220, lives: 5, color: 0x22ff66 }
    };
    return ships[data.equippedShip] || ships.falcon;
  }

  // Retorna config da arma equipada
  function getWeaponConfig() {
    const weapons = {
      laser:  { name: 'Laser',  bulletKey: 'bullet_laser',  fireRate: 200, damage: 1, pattern: 'straight' },
      spread: { name: 'Spread', bulletKey: 'bullet_spread', fireRate: 280, damage: 1, pattern: 'spread' },
      plasma: { name: 'Plasma', bulletKey: 'bullet_plasma', fireRate: 400, damage: 2, pattern: 'plasma' }
    };
    const w = weapons[data.equippedWeapon] || weapons.laser;
    // Aplicar upgrade de fire rate
    const frLevel = data.upgradeFireRate || 0;
    w.fireRate = Math.max(80, w.fireRate - frLevel * 30);
    return w;
  }

  function getStartLives() {
    const base = getShipStats().lives;
    return base + (data.upgradeExtraLife || 0);
  }

  function hasMagnet() { return (data.upgradeMagnet || 0) >= 1; }
  function hasStartShield() { return (data.upgradeStartShield || 0) >= 1; }

  // Catálogo da loja
  function getShopCatalog() {
    return {
      ships: [
        { id: 'falcon', name: 'Falcon', desc: 'Equilibrada', price: 0, stats: 'SPD ★★★ HP ★★★' },
        { id: 'viper',  name: 'Viper',  desc: 'Veloz e frágil', price: 500, stats: 'SPD ★★★★★ HP ★★' },
        { id: 'titan',  name: 'Titan',  desc: 'Tanque blindado', price: 800, stats: 'SPD ★★ HP ★★★★★' }
      ],
      weapons: [
        { id: 'laser',  name: 'Laser',  desc: 'Tiro reto padrão', price: 0 },
        { id: 'spread', name: 'Spread', desc: 'Tiros em leque', price: 600 },
        { id: 'plasma', name: 'Plasma', desc: 'Alta potência, lento', price: 900 }
      ],
      upgrades: [
        { id: 'upgradeFireRate',    name: 'Cad. de Tiro',  desc: 'Dispara mais rápido', pricePerLevel: 300, maxLevel: 3, icon: '🔫' },
        { id: 'upgradeExtraLife',   name: 'Vida Extra',    desc: '+1 vida inicial', pricePerLevel: 400, maxLevel: 2, icon: '❤️' },
        { id: 'upgradeMagnet',      name: 'Magnetismo',    desc: 'Atrai itens e moedas', pricePerLevel: 700, maxLevel: 1, icon: '🧲' },
        { id: 'upgradeStartShield', name: 'Escudo Inicial',desc: 'Começa com escudo', pricePerLevel: 500, maxLevel: 1, icon: '🛡️' }
      ]
    };
  }

  // Inicializar
  load();

  return {
    load, save, get, set, addCoins, spendCoins, owns, buy, equip,
    getShipStats, getWeaponConfig, getStartLives, hasMagnet, hasStartShield,
    getShopCatalog,
    get coins() { return data.coins; },
    get hiScore() { return data.hiScore; },
    set hiScore(v) { data.hiScore = v; save(); }
  };
})();

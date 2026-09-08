const DEFAULT_AVATAR = 'https://i.imgur.com/8Q9Z5b3.png';

let state = {
  p1: { 
    id: f1.userId, 
    name: f1.name, 
    hp: f1.hp || 100, 
    maxHp: f1.maxHp || 100, 
    atk: f1.attack || 15, 
    def: f1.defense || 5, 
    level: f1.level || 1, 
    img: f1.imageUrl || message.author.displayAvatarURL({ extension: 'png' }) || DEFAULT_AVATAR, 
    guarding: false 
  },
  p2: { 
    id: f2.userId, 
    name: f2.name, 
    hp: f2.hp || 100, 
    maxHp: f2.maxHp || 100, 
    atk: f2.attack || 15, 
    def: f2.defense || 5, 
    level: f2.level || 1, 
    img: f2.imageUrl || opponent.displayAvatarURL({ extension: 'png' }) || DEFAULT_AVATAR, 
    guarding: false 
  },
  turn: f1.userId
};

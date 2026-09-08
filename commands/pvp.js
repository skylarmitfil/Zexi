let f1 = await Fighter.findOne({ userId: message.author.id });
if (!f1) {
  f1 = await Fighter.create({ userId: message.author.id, name: message.author.username });
}

let f2 = await Fighter.findOne({ userId: opponent.id });
if (!f2) {
  f2 = await Fighter.create({ userId: opponent.id, name: opponent.username });
}

// Fallback checks for existing MongoDB documents missing maxHp
const p1MaxHp = f1.maxHp || 100;
const p2MaxHp = f2.maxHp || 100;

let state = {
  p1: { 
    id: f1.userId, 
    name: f1.name, 
    hp: f1.hp || p1MaxHp, 
    maxHp: p1MaxHp, 
    atk: f1.attack || 15, 
    def: f1.defense || 5, 
    level: f1.level || 1, 
    img: f1.imageUrl || 'https://i.imgur.com/8Q9Z5b3.png', 
    guarding: false 
  },
  p2: { 
    id: f2.userId, 
    name: f2.name, 
    hp: f2.hp || p2MaxHp, 
    maxHp: p2MaxHp, 
    atk: f2.attack || 15, 
    def: f2.defense || 5, 
    level: f2.level || 1, 
    img: f2.imageUrl || 'https://i.imgur.com/8Q9Z5b3.png', 
    guarding: false 
  },
  turn: f1.userId
};

/**
 * Unit tests for /app/commands/nuke.js
 * Pure Node script with hand-built mocks. No Discord connection.
 */
const path = require('path');
const { PermissionsBitField, ChannelType } = require('discord.js');
const { loadCommands, commands } = require(path.join('/app', 'commandHandler'));

let passed = 0;
let failed = 0;
const results = [];

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
    results.push(`PASS: ${name}`);
  } else {
    failed++;
    results.push(`FAIL: ${name}${detail ? ' -- ' + detail : ''}`);
  }
}

function makePerms(flags = []) {
  const set = new Set(flags.map(f => f.toString()));
  return {
    has(flag) { return set.has(flag.toString()); }
  };
}

function makeChannel({ type = ChannelType.GuildText, isThread = false } = {}) {
  const cloned = {
    setPosition: jestlike(async () => cloned),
    send: jestlike(async () => ({ id: 'msg1' })),
    id: 'cloned-channel-id',
  };
  const channel = {
    type,
    rawPosition: 3,
    isThread: () => isThread,
    clone: jestlike(async () => cloned),
    delete: jestlike(async () => {}),
    send: jestlike(async () => ({})),
    _cloned: cloned,
  };
  return channel;
}

function jestlike(fn) {
  const spy = async (...args) => {
    spy.calls.push({ args, ts: process.hrtime.bigint() });
    return fn ? fn(...args) : undefined;
  };
  spy.calls = [];
  return spy;
}

// Builds a confirmation prompt mock. `confirm` = 'confirm' | 'cancel' | 'timeout'.
function makePrompt(confirm) {
  const interaction = {
    customId: confirm === 'cancel' ? 'nuke_cancel' : 'nuke_confirm',
    user: { id: 'user1' },
    update: jestlike(async () => ({})),
    deferUpdate: jestlike(async () => ({})),
  };
  const prompt = {
    _interaction: interaction,
    edit: jestlike(async () => ({})),
    awaitMessageComponent: async () => {
      if (confirm === 'timeout') throw new Error('timeout');
      return interaction;
    },
  };
  return prompt;
}

function makeMessage({ hasGuild = true, memberPerms = [], botPerms = [PermissionsBitField.Flags.ManageChannels], channelOpts = {}, confirm = 'confirm' } = {}) {
  const replySpy = jestlike(async () => ({}));
  const authorSendSpy = jestlike(async () => ({}));
  const channel = makeChannel(channelOpts);
  const prompt = makePrompt(confirm);
  channel.send = jestlike(async () => prompt); // channel.send returns the confirmation prompt
  const msg = {
    guild: hasGuild ? {
      id: 'guild1',
      members: { me: { permissions: makePerms(botPerms) } }
    } : null,
    member: { permissions: makePerms(memberPerms) },
    author: { id: 'user1', tag: 'User#0001', send: authorSendSpy },
    channel,
    reply: replySpy,
    _prompt: prompt,
  };
  return msg;
}

async function run() {
  // 1. Loading & registration
  loadCommands();
  const nuke = commands.get('nuke');
  assert(!!nuke, 'commands.get("nuke") is defined');
  assert(nuke && typeof nuke.execute === 'function', 'nuke.execute is a function');

  // Alias resolution mirroring index.js
  function lookup(name) {
    return commands.get(name) || [...commands.values()].find(cmd => cmd.aliases && cmd.aliases.includes(name));
  }
  assert(lookup('purgechannel') === nuke, 'alias "purgechannel" resolves to nuke');
  assert(lookup('nukechannel') === nuke, 'alias "nukechannel" resolves to nuke');

  // 2. Guild guard
  {
    const m = makeMessage({ hasGuild: false });
    await nuke.execute(m, []);
    assert(m.reply.calls.length === 1, 'DM guard replies once');
    assert(m.channel.clone.calls.length === 0 && m.channel.delete.calls.length === 0, 'DM guard did not clone/delete');
  }

  // 3. Permission gating
  const F = PermissionsBitField.Flags;
  for (const [label, memberPerms] of [
    ['neither', []],
    ['administrator only', [F.Administrator]],
    ['manageMessages only', [F.ManageMessages]],
  ]) {
    const m = makeMessage({ memberPerms });
    await nuke.execute(m, []);
    assert(m.reply.calls.length === 1, `member with ${label} replied with denial`);
    assert(m.channel.clone.calls.length === 0, `member with ${label} did not clone`);
    assert(m.channel.delete.calls.length === 0, `member with ${label} did not delete`);
  }

  // 4. Bot missing ManageChannels
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], botPerms: [] });
    await nuke.execute(m, []);
    assert(m.reply.calls.length === 1, 'bot missing ManageChannels replies');
    assert(m.channel.clone.calls.length === 0, 'bot missing ManageChannels does not clone');
    assert(m.channel.delete.calls.length === 0, 'bot missing ManageChannels does not delete');
  }

  // 5. Thread rejection
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], channelOpts: { isThread: true } });
    await nuke.execute(m, []);
    assert(m.reply.calls.length === 1, 'thread channel replies with rejection');
    assert(m.channel.clone.calls.length === 0, 'thread channel not cloned');
  }

  // 6. Non-text channel type rejection (voice = 2)
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], channelOpts: { type: ChannelType.GuildVoice } });
    await nuke.execute(m, []);
    assert(m.reply.calls.length === 1, 'voice channel replies with rejection');
    assert(m.channel.clone.calls.length === 0, 'voice channel not cloned');
  }

  // 7. Happy path — GuildText (with confirmation)
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], confirm: 'confirm' });
    await nuke.execute(m, []);
    assert(m.channel.send.calls.length === 1, 'happy path: confirmation prompt sent');
    assert(m.channel.clone.calls.length === 1, 'happy path: clone called once');
    assert(m.channel.delete.calls.length === 1, 'happy path: delete called once');
    assert(m.channel._cloned.send.calls.length === 1, 'happy path: cloned.send called once');
    assert(m._prompt._interaction.deferUpdate.calls.length === 1, 'happy path: interaction deferUpdate called');
    const cloneTs = m.channel.clone.calls[0].ts;
    const deleteTs = m.channel.delete.calls[0].ts;
    assert(cloneTs < deleteTs, 'happy path: clone called BEFORE delete');
    const sendArgs = m.channel._cloned.send.calls[0].args[0];
    assert(sendArgs && Array.isArray(sendArgs.embeds) && sendArgs.embeds.length === 1, 'happy path: cloned.send received an embed');
    const img = sendArgs.embeds[0].data && sendArgs.embeds[0].data.image && sendArgs.embeds[0].data.image.url;
    assert(typeof img === 'string' && img.endsWith('giphy.gif'), 'happy path: embed uses an animated .gif', img);
    assert(m.reply.calls.length === 0, 'happy path: no denial reply issued');
  }

  // 8. Happy path — GuildAnnouncement (type 5)
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], channelOpts: { type: ChannelType.GuildAnnouncement } });
    await nuke.execute(m, []);
    assert(m.channel.clone.calls.length === 1, 'announcement channel: clone called');
    assert(m.channel.delete.calls.length === 1, 'announcement channel: delete called');
  }

  // 9. Cancel button — must NOT nuke
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], confirm: 'cancel' });
    await nuke.execute(m, []);
    assert(m.channel.send.calls.length === 1, 'cancel: confirmation prompt sent');
    assert(m.channel.clone.calls.length === 0, 'cancel: did NOT clone');
    assert(m.channel.delete.calls.length === 0, 'cancel: did NOT delete');
    assert(m._prompt._interaction.update.calls.length === 1, 'cancel: interaction.update called to show cancelled');
  }

  // 10. Timeout (no response) — must NOT nuke
  {
    const m = makeMessage({ memberPerms: [F.Administrator, F.ManageMessages], confirm: 'timeout' });
    await nuke.execute(m, []);
    assert(m.channel.clone.calls.length === 0, 'timeout: did NOT clone');
    assert(m.channel.delete.calls.length === 0, 'timeout: did NOT delete');
    assert(m._prompt.edit.calls.length === 1, 'timeout: prompt edited to timed-out message');
  }

  console.log('\n===== TEST RESULTS =====');
  for (const r of results) console.log(r);
  console.log(`\nPassed: ${passed}, Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Runner crashed:', e); process.exit(2); });

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(
  __dirname,
  "..",
  "data",
  "r6_memberships.json"
);

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }

  return JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8")
  );
}

function save(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}


function getMembership(userId) {
  const data = load();

  return data[userId] || null;
}


function createMembership(user) {
  const data = load();

  if (!data[user.id]) {
    data[user.id] = {

      productId: "rainbow-six-cuba",

      userId: user.id,

      status: "pending",

      requirements: {

        discordConnected: true,

        discordGuildMember: false,

        communityVerified: false,

        ubisoftLinked: false

      },

      stats: {

        enabled: false,
        public: false

      },

      createdAt: new Date().toISOString(),

      updatedAt: new Date().toISOString()

    };
  }

  save(data);

  return data[user.id];
}


function updateMembership(userId, changes) {
  const data = load();

  if (!data[userId]) {
    return null;
  }

  data[userId] = {
    ...data[userId],
    ...changes,
    requirements: {
      ...data[userId].requirements,
      ...(changes.requirements || {})
    },
    stats: {
      ...data[userId].stats,
      ...(changes.stats || {})
    },
    updatedAt: new Date().toISOString()
  };

  save(data);

  return data[userId];
}


module.exports = {
  getMembership,
  createMembership,
  updateMembership
};

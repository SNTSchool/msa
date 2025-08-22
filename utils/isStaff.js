const { STAFF_ROLE_IDS } = require('../config/roles');

function isStaff(member) {
  return STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

module.exports = { isStaff };

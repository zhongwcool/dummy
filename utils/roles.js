const ROLES = Object.freeze({
    ADMIN: 'admin',
    USER: 'user',
    GUEST: 'guest'
});

const ALL_ROLES = [ROLES.ADMIN, ROLES.USER, ROLES.GUEST];
const USER_MANAGER_ROLES = [ROLES.ADMIN];
const OPERATOR_ROLES = [ROLES.ADMIN, ROLES.USER];

module.exports = {
    ROLES,
    ALL_ROLES,
    USER_MANAGER_ROLES,
    OPERATOR_ROLES
};

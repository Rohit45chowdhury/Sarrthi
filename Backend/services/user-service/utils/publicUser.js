// Client ko kabhi password hash / internal fields mat bhejo
module.exports = function publicUser(user) {
    const obj = user?.toObject ? user.toObject() : { ...user };
    delete obj.password;
    delete obj.googleId;
    delete obj.__v;
    obj.id = obj._id;
    return obj;
};
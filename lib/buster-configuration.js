var bPromise = require("buster-promise");
var bcGroup = require("./group");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.groups = {};
        return instance;
    },

    addGroup: function (name, group) {
    },

    loadGroupsFromConfigFile: function (fileName) {
    }
};
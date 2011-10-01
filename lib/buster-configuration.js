var bPromise = require("buster-promise");
var bcGroup = require("./group");
var path = require("path");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.groups = [];
        return instance;
    },

    addGroup: function (name, group) {
        var group = bcGroup.create(group, process.cwd());
        group.name = name;
        this.groups.push(group);
    }
};
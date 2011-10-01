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
    },

    loadGroupsFromConfigFile: function (fileName, rootPath) {
        var groups = safeRequire.call(this, fileName);

        if (groups == null) {
            return false;
        } else {
            for (var groupName in groups) {
                this.addGroup(groupName, groups[groupName]);
            }
            return true;
        }
    },

    filterEnv: function (env) {
        if (typeof(env) != "string") return;
        if (!env) return;

        this.groups = this.groups.filter(function (group) { return group.environment == env; });
    },

    filterGroup: function (regex) {
        if (!(regex instanceof RegExp)) return;
        this.groups = this.groups.filter(function (group) { return regex.test(group.name); });
    }
};

function safeRequire(fileName, rootPath) {
    try {
        var mod = path.resolve(rootPath, fileName.replace(".js", ""));
        return require(mod);
    } catch (e) {
        if (e.message != "Cannot find module '" + mod + "'") {
            throw e;
        }
    }

    return null;
}
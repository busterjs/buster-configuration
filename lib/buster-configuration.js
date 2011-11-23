var bCore = require("buster-core");
var bPromise = require("buster-promise");
var bcGroup = require("./group");
var path = require("path");

module.exports = {
    create: function () {
        var instance = Object.create(this);
        instance.groups = [];
        return instance;
    },

    addGroup: function (name, group, rootPath) {
        var group = bcGroup.create(group, rootPath);
        group.name = name;
        this.groups.push(group);
    },

    resolveGroups: function (cb) {
        var promises = this.groups.map(function (group) { return group.resolve(); });
        bPromise.all(promises).then(function () {
            cb();
        }, function (err) {
            cb(err);
        });
    },

    loadGroupsFromConfigFile: function (fileName, rootPath) {
        var groups = safeRequire.call(this, fileName);

        if (groups == null) {
            return false;
        } else {
            for (var groupName in groups) {
                this.addGroup(groupName, groups[groupName], process.cwd());
            }
            return true;
        }
    },

    filterEnv: function (env) {
        if (!!env && typeof env == "string") {
            this.groups = this.groups.filter(function (group) {
                return group.environment == env;
            });
        }

        return this;
    },

    filterGroup: function (regex) {
        if (!(regex instanceof RegExp)) return;
        this.groups = this.groups.filter(function (group) { return regex.test(group.name); });
    }
};

bCore.defineVersionGetter(module.exports, __dirname);

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
var bCore = require("buster-core");
var bPromise = require("buster-promise");
var bcGroup = require("./group");
var path = require("path");

module.exports = {
    create: function () {
        return bCore.extend(Object.create(this), {
            groups: [],
            listeners: {}
        });
    },

    addGroup: function (name, group, rootPath) {
        if (group.extends) {
            group = getGroup(this.groups, group.extends).extend(group, rootPath);
        } else {
            group = bcGroup.create(group, rootPath);
        }

        group.name = name;
        this.groups.push(group);
        delegateListeners(group, this.listeners);
        return group;
    },

    resolveGroups: function (cb) {
        var promises = this.groups.map(function (group) { return group.resolve(); });
        bPromise.all(promises).then(function () {
            cb();
        }, function (err) {
            cb(err);
        });
    },

    loadGroupsFromConfigFile: function (fileName) {
        var groups = safeRequire.call(this, fileName);

        if (groups == null) {
            return false;
        } else {
            for (var groupName in groups) {
                this.addGroup(groupName, groups[groupName], path.dirname(fileName));
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
        this.groups = this.groups.filter(function (group) {
            return regex.test(group.name);
        });
    },

    on: function (event, listener) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(listener);
        this.groups.forEach(function (group) {
            group.on(event, listener);
        });
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

function getGroup(groups, name) {
    for (var i = 0, l = groups.length; i < l; ++i) {
        if (groups[i].name == name) return groups[i];
    }
}

function delegateListeners(group, listeners) {
    for (var event in listeners) {
        listeners[event].forEach(function (listener) {
            group.on(event, listener);
        });
    }
}

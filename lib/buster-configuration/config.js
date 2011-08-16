var path = require("path");
var url = require("url");
var glob = require("glob");
var fs = require("fs");
var buster = require("buster-core");
var busterPromise = require("buster-promise");
var busterConfigGroup = require("./group");

module.exports = {
    create: function create() {
        var configuration = Object.create(this);
        configuration.groups = [];
        configuration.pending = [];

        return configuration;
    },

    addGroup: function addGroup(config, rootPath) {
        var root = path.resolve(process.cwd(), rootPath, config.rootPath);
        var group = busterConfigGroup.extend(config, root);

        this.groups = this.groups || [];
        this.groups.push(group);

        group.loadResourceConfigs().then(function () {
            group.loadResourceLoadConfigs();
            group.loadServerConfig();
        });

        return group;
    },

    loadModule: function loadModule(fileName, root) {
        var mod = this.safeRequire(fileName, root);
        var groupNames = Object.keys(mod || {}).sort();

        for (var i = 0, l = groupNames.length; i < l; ++i) {
            mod[groupNames[i]].description = groupNames[i];
            this.addGroup(mod[groupNames[i]]);
        }

        return mod;
    },

    safeRequire: function safeRequire(fileName, root) {
        if (!fileName) return null;
        root = root || process.cwd();

        try {
            var mod = path.resolve(root, fileName.replace(".js", ""));
            return require(mod);
        } catch (e) {
            if (e.message != "Cannot find module '" + mod + "'") {
                throw e;
            }
        }        

        return null;
    },

    configsFor: function (environment) {
        var results = [];

        for (var i = 0, l = this.groups.length; i < l; ++i) {
            if (this.groups[i].environment == environment) {
                results.push(this.groups[i]);
            }
        }

        return results;
    },

    eachGroup: function (environment, callback) {
        if (arguments.length == 1) {
            callback = environment;
            environment = null;
        }

        if (typeof callback != "function") {
            throw new Error("eachFor: callback should be a function");
        }

        var configs = environment && this.configsFor(environment) || this.groups || [];

        for (var i = 0, l = configs.length; i < l; ++i) {
            (function (cfg) {
                cfg.configure().then(function (conf) {
                    callback(null, conf);
                }, function (err) {
                    err.message = err.message.replace("error:", "error (" +
                                                      cfg.description + ")");
                    callback(err);
                });
            }(configs[i]));
        }
    },

    configure: function configure() {
        return this.groups[0].configure();
    }
};

function isArray(obj) {
    return Object.prototype.toString.call(obj) == "[object Array]";
}

function push(arr, obj) {
    arr.push(obj);
    return obj;
}

function rejected(message) {
    var promise = busterPromise.create();
    promise.reject(new Error(message));
    return promise;
}

function addUnique(arr, items) {
    for (var j = 0, l = items.length; j < l; ++j) {
        if (arr.indexOf(items[j]) < 0) {
            arr.push(items[j]);
        }
    }
}

function flattenPathArray(rootPath, load) {
    var cwd = process.cwd();
    var result = [];
    var promise = busterPromise.create();
    load = load || [];

    function expandItem(i) {
        if (i == load.length) {
            return promise.resolve(result);
        }

        process.chdir(rootPath);

        glob.glob(load[i], function (err, paths) {
            process.chdir(cwd);

            if (err) {
                promise.reject(err);
            } else {
                addUnique(result, paths.length > 0 ? paths : [load[i]]);
                expandItem(i + 1);
            }
        });
    }

    expandItem(0);
    return promise;
}

function loadFileAsResource(config, file, resource) {
    resource = resource || {};
    var origPath = resource.path, promise;

    if (!file) {
        promise = busterPromise.create();
        promise.reject(new Error("Resource configuration " +
                                 JSON.stringify(resource) +
                                 " has no path property"));
        return promise;
    }

    promise = flattenPathArray(config.rootPath, [file]);
    var cfg = config.sessionConfig;

    return promise.then(function (paths) {
        for (var i = 0, l = paths.length; i < l; ++i) {
            resource.path = origPath || paths[i];
            cfg.addFileAsResource(path.resolve(config.rootPath, paths[i]), resource);
        }
    });
}

function concat(config) {
    var settings = [].slice.call(arguments, 1);
    var result = [], arr;

    for (var i = 0, l = settings.length; i < l; ++i) {
        arr = config[settings[i]];

        if (arr) {
            if (!isArray(arr)) {
                throw new Error("Configuration error: `" + settings[i] +
                                "` should be an array, was " + typeof arr);
            }

            result = result.concat(arr);
        }
    }

    return result;
}


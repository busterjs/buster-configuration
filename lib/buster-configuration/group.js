var path = require("path");
var url = require("url");
var glob = require("glob");
var buster = require("buster-core");
var sessionConfig = require("./session");
var bpromise = require("buster-promise");
var moduleLoader = require("buster-module-loader");

var usesSessionConfig = {
    "browsers": true
};

function isArray(obj) {
    return Object.prototype.toString.call(obj) == "[object Array]";
}

function push(arr, obj) {
    arr.push(obj);
    return obj;
}

function rejected(message) {
    var promise = bpromise.create();
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
    var promise = bpromise.create();
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
        promise = bpromise.create();
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

module.exports = {
    extend: function extend(config, rootPath) {
        buster.extend(config, this);
        config.rootPath = rootPath;
        config.loadPreProcessors();
        config.pending = [];
        config.environment = config.environment || "browsers";

        return config;
    },

    loadPreProcessors: function loadPreProcessors() {
        if (!this.preprocessors) {
            return [];
        }

        var pp = [];

        for (var i = 0, l = this.preprocessors.length; i < l; ++i) {
            pp.push(moduleLoader.load(this.preprocessors[i]));
        }

        this.preprocessors = pp;
    },

    loadResourceConfigs: function loadResourceConfigs() {
        if (!usesSessionConfig[this.environment]) {
            return bpromise.create().resolve();
        }

        this.sessionConfig = sessionConfig.create();
        this.sessionConfig.preProcessors = this.preprocessors;
        var resources = this.resources;
        var promise = bpromise.create();
        this.pending.push(promise);
        var self = this;

        function loadResource(i) {
            if (!resources || i == resources.length) {
                return promise.resolve();
            }

            var res = resources[i];
            var result;

            if (typeof res == "string") {
                result = loadFileAsResource(self, res);
            } else if (!res.content && !res.backend && !res.combine) {
                result = loadFileAsResource(self, res.file || res.path, res);
            } else {
                self.sessionConfig.addResource(res.path, res);
            }

            bpromise.thenable(result).then(function () {
                loadResource(i + 1);
            }, function (err) { promise.reject(err); });
        }

        if (resources && !isArray(resources)) {
            promise.reject(new Error("resources should be an array, found " +
                                     typeof resources));
        } else {
            loadResource(0);
        }

        return promise;
    },

    loadResourceLoadConfigs: function loadResourceLoadConfigs() {
        var load;

        try {
            load = concat(this, "libs", "deps", "sources", "load", "tests", "specs");
        } catch (e) {
            return push(this.pending, rejected(e.message));
        }

        var promise = flattenPathArray(this.rootPath, load).then(function (load) {
            this.load = load;
            if (!usesSessionConfig[this.environment]) return;
            var fileName;

            for (var i = 0, l = load.length; i < l; ++i) {
                fileName = path.join(this.rootPath, load[i]);

                if (!this.sessionConfig.getResource(load[i])) {
                    this.sessionConfig.addFileAsResource(fileName, { path: load[i] });
                }

                this.sessionConfig.load(load[i])
            }
        }.bind(this));

        return push(this.pending, promise);
    },

    loadServerConfig: function loadServerConfig() {
        if (!this.server) {
            return;
        }

        var result = url.parse(this.server);

        this.server = {
            host: result.host,
            port: result.port,
            path: result.pathname || "/"
        };
    },

    configure: function configure() {
        var promise = bpromise.create(), self = this;
        var fail = function (err) { promise.reject(err); };

        function configComplete() {
            var count = self.pending.length;

            bpromise.all(self.pending).then(function () {
                if (self.pending.length == count) {
                    promise.resolve(self);
                } else {
                    configComplete();
                }
            }, fail);
        }

        configComplete();
        return promise;
    }
};

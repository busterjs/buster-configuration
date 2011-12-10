var buster = require("buster-core");
var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var fs = require("fs");
var glob = require("glob");
var crypto = require("crypto");
var Url = require("url");
var moduleLoader = require("buster-module-loader");

var CONFIG_OPTIONS = ["autoRun"];
var LOAD_ALIASES = ["deps", "libs", "src", "sources", "specs", "tests"];
var LOAD_EVENTS = ["dependencies", "sources", "tests"];
var NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Expires": "0"
};

var KNOWN_OPTIONS = LOAD_ALIASES.concat(
    ["resources", "environment", "rootPath", "extends", "env",
     "server", "options", "serverString", "name", "autoRun",
     "extensions"]);

var UNKNOWN_OPTION_HELP = {
    "load": "Did you mean one of: deps, libs, src, sources, tests, specs?",
    "extend": "Did you mean extends?"
};

var cg = module.exports = buster.extend(buster.eventEmitter.create(), {
    create: function (options, rootPath) {
        options = options || {};
        return buster.extend(Object.create(this), {
            environment: options.environment || options.env || "browser",
            rootPath: Path.resolve(rootPath, options.rootPath),
            server: extractServer(options),
            options: extractOptions(options),
            serverString: options.server,
            error: unknownProperties(options),
            extensions: options.extensions
        }, extractResources(options));
    },

    resolve: function () {
        var promise = bPromise.create();
        if (this.resourceSet) return promise.resolve(this);
        if (this.error) return promise.reject(this.error);
        if (!loadExtensions(this, promise)) return promise;

        this.resourceSet = resourceSet.create({});
        this.absoluteLoadEntries = [];

        var promises = loadResources.call(this, this.resources);
        promises.push(addLoadResources.call(this));

        bPromise.all(promises).then(function () {
            promise.resolve(this);
        }.bind(this), function (err) {
            promise.reject(err);
        });

        return promise;
    },

    setupFrameworkResources: function () {
        this.emit("load:resources", this.resourceSet);

        var files = resolveModules.call(this, [
            ["buster-core", "buster-core.js"],
            ["buster-core", "buster-event-emitter.js"],
            ["buster-evented-logger", "buster-evented-logger.js"],
            ["buster-assertions", "buster-assertions.js"],
            ["buster-assertions", "buster-assertions/expect.js"],
            ["buster-format", "buster-format.js"],
            ["buster-promise", "buster-promise.js"],
            ["sinon", "sinon.js"],
            ["sinon", "sinon/spy.js"],
            ["sinon", "sinon/stub.js"],
            ["sinon", "sinon/mock.js"],
            ["sinon", "sinon/collection.js"],
            ["sinon", "sinon/sandbox.js"],
            ["sinon", "sinon/test.js"],
            ["sinon", "sinon/test_case.js"],
            ["sinon", "sinon/assert.js"],
            ["sinon", "sinon/util/event.js"],
            ["sinon", "sinon/util/fake_xml_http_request.js"],
            ["sinon", "sinon/util/fake_timers.js"],
            ["sinon", "sinon/util/fake_server.js"],
            ["sinon", "sinon/util/fake_server_with_clock.js"],
            ["buster-test", "buster-test/spec.js"],
            ["buster-test", "buster-test/test-case.js"],
            ["buster-test", "buster-test/test-context.js"],
            ["buster-test", "buster-test/test-runner.js"],
            ["buster-test", "buster-test/reporters/json-proxy.js"],
            ["buster-bayeux-emitter", "buster-bayeux-emitter.js"],
            ["sinon-buster", "sinon-buster.js"],
            ["buster", "buster/buster-wiring.js"]
        ]);

        var ieFiles = resolveModules.call(this, [
            ["sinon", "sinon/util/timers_ie.js"],
            ["sinon", "sinon/util/xhr_ie.js"]
        ]);

        var compatResourceName = "/buster/compat-" + VERSION() + ".js";
        this.resourceSet.addResource(compatResourceName, {
            combine: ieFiles,
            headers: NO_CACHE_HEADERS
        });
        this.resourceSet.prependToLoad([compatResourceName]);

        var bundleResourceName = "/buster/bundle-" + VERSION() + ".js";
        this.resourceSet.addResource(bundleResourceName, {
            combine: files,
            headers: NO_CACHE_HEADERS
        });
        this.resourceSet.prependToLoad([bundleResourceName]);
    },

    extend: function (options, rootPath) {
        return cg.create(mergeOptions(this, options || {}), rootPath);
    }
});

function loadExtensions(group, promise) {
    try {
        (group.extensions || []).forEach(function (extension) {
            var module = moduleLoader.load(extension);

            if (typeof module.configure != "function") {
                throw new Error("Extension '" + extension +
                                "' has no 'configure' method");
            }

            module.configure(group);
        });
    } catch (e) {
        e.message = "Failed loading extensions: " + e.message;
        promise.reject(e);
        return false;
    }

    return true;
}

function mergeOptions(group, options) {
    var opt = {}, key;
    opt.resources = buster.extend(group.resources, options.resources);

    for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
        key = LOAD_ALIASES[i];
        options[key] = (group[key] || []).concat(options[key] || []);
    }

    return buster.extend(opt, {
        environment: group.environment,
        rootPath: group.rootPath,
        server: group.serverString
    }, extractOptions(group.options), options);
}

function loadResources(resources) {
    var promises = [], resource;

    for (var i = 0, ii = resources.length; i < ii; i++) {
        resource = resources[i];
        if (typeof(resource) == "string") resource = { path: resource };

        if ("backend" in resource) {
            addBackendResource.call(this, resource);
        } else if ("combine" in resource) {
            promises.push(addCombinedResource.call(this, resource));
        } else if ("content" in resource) {
            addContentResource.call(this, resource);
        } else {
            promises.push(addFileSystemResource.call(this, resource));
        }
    }

    return promises;
}

function buildLoadArray(group) {
    var resources, load = [];

    for (var i = 0, l = LOAD_EVENTS.length; i < l; ++i) {
        resources = group[LOAD_ALIASES[i*2]].concat(group[LOAD_ALIASES[i*2 + 1]]);
        group.emit("load:" + LOAD_EVENTS[i], resources, group.rootPath);
        load = load.concat(resources || []);
    }

    return load;
}

var GLOB_OPTIONS = glob.GLOB_DEFAULT | glob.GLOB_NOCHECK;

function resolvePath(path) {
    return Path.resolve(this.rootPath, path);
}

function shortenedPath(path) {
    return path.replace(this.rootPath, "");
}

function addFileSystemResource(resource) {
    var self = this;
    var promise = bPromise.create();
    var absolutePath = resolvePath.call(self, resource.path);
    glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
        if (err) {
            promise.reject(err);
        } else {
            addResources.call(self, matches, resource, promise);
        }
    });

    return promise;
}

function addBackendResource(resource) {
    var absolutePath = resolvePath.call(this, resource.path);
    var relative = shortenedPath.call(this, absolutePath);

    this.resourceSet.addResource(relative, {backend: resource.backend});
}

function addContentResource(resource) {
    this.resourceSet.addResource(resource.path, {content: resource.content});
}

function addCombinedResource(resource) {
    var self = this;
    var promise = bPromise.create();

    var globPromises = [];
    for (var i = 0, ii = resource.combine.length; i < ii; i++) {
        (function (globPromise) {
            globPromises.push(globPromise);
            var absolutePath = resolvePath.call(self, resource.combine[i]);
            glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
                if (err) {
                    globPromise.reject(err);
                } else {
                    globPromise.resolve(matches.map(function (match) {
                        return shortenedPath.call(self, match);
                    }));
                }
            });
        }(bPromise.create()));
    }

    bPromise.all(globPromises).then(function () {
        var allMatches = [];
        for (var i = 0, ii = arguments.length; i < ii; i++) {
            allMatches = allMatches.concat(arguments[i][0]);
        }

        self.resourceSet.addResource(resource.path, {combine: allMatches});
        promise.resolve();
    }, function (err) {
        promise.reject(err);
    });

    return promise;
}

function addResources(paths, baseResource, promise) {
    var self = this;
    var filePromises = [];
    for (var i = 0, ii = paths.length; i < ii; i++) {
        (function (path) {
            var filePromise = bPromise.create();
            filePromises.push(filePromise);
            var resource = {};

            resource.path = shortenedPath.call(self, path);
            if ("headers" in baseResource) {
                resource.headers = baseResource.headers;
            }

            fs.stat(path, function (err, stats) {
                if (err) {
                    filePromise.reject(err.message);
                } else {
                    var hash = crypto.createHash("sha1");
                    hash.update(stats.mtime.toString());
                    hash.update(path);
                    resource.etag = hash.digest("hex");

                    self.resourceSet.addFile(path, resource);
                    filePromise.resolve(path);
                }
            });
        }(paths[i]));
    }

    bPromise.all(filePromises).then(function () {
        var allAddedPaths = [];
        for (var i = 0, ii = arguments.length; i < ii; i++) {
            allAddedPaths = allAddedPaths.concat(arguments[i][0]);
        }
        promise.resolve(allAddedPaths);
    }, function (err) {
        promise.reject(err);
    });
}

function addLoadResources() {
    var promise = bPromise.create();
    addLoadResourcesIter.call(this, buildLoadArray(this), promise);
    return promise;
}

function addLoadResourcesIter(loadResources, promise) {
    if (loadResources.length == 0) {
        return promise.resolve();
    }

    addLoadResource.call(this, loadResources.shift()).then(function () {
        addLoadResourcesIter.call(this, loadResources, promise);
    }.bind(this), function (err) {
        promise.reject(err);
    });
}

function addLoadResource(load)  {
    var promise = bPromise.create();
    var resource = getResource(this.resources, load);

    if (resource) {
        addToLoad.call(this, resource.path);
        promise.resolve();
        return promise;
    }

    addFileSystemResource.call(this, {path: load}).then(function (allPaths) {
        for (var i = 0, ii = allPaths.length; i < ii; i++) {
            var absolutePath = resolvePath.call(this, allPaths[i]);
            var pathToLoad = shortenedPath.call(this, absolutePath);
            addToLoad.call(this, pathToLoad, absolutePath);
        }

        promise.resolve();
    }.bind(this), function (err) {
        promise.reject(err);
    });

    return promise;
}

function addToLoad(path, absolutePath) {
    if (absolutePath) {
        this.absoluteLoadEntries.push(absolutePath);
    }

    if (this.resourceSet.load.indexOf(path) < 0) {
        this.resourceSet.appendToLoad([path]);
    }
}

function getResource(resources, path) {
    for (var i = 0, l = resources.length; i < l; ++i) {
        if (resources[i].path == path) return resources[i];
    }
}

function resolveModules(modules) {
    var paths = [];

    for (var i = 0, ii = modules.length; i < ii; i++) {
        var moduleName = modules[i][0];
        var moduleFile = modules[i][1];
        var resourcePath = "/buster/" + moduleFile;
        var absolutePath = require.resolve(moduleName + "/lib/" + moduleFile);
        this.resourceSet.addFile(absolutePath, {path: resourcePath});
        paths.push(resourcePath);
    }

    return paths;
}

var bConfig;

function VERSION() {
    if (!bConfig) bConfig = require("./buster-configuration");
    return bConfig.VERSION;
}

function extractServer(options) {
    if (!options.server) return;
    if (!/^[a-z]+:\/\//i.test(options.server)) {
        options.server = "http://" + options.server;
    }
    var server = Url.parse(options.server);
    server.port = parseInt(server.port, 10);
    return server;
}

function extractOptions(options) {
    var opt = {}, key;
    for (var i = 0, l = CONFIG_OPTIONS.length; i < l; ++i) {
        key = CONFIG_OPTIONS[i];

        if (key in options) {
            opt[key] = options[key];
        }
    }

    return opt;
}

function extractResources(options) {
    var resources = { resources: options.resources || [] };

    for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
        resources[LOAD_ALIASES[i]] = options[LOAD_ALIASES[i]] || [];
    }

    return resources;
}

function unknownProperties(group) {
    var prop, help;

    for (prop in group) {
        if (group.hasOwnProperty(prop) && KNOWN_OPTIONS.indexOf(prop) < 0) {
            help = UNKNOWN_OPTION_HELP[prop];
            return "Unknown configuration option '" + prop + "'" +
                (help ? "\n" + help : "");
        }
    }
}

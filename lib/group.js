var B = require("buster-core");
var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var fs = require("fs");
var glob = require("buster-glob").glob;
var url = require("url");
var moduleLoader = require("buster-module-loader");

var CONFIG_OPTIONS = ["autoRun"];
var LOAD_ALIASES = ["deps", "libs", "src", "sources",
                    "specLibs", "specs", "testLibs", "tests"];

var KNOWN_OPTIONS = LOAD_ALIASES.concat(
    ["resources", "environment", "rootPath", "extends", "env",
     "server", "options", "serverString", "name", "autoRun",
     "extensions"]);

var UNKNOWN_OPTION_HELP = {
    "load": "Did you mean one of: deps, libs, src, sources, testLibs, tests, " +
        "specLibs, specs?",
    "extend": "Did you mean extends?"
};

var cg = module.exports = B.extend(B.eventEmitter.create(), {
    create: function (options, rootPath) {
        options = options || {};
        return B.extend(Object.create(this), {
            rootPath: Path.resolve(rootPath, options.rootPath),
            server: extractServer(options),
            environment: options.environment || options.env || "browser",
            options: extractOptions(options),
            serverString: options.server,
            extensions: options.extensions,
            error: unknownProperties(options)
        }, extractResources(options));
    },

    resolve: function () {
        var promise = bPromise.create();
        if (this.rsPromise) return this.rsPromise;
        if (this.resourceSet) return promise.resolve(this.resourceSet);
        if (this.error) return promise.reject(this.error);
        if (!loadExtensions(this, promise)) return promise;

        this.rsPromise = promise;
        var rs = this.resourceSet = resourceSet.create();

        var done = function (err) {
            delete this.rsPromise;
            if (err) return promise.reject(err);
            promise.resolve(rs);
        }.bind(this);

        addResources(rs, this.rootPath, this.resources).then(function () {
            addAllLoadEntries(this, rs, this.rootPath).then(
                B.partial(done, null), done);
        }.bind(this), done);

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

function addUnique(arr1, arr2) {
    arr1 = arr1 || [];
    (arr2 || []).forEach(function (item) {
        if (arr1.indexOf(item) < 0) arr1.push(item);
    });

    return arr1;
}

function extractResources(o) {
    return {
        resources: o.resources || [],
        libs: addUnique(o.deps, o.libs),
        sources: addUnique(o.src, o.sources),
        testLibs: addUnique(o.specLibs, o.testLibs),
        tests: addUnique(o.specs, o.tests)
    };
}

function extractOptions(opt) {
    return CONFIG_OPTIONS.reduce(function (options, key) {
        if (key in opt) options[key] = opt[key];
        return options;
    }, {});
}

function extractServer(options) {
    if (!options.server) return;
    if (!/^[a-z]+:\/\//i.test(options.server)) {
        options.server = "http://" + options.server;
    }
    var server = url.parse(options.server);
    server.port = parseInt(server.port, 10);
    return server;
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

function mergeOptions(group, options) {
    var opt = {}, key;
    opt.resources = B.extend(group.resources, options.resources);

    for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
        key = LOAD_ALIASES[i];
        options[key] = (group[key] || []).concat(options[key] || []);
    }

    return B.extend(opt, {
        environment: group.environment,
        rootPath: group.rootPath,
        server: group.serverString
    }, extractOptions(group.options), options);
}

function loadExtensions(group, promise) {
    try {
        (group.extensions || []).forEach(function (ext) {
            var module = moduleLoader.load(ext);
            if (typeof module.configure != "function") {
                throw new Error("Extension '" + ext + "' has no 'configure' method");
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

// RESOURCES

function addResources(rs, rootPath, resources) {
    return bPromise.all(resources.map(B.partial(addResource, rs, rootPath)));
}

function addResource(rs, rootPath, resource) {
    if (typeof resource == "string") {
        return addStringResource(rs, rootPath, resource);
    }

    return bPromise.thenable(rs.addResource(resource.path, resource));
}

function addStringResource(rs, rootPath, path) {
    var promise = bPromise.create();

    resolvePaths(rs, rootPath, [path], function (e, paths) {
        if (e || paths.length == 0) {
            return promise.reject(e || { message: path + " matched no files" });
        }

        addFileResources(rs, rootPath, paths).then(
            B.bind(promise, "resolve"), B.bind(promise, "reject"));
    });

    return promise;
}

function addFileResources(rs, rootPath, paths) {
    return bPromise.all((paths || []).map(B.partial(addFileResource, rs, rootPath)));
}

function addFileResource(rs, rootPath, resource) {
    return rs.addFileWithEtag(absolutePath(rootPath, resource), {
        path: resource
    });
}

// LOAD

function addAllLoadEntries(group, rs, rootPath) {
    var promise = bPromise.create();

    buster.series([
        B.partial(addLoadEntries, group, rs, rootPath, "libs"),
        B.partial(addLoadEntries, group, rs, rootPath, "sources"),
        B.partial(addLoadEntries, group, rs, rootPath, "testLibs"),
        B.partial(addLoadEntries, group, rs, rootPath, "tests")
    ], function (err, results) {
        if (err) return promise.reject(err);
        promise.resolve(results);
    });

    return promise;
}

function addLoadEntries(group, rs, rootPath, type, done) {
    resolvePaths(rs, rootPath, group[type], function (err, matches) {
        if (err || (group[type].length > 0 && matches.length == 0)) {
            var paths = group[type].join(", ");
            return done(err || { message: paths + " matched no files" });
        }

        group.emit("load:" + type, matches, rootPath);

        addMissingLoadResources(rs, rootPath, matches).then(function () {
            rs.appendToLoad(matches.map(resourceSet.normalizePath));
            done(null, matches);
        }, function (err) { done(err); });
    });
}

function addMissingLoadResources(rs, rootPath, paths) {
    return addFileResources(rs, rootPath, paths.reduce(function (resources, path) {
        if (!rs.resources[path]) resources.push(path);
        return resources;
    }, []));
}

// Paths

function resolvePaths(rs, rootPath, paths, callback) {
    glob(paths.map(B.partial(absolutePath, rootPath)), function (err, matches) {
        err = err || outsideRootError(rootPath, matches);
        if (err) return callback(err);
        matches = addUnique(matches, existingResources(rs, paths))
        callback(err, matches.map(B.partial(relativePath, rootPath)));
    });
}

function existingResources(rs, paths) {
    return paths.reduce(function (res, path) {
        if (rs.resources[path]) res.push(path);
        return res;
    }.bind(this), []);
}

function relativePath(rootPath, path) {
    return path.replace(rootPath.replace(/\/?$/, "/"), "");
}

function absolutePath(rootPath, path) {
    return Path.resolve(rootPath, path);
}

function outsideRoot(rootPath, path) {
    return path.indexOf(rootPath) < 0;
}

function outsideRootError(rootPath, paths) {
    var offendingPaths = paths.filter(B.partial(outsideRoot, rootPath));
    if (offendingPaths.length == 0) return;
    var is = offendingPaths.length > 1 ? " are " : " is ";
    return new Error(offendingPaths.map(B.partial(Path.relative, rootPath)).join(", ") +
                     is + "outside the project root. Set rootPath to the desired root" +
                     "to refer to paths outside the configuration file directory.");
}

// Framework resources, will go away

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

var NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Expires": "0"
};

var bConfig;

function VERSION() {
    if (!bConfig) bConfig = require("./buster-configuration");
    return bConfig.VERSION;
}

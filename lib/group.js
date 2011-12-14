var B = require("buster-core");
var bPromise = require("buster-promise");
var Path = require("path");
var fs = require("fs");
var url = require("url");
var moduleLoader = require("buster-module-loader");
var builder = require("./resource-set-builder");
var addUnique = require("./util").addUnique;

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

        this.resourceSet = buildResourceSet(this, function (err, resourceSet) {
            delete this.rsPromise;
            if (err) return promise.reject(err);
            promise.resolve(resourceSet);
        }.bind(this));

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

function buildResourceSet(group, done) {
    var b = builder.create(group.rootPath);

    b.addResources(group.resources).then(function () {
        b.addAllLoadEntries(group).then(B.partial(done, null, b.resourceSet), done);
    }, done);

    return b.resourceSet;
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

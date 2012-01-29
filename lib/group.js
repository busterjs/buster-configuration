var B = require("buster-core");
var when = require("when");
var Path = require("path");
var fs = require("fs");
var url = require("url");
var moduleLoader = require("buster-module-loader");
var resourceSet = require("buster-resources").resourceSet;
var addUnique = require("./util").addUnique;

var CONFIG_OPTIONS = ["autoRun"];
var LOAD_ALIASES = ["deps", "libs", "src", "sources",
                    "specLibs", "specs", "testLibs", "tests"];

var KNOWN_OPTIONS = LOAD_ALIASES.concat(
    ["resources", "environment", "rootPath", "extends", "env",
     "server", "options", "serverString", "name", "autoRun", "extensions"]
);

var UNKNOWN_OPTION_HELP = {
    "load": "Did you mean one of: deps, libs, src, sources, testLibs, tests, " +
        "specLibs, specs?",
    "extend": "Did you mean extends?"
};

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
        if (opt.hasOwnProperty(key)) { options[key] = opt[key]; }
        return options;
    }, {});
}

function extractServer(options) {
    if (!options.server) { return; }
    if (!/^[a-z]+:\/\//i.test(options.server)) {
        options.server = "http://" + options.server;
    }
    var server = url.parse(options.server);
    server.port = parseInt(server.port, 10);
    return server;
}

function extractExtensions(config) {
    return (config.extensions || []).map(function (ext) {
        var extConf = config[ext] || {};
        delete config[ext];
        return { name: ext, config: extConf };
    });
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
    var opt = {}, key, i, l;
    opt.resources = B.extend(group.resources, options.resources);

    for (i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
        key = LOAD_ALIASES[i];
        options[key] = (group[key] || []).concat(options[key] || []);
    }

    return B.extend(opt, {
        environment: group.environment,
        rootPath: group.rootPath,
        server: group.serverString
    }, extractOptions(group.options), options);
}

function loadExtensions(group, deferred) {
    try {
        (group.extensions || []).forEach(function (ext) {
            var module = moduleLoader.load(ext.name);
            if (typeof module.configure !== "function") {
                throw new Error("Extension '" + ext.name +
                                "' has no 'configure' method");
            }
            module.configure(group, ext.config);
        });
    } catch (e) {
        e.message = "Failed loading extensions: " + e.message;
        deferred.resolver.reject(e);
        return false;
    }

    return true;
}

function resourceSetFor(rs, group, section, done) {
    rs.appendLoad(group[section]).then(function () {
        group.emit("load:" + section, rs);
        rs.then(B.partial(done, null, rs), done);
    }, function (err) {
        done(err);
    });
}

function buildResourceSet(group, done) {
    var rs = resourceSet.create(group.rootPath);
    var frameworkResources = resourceSet.create("/");

    rs.addResources(group.resources).then(function () {
        B.series([
            function (next) {
                group.emit("load:framework", frameworkResources);
                next(null, frameworkResources);
            },
            B.partial(resourceSetFor, rs.concat(), group, "libs"),
            B.partial(resourceSetFor, rs.concat(), group, "sources"),
            B.partial(resourceSetFor, rs.concat(), group, "testLibs"),
            B.partial(resourceSetFor, rs.concat(), group, "tests")
        ], function (err, results) {
            if (err) { return done(err); }
            when.all(results).then(function () {
                rs.concat.apply(rs, results).then(function (resourceSet) {
                    group.emit("load:resources", resourceSet);
                    resourceSet.then(B.partial(done, null), done);
                }, done);
            }, done);
        });
    }, function (err) {
        if (err) { done(err); }
    });
}

// Framework resources, will go away

var NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Expires": "0"
};

function resolveModules(resourceSet, modules) {
    return modules.map(function (module) {
        var moduleName = module[0];
        var moduleFile = module[1];
        var resourcePath = "/buster/" + moduleFile;
        var absolutePath = require.resolve(moduleName + "/lib/" + moduleFile);
        resourceSet.addFileResource(absolutePath, { path: resourcePath });
        return resourcePath;
    });
}
// /Framework

var bConfig;
function version() {
    if (!bConfig) { bConfig = require("./buster-configuration"); }
    return bConfig.VERSION;
}

var cg = module.exports = B.extend(B.eventEmitter.create(), {
    create: function (options, rootPath) {
        options = options || {};
        return B.extend(Object.create(this), {
            rootPath: Path.resolve(rootPath, options.rootPath),
            server: extractServer(options),
            environment: options.environment || options.env || "browser",
            options: extractOptions(options),
            serverString: options.server,
            extensions: extractExtensions(options),
            error: unknownProperties(options)
        }, extractResources(options));
    },

    resolve: function () {
        var d = when.defer();
        if (this.rsPromise) { return this.rsPromise; }
        if (this.resourceSet) {
            d.resolver.resolve(this.resourceSet);
            return d.promise;
        }
        if (this.error) {
            d.resolver.reject(this.error);
            return d.promise;
        }
        if (!loadExtensions(this, d)) { return d.promise; }
        this.rsPromise = d.promise;
        buildResourceSet(this, function (err, resourceSet) {
            this.resourceSet = resourceSet;
            delete this.rsPromise;
            if (err) { return d.resolver.reject(err); }
            d.resolver.resolve(resourceSet);
        }.bind(this));
        return d.promise;
    },

    bundleFramework: function () {
        this.on("load:framework", function (rs) {
            var files = resolveModules(rs, [
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

            var ieFiles = resolveModules(rs, [
                ["sinon", "sinon/util/timers_ie.js"],
                ["sinon", "sinon/util/xhr_ie.js"]
            ]);

            var compatResourceName = "/buster/compat-" + version() + ".js";
            var bundleResourceName = "/buster/bundle-" + version() + ".js";

            when.all([
                rs.addResource({
                    path: compatResourceName,
                    combine: ieFiles,
                    headers: NO_CACHE_HEADERS
                }),
                rs.addResource({
                    path: bundleResourceName,
                    combine: files,
                    headers: NO_CACHE_HEADERS
                })
            ], function () {
                rs.loadPath.prepend(compatResourceName);
                rs.loadPath.prepend(bundleResourceName);
            }.bind(this));
        }.bind(this));
        return this;
    },

    extend: function (options, rootPath) {
        return cg.create(mergeOptions(this, options || {}), rootPath);
    }
});

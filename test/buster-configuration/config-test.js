var buster = require("buster");
var bconf = require("../../lib/buster-configuration").config;
var assert = buster.assert;
var refute = buster.refute;
var path = require("path");
var rmrf = require("rimraf");
var glob = require("glob");
var fs = require("fs");
var fakeFs = require("../fake-fs");

var FIXTURES_ROOT = path.resolve(__dirname, "..", "fixtures");

function mkdir(dir) {
    var dirs = dir.split("/"), tmp = FIXTURES_ROOT;
    fs.mkdirSync(FIXTURES_ROOT, "755");

    for (var i = 0, l = dirs.length; i < l; ++i) {
        tmp += "/" + dirs[i];

        try {
            fs.mkdirSync(tmp, "755");
        } catch (e) {
            return;
        }
    }
}

var fsWriteFileSync = fs.writeFileSync;

function writeFile(file, contents) {
    var filePath = path.resolve(FIXTURES_ROOT, file);
    mkdir(path.dirname(filePath));
    fsWriteFileSync(filePath, contents);

    return filePath;
}

fakeFs.use();

function onSessionConfig(configuration, callback) {
    return configuration.configure().then(function (config) {
        config.sessionConfig.configure().then(callback, function (err) {
            buster.log(err);
            assert(false);
        });
    });
}

function testSessionConfig(opt) {
    var matcher = opt.sessionConfigEqual ? "equals" : "match";
    var expected = opt.sessionConfigEqual || opt.sessionConfigMatch;

    return function () {
        if (opt.cwd) {
            process.chdir(opt.cwd);
        }

        if (opt.globs) {
            buster.extend(this.globs, opt.globs);
        }

        return onSessionConfig(this.config.addGroup(opt.config), function (config) {
            if (opt.expect) {
                opt.expect(config);
            } else {
                assert[matcher](config, expected);
            }
        });
    }
}

buster.testCase("buster-configuration config", {
    setUp: function () {
        fakeFs.createFile("/home/christian/myproj/src/1.js", "1.js");
        fakeFs.createFile("/home/christian/myproj/src/2.js", "2.js");
        fakeFs.createFile("/home/christian/myproj/test/1-test.js", "1-test.js");
        fakeFs.createFile("/home/christian/myproj/test/2-test.js", "2-test.js");

        this.globError = null;
        this.globs = {};
        var self = this;

        this.stub(glob, "glob", function (pattern, callback) {
            process.nextTick(function () {
                callback(self.globError, self.globs[pattern] || [pattern]);
            });
        });

        var cwd = "/home/christian/myproj";

        this.stub(process, "chdir", function (path) {
            cwd = path;
        });

        this.stub(process, "cwd", function () {
            return cwd;
        });

        this.config = bconf.create();
    },

    tearDown: function () {
        fakeFs.reset();
    },

    "resource configuration": {
        "should add file resource": testSessionConfig({
            config: { "resources": ["src/1.js"] },
            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "1.js" } }
            }
        }),

        "should add several file resources": testSessionConfig({
            config: { "resources": ["src/1.js", "src/2.js"] },
            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "1.js" },
                             "/src/2.js": { content: "2.js" } }
            }
        }),

        "should add file resource with absolute path": testSessionConfig({
            config: { "resources": ["/home/christian/myproj/src/1.js"] },
            sessionConfigMatch: {
                resources: { "/home/christian/myproj/src/1.js": { content: "1.js" } }
            }
        }),

        "should add globbed file resources": testSessionConfig({
            globs: { "src/*.js": ["src/1.js", "src/2.js"] },

            config: { "resources": ["src/*.js"] },
            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "1.js" },
                             "/src/2.js": { content: "2.js" } }
            }
        }),

        "should add resource with explicit file": testSessionConfig({
            config: { "resources": [{ path: "/javascripts/1.js", file: "src/1.js"}] },
            sessionConfigMatch: {
                resources: { "/javascripts/1.js": { content: "1.js" } }
            }
        }),

        "should add minified file resource": testSessionConfig({
            config: { "resources": [{ path: "src/1.js", minify: true }] },
            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "1.js", minify: true } }
            }
        }),

        "should add file resource with headers": testSessionConfig({
            config: {
                resources: [{
                    path: "src/1.js",
                    headers: { "Content-Type": "application/javascript" }
                }]
            },

            sessionConfigMatch: {
                resources: { "/src/1.js": {
                    content: "1.js",
                    headers: { "Content-Type": "application/javascript" }
                }}
            }
        }),

        "should add resource with content": testSessionConfig({
            config: { "resources": [{ path: "src/1.js", content: "// Comment" }] },
            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "// Comment" } }
            }
        }),

        "should load resource with headers": testSessionConfig({
            config: {
                resources: [{
                    path: "src/1.js",
                    content: "Hey",
                    headers: { "Content-Type": "application/javascript" }
                }]
            },

            sessionConfigMatch: {
                resources: { "/src/1.js": {
                    content: "Hey",
                    headers: { "Content-Type": "application/javascript" }
                }}
            }
        }),

        "should load resource with headers, etag and cacheable": testSessionConfig({
            config: {
                resources: [{
                    path: "src/1.js",
                    content: "Hey",
                    headers: { "Content-Type": "application/javascript" },
                    etag: "1234",
                    cacheable: true
                }]
            },

            sessionConfigEqual: {
                load: [],
                resources: { "/src/1.js": {
                    content: "Hey",
                    headers: { "Content-Type": "application/javascript" },
                    etag: "1234",
                    cacheable: true
                }}
            }
        }),

        "should add proxy resource": testSessionConfig({
            config: { resources: [{ path: "/proxy", backend: "http://10.0.0.1/" }] },

            sessionConfigMatch: {
                resources: { "/proxy": { backend: "http://10.0.0.1/" }}
            }
        }),

        "should add combined resource": testSessionConfig({
            config: {
                resources: ["src/1.js", "src/2.js",
                            { path: "/bundle.js", combine: ["src/1.js", "src/2.js"] }]
            },

            sessionConfigMatch: {
                resources: { "/bundle.js": { combine: ["src/1.js", "src/2.js"] }}
            }
        }),

        "should add globbed resource with headers": testSessionConfig({
            globs: { "src/*.js": ["src/1.js", "src/2.js"] },
            config: { resources: [{ "file": "src/*.js", headers: { "X-H": "OK" } }] },
            sessionConfigMatch: {
                resources: {
                    "/src/1.js": { content: "1.js", headers: { "X-H": "OK" } },
                    "/src/2.js": { content: "2.js", headers: { "X-H": "OK" } }
                }
            }
        }),

        "should add load files to session config": testSessionConfig({
            config: { load: ["src/1.js", "test/1-test.js"] },
            sessionConfigEqual: {
                resources: {
                    "/src/1.js": {
                        content: "1.js", etag: "a7aaa10524c1606d0e900c47c50252e05ead9898566a840731bdf417c03bb7c0"
                    },

                    "/test/1-test.js": {
                        content: "1-test.js", etag: "bbcd4f47c799ac8ffd52a23fe68b96124b9c365d4f872a8f42ae6aa4ef3c9d45"
                    }
                },

                load: ["/src/1.js", "/test/1-test.js"]
            }
        }),

        "should add globbed load files": testSessionConfig({
            globs: { "src/*.js": ["src/1.js", "src/2.js"] },

            config: { "load": ["src/*.js"] },
            sessionConfigMatch: {
                resources: {
                    "/src/1.js": { content: "1.js" },
                    "/src/2.js": { content: "2.js" }
                },
                load: ["/src/1.js", "/src/2.js"]
            }
        }),

        "should add load files from root path": testSessionConfig({
            cwd: "/home/christian/myproj/test",

            config: { "rootPath": "/home/christian/myproj/src", "load": ["1.js"] },
            sessionConfigMatch: {
                resources: { "/1.js": { content: "1.js" } },
                load: ["/1.js"]
            }
        }),

        "should prefer configured resource over existing file": testSessionConfig({
            config: {
                "resources": [{ path: "src/1.js", content: "Booyah" }],
                "load": ["src/1.js"]
            },

            sessionConfigMatch: {
                resources: { "/src/1.js": { content: "Booyah" } },
                load: ["/src/1.js"]
            }
        }),

        "should ensure unique entries in load": testSessionConfig({
            globs: { "src/*.js": ["src/1.js", "src/2.js"] },
            config: { "load": ["src/2.js", "src/*.js"] },

            expect: function (config) {
                assert.equals(config.load, ["/src/2.js", "/src/1.js"]);
            }
        }),

        "should not create session config for node": function (done) {
            buster.extend(this.globs, { "src/*.js": ["src/1.js", "src/2.js"] });

            this.config.addGroup({
                environment: "node",
                load: ["src/2.js", "src/*.js"]
            }).configure().then(function (conf) {
                assert.equals(conf.load, ["src/2.js", "src/1.js"]);
                assert.isUndefined(conf.sessionConfig);
                done();
            });
        },

        "should load sources, libs and tests in right order": function (done) {
            this.config.addGroup({
                environment: "node",
                libs: ["lib/1.js"],
                sources: ["src/2.js"],
                tests: ["test/3.js"]
            }).configure().then(function (conf) {
                assert.equals(conf.load, ["lib/1.js", "src/2.js", "test/3.js"]);
                done();
            });
        },

        "should load sources, deps and specs in right order": function (done) {
            this.config.addGroup({
                environment: "node",
                deps: ["lib/1.js"],
                sources: ["src/2.js"],
                specs: ["test/3.js"]
            }).configure().then(function (conf) {
                assert.equals(conf.load, ["lib/1.js", "src/2.js", "test/3.js"]);
                done();
            });
        },

        "should always load tests dead last": function (done) {
            this.config.addGroup({
                environment: "node",
                load: ["lib/1.js"],
                tests: ["test/2.js", "test/3.js"]
            }).configure().then(function (conf) {
                assert.equals(conf.load, ["lib/1.js", "test/2.js", "test/3.js"]);
                done();
            });
        },

        "human readable errors": {
            "should fail when resources is object": function (done) {
                this.config.addGroup({
                    resources: {}
                }).configure().then(function () {}, function (err) {
                    assert.match(err.message, "resources should be an array, found object");
                    done();
                });
            },

            "should fail when resource lacks file and path": function (done) {
                this.config.addGroup({
                    resources: [{ "some/path.js": { file: "/home/wrong.js" } }]
                }).configure().then(function () {}, function (err) {
                    assert.match(err.message, "Resource configuration ");
                    assert.match(err.message, "some/path.js");
                    assert.match(err.message, "has no path property");
                    done();
                });
            },

            "should fail when load is not an array": function (done) {
                this.config.addGroup({
                    load: { "load": ["path.js"] },
                }).configure().then(function () {}, function (err) {
                    assert.match(err.message, "Configuration ");
                    assert.match(err.message, "`load` should be an array, was object");
                    done();
                });
            },

            "should fail when libs is set but not an array": function (done) {
                this.config.addGroup({
                    libs: {},
                }).configure().then(function () {}, function (err) {
                    assert.match(err.message, "`libs` should be an array, was object");
                    done();
                });
            },

            "should fail when tests is set but not an array": function (done) {
                this.config.addGroup({
                    tests: {},
                }).configure().then(function () {}, function (err) {
                    assert.match(err.message, "`tests` should be an array, was object");
                    done();
                });
            }
        },

        "with preprocessors": {
            setUp: function () {
                exports.coffee = function (path, resource) {
                    if (!/\.coffee/.test(path)) {
                        return;
                    }

                    var promise = buster.promise.create();
                    resource.content += " coffee style";
                    promise.resolve(path.replace(".coffee", ".js"), resource);

                    return promise;
                };

                require.paths.unshift(__dirname);
            },

            tearDown: function () {
                require.paths.shift();
            },

            "should add preprocessor and resource with content": testSessionConfig({
                config: {
                    "preprocessors": ["config-test#coffee"],
                    "resources": [{ path: "src/1.coffee", content: "// Comment" }]
                },

                sessionConfigMatch: {
                    resources: { "/src/1.js": { content: "// Comment coffee style" } }
                }
            })
        }
    },

    "load": {
        "should not alter process.cwd": function () {
            return this.config.addGroup({
                rootPath: "/home/christian/myproj/src", load: ["1.js"]
            }).configure().then(function () {
                assert.equals(process.cwd(), "/home/christian/myproj");
            });
        },

        "should not alter process.cwd when failing": function (done) {
            this.globError = {};

            this.config.addGroup({
                rootPath: "/home/christian/myproj/src", load: ["1.js"]
            }).configure().then(function () {}, function () {
                assert.equals(process.cwd(), "/home/christian/myproj");
                done();
            });
        },

        "should transfer excess config keys to final config object": function () {
            return this.config.addGroup({
                rootPath: "/", reporter: "xUnitConsole"
            }).configure().then(function (config) {
                assert.match(config, { rootPath: "/", reporter: "xUnitConsole" });
            });
        }
    },

    "server config": {
        "should parse server address": function () {
            return this.config.addGroup({
                server: "http://localhost:1111/buster"
            }).configure().then(function (config) {
                assert.match(config, { server: {
                    host: "localhost",
                    port: 1111,
                    path: "/buster"
                }});
            });
        },

        "should parse server address without path": function () {
            return this.config.addGroup({
                server: "http://localhost:1111"
            }).configure().then(function (config) {
                assert.match(config, { server: {
                    host: "localhost",
                    port: 1111,
                    path: "/"
                }});
            });
        }
    },

    "configuration groups": {
        "should get all by environment": function () {
            this.config.addGroup({ environment: "node", load: [] });
            this.config.addGroup({ environment: "node", load: [] });
            this.config.addGroup({ environment: "browser", load: [] });

            assert.equals(this.config.configsFor("node").length, 2);
            assert.equals(this.config.configsFor("node")[0].environment, "node");
            assert.equals(this.config.configsFor("node")[1].environment, "node");
        },

        "should enumerate all by environment": function () {
            this.config.addGroup({ environment: "node", load: [] });
            this.config.addGroup({ environment: "node", load: [] });
            this.config.addGroup({ environment: "browser", load: [] });
            var results = [];

            this.config.eachGroup("node", function (err, config) {
                results.push(config);
            });

            assert.equals(results.length, 2);
            assert.equals(results[0].environment, "node");
            assert.equals(results[1].environment, "node");
        },

        "eachGroup should throw if callback is not function": function () {
            assert.exception(function () {
                this.config.eachGroup("node");
            }.bind(this));
        },

        "should enumerate readily configured groups": function (done) {
            buster.extend(this.globs, { "src/*.js": ["src/1.js", "src/2.js"] });

            this.config.addGroup({ environment: "node", sources: ["src/*.js"] });
            this.config.addGroup({ environment: "node", libs: ["src/*.js"] });
            var results = 0;

            this.config.eachGroup("node", function (err, config) {
                results += 1;
                assert.equals(config.load, ["src/1.js", "src/2.js"]);

                if (results == 2) done();
            });
        },

        "should enumerate all groups": function (done) {
            buster.extend(this.globs, { "src/*.js": ["src/1.js", "src/2.js"] });

            this.config.addGroup({ environment: "node", sources: ["src/*.js"] });
            this.config.addGroup({ environment: "browser", libs: ["src/*.js"] });
            var results = 0;

            this.config.eachGroup(function (err, config) {
                results += 1;
                assert.equals(config.load, ["src/1.js", "src/2.js"]);

                if (results == 2) done();
            });
        },

        "should pass errors to callback": function (done) {
            this.config.addGroup({ environment: "node", tests: "test/*.js" });
            var results = 0;

            this.config.eachGroup(function (err, config) {
                refute.isNull(err);
                assert.match(err.message, "should be an array");
                done();
            });
        }
    },

    "configure": {
        "should reject promise if glob fails": function (done) {
            glob.glob.restore();
            this.stub(glob, "glob").yields(new Error("Something's wrong"));

            this.config.addGroup({
                load: ["1.js"]
            }).configure().then(function () {}, function (err) {
                refute.isNull(err);
                assert.equals(err.message, "Something's wrong");
                done();
            });
        },

        "should reject promise if glob fails for resource": function (done) {
            glob.glob.restore();
            this.stub(glob, "glob").yields(new Error("Something's wrong"));

            this.config.addGroup({
                resources: ["1.js"]
            }).configure().then(function () {}, function (err) {
                refute.isNull(err);
                assert.equals(err.message, "Something's wrong");
                done();
            });
        }
    },

    "loadModule": {
        tearDown: function (done) {
            rmrf(FIXTURES_ROOT, function (err) {
                if (err) require("buster").log(err.toString());
                done();
            });
        },

        "should return null if no file name": function () {
            assert.isNull(this.config.loadModule());
        },

        "should return null if module cannot be found": function () {
            assert.isNull(this.config.loadModule("/some/module"));
        },

        "should require and return module": function () {
            this.stub(this.config, "addGroup");
            var filePath = writeFile("buster.js", "module.exports = { id: 42 };");

            assert.equals(this.config.loadModule(filePath), { id: 42 });
        },

        "should require relative to cwd by default": function () {
            this.stub(this.config, "addGroup");
            process.chdir(FIXTURES_ROOT);
            var filePath = writeFile("buster2.js", "module.exports = { id: 42 };");

            assert.equals(this.config.loadModule("buster2.js"), { id: 42 });
        },

        "should require relative to explicit root": function () {
            this.stub(this.config, "addGroup");
            var filePath = writeFile("buster3.js", "module.exports = { id: 42 };");

            assert.equals(this.config.loadModule("buster3.js", FIXTURES_ROOT),
                          { id: 42 });
        },

        "should raise non-require related errors from config": function () {
            var filePath = writeFile("buster4.js", "MOD.exports = { id: 42 };");

            assert.exception(function () {
                this.config.loadModule(filePath);
            }.bind(this));
        },

        "should add groups to configuration": function () {
            var filePath = writeFile("buster5.js", "var config = module.exports;" +
                                     "config['server tests'] = { id: 1 };" +
                                     "config['client tests'] = { id: 2 };");

            this.config.loadModule(filePath);

            assert.match(this.config.groups[0], {
                description: "client tests",
                id: 2
            });

            assert.match(this.config.groups[1], {
                description: "server tests",
                id: 1
            });
        }
    }
});

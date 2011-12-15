var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bcGroup = require("../lib/group");
var moduleLoader = require("buster-module-loader");

function assertContainsResources(group, resources, done) {
    group.resolve().then(function (resourceSet) {
        assert.equals(Object.keys(resourceSet.resources).sort(), resources.slice().sort());
        done();
    });
}

function assertResource(group, path, content, done) {
    group.resolve().then(function (resourceSet) {
        resourceSet.getResource(path, function (err, resource) {
            refute.defined(err);
            assert.equals(resource.content, content);
            done();
        });
    });
}

function assertLoad(group, load, done) {
    group.resolve().then(function (resourceSet) {
        assert.equals(resourceSet.load, load);
        done();
    }, function (err) {
        buster.log(err);
        assert(false);
        done();
    });
}

buster.testCase("configuration group", {
    "creates resources with root path": function (done) {
        var group = bcGroup.create({
            resources: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/bar.js", "/foo.js"], done);
    },

    "gets file contents as actual content": function (done) {
        var group = bcGroup.create({
            resources: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "var thisIsTheFoo = 5;");
                done();
            });
        });
    },

    "resolves globs": function (done) {
        var group = bcGroup.create({
            resources: ["*.js"]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/bar.js", "/foo.js"], done);
    },

    "adds resource as object with path": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "foo.js" }]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/foo.js"], done);
    },

    "respects custom headers": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "foo.js", headers: { "X-Foo": "Bar" } }]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert.match(resource.headers, { "X-Foo": "Bar" });
                done();
            });
        });
    },

    "fails for missing file": function (done) {
        var group = bcGroup.create({
            resources: ["/does/not/exist.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
        }, function (err) {
            assert.match(err.message, "/does/not/exist.js");
            assert.match(err.message, "matched no files");
            done();
        });
    },

    "fails for file outside root": function (done) {
        var group = bcGroup.create({
            resources: ["../*.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (rs) {
            buster.log(rs.resources);
        }, function (err) {
            assert.match(err, "../buster.js");
            assert.match(err, "outside the project root");
            assert.match(err, "set rootPath to the desired root");
            done();
        });
    },

    "adds backend resource": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "foo", backend: "http://10.0.0.1/" }]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            assert.equals(Object.keys(resourceSet.resources), ["/foo"]);
            assert.equals(resourceSet.resources["/foo"].backend, "http://10.0.0.1/");
            done();
        });
    },

    "adds combined resources": function (done) {
        var group = bcGroup.create({
            resources: ["foo.js", "bar.js",
                        { path: "/bundle.js", combine: ["/foo.js", "/bar.js"] }]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            var resource = resourceSet.resources["/bundle.js"];
            assert.defined(resource);
            assert.equals(resource.combine, ["/foo.js", "/bar.js"]);
            done();
        });
    },

    "adds resources with content for file that does not exist": function (done) {
        var group = bcGroup.create({
            resources: [{ path:"/does-not-exist.txt", content: "Hello, World" }]
        }, __dirname + "/fixtures");

        assertResource(group, "/does-not-exist.txt", "Hello, World", done);
    },

    "adds resources with content for file that exists": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "/foo.js", content: "Hello, World" }]
        }, __dirname + "/fixtures");

        assertResource(group, "/foo.js", "Hello, World", done);
    },

    "loads resource as source": function (done) {
        var group = bcGroup.create({
            resources: ["foo.js"],
            sources: ["foo.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js"], done);
    },

    "adds source files to load and add them as file resources": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/foo.js", "/bar.js"], done);
        assertLoad(group, ["/foo.js", "/bar.js"], done);
    },

    "creates group without file system access": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "/hey", content: "// OK" }],
            sources: ["/hey"]
        });

        group.resolve().then(function (resourceSet) {
            assert.equals(resourceSet.load, ["/hey"]);
            done();
        }.bind(this));
    },

    "adds source files via glob pattern": function (done) {
        var group = bcGroup.create({
            sources: ["*.js"]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/foo.js", "/bar.js"], done);
    },

    "loads libs, sources and tests in right order with globbing": function (done) {
        var group = bcGroup.create({
            libs: ["fo*.js"],
            sources: ["b*r.js"],
            tests: ["test/*.js"]
        }, __dirname + "/fixtures");

        var paths = ["/foo.js", "/bar.js", "/test/my-testish.js"];
        var callback = buster.countdown(2, done);

        assertContainsResources(group, paths, callback);
        assertLoad(group, paths, callback);
    },

    "loads tests and testHelpers in right order": function (done) {
        var group = bcGroup.create({
            testLibs: ["test/*.js"],
            tests: ["b*r.js"]
        }, __dirname + "/fixtures");

        var paths = ["/test/my-testish.js", "/bar.js"];
        var callback = buster.countdown(2, done);

        assertContainsResources(group, paths, callback);
        assertLoad(group, paths, callback);
    },

    "loads deps, sources and specs in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"], src: ["b*r.js"], specs: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js", "/test/my-testish.js"], done);
    },

    "loads libs, deps and sources in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"], libs: ["b*r.js"], sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js", "/test/my-testish.js"], done);
    },

    "loads test libs and spec libs in right order": function (done) {
        var group = bcGroup.create({
            specLibs: ["fo*.js"],
            testLibs: ["b*r.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js"], done);
    },

    "loads libs, src and sources in right order": function (done) {
        var group = bcGroup.create({
            libs: ["ba*.js"], src: ["f*.js"], sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/bar.js", "/foo.js", "/test/my-testish.js"], done);
    },

    "server address": {
        "is parsed": function () {
            var group = bcGroup.create({
                server: "http://localhost:1234/buster"
            }, __dirname + "/fixtures");

            assert.match(group.server, {
                hostname: "localhost",
                port: 1234,
                pathname: "/buster"
            });
        },

        "is parsed without path": function () {
            var group = bcGroup.create({
                server: "http://localhost:1234"
            }, __dirname + "/fixtures");

            assert.match(group.server, {
                hostname: "localhost",
                port: 1234,
                pathname: "/"
            });
        }
    },

    "environments": {
        "is set": function () {
            var group = bcGroup.create({ environment: "node" });
            assert.equals(group.environment, "node");
        },

        "defaults to browser": function () {
            var group = bcGroup.create({});
            assert.equals(group.environment, "browser");
        },

        "is set via env shorthand": function () {
            var group = bcGroup.create({ env: "node" });
            assert.equals(group.environment, "node");
        }
    },

    "autoRun": {
        "is set": function () {
            var group = bcGroup.create({ autoRun: true });
            assert.equals(group.options.autoRun, true);
        },

        "is not set by default": function () {
            var group = bcGroup.create({});
            refute.defined(group.options.autoRun);
        }
    },

    "supports duplicate items in sources to allow simple ordering": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "foo.js", "*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js"], done);
    },

    "framework resources": {
        setUp: function (done) {
            this.group = bcGroup.create({}, __dirname + "/fixtures");
            this.group.resolve().then(function () {
                this.resourceSet = this.group.resourceSet;
                done();
            }.bind(this));
        },

        "adds bundle groups": function () {
            this.group.setupFrameworkResources();

            var bundleResourceName = "/buster/bundle-0.2.1.js";
            var bundleResource = this.resourceSet.resources[bundleResourceName];
            assert.defined(bundleResource);

            var compatResourceName = "/buster/compat-0.2.1.js";
            var compatResource = this.resourceSet.resources[compatResourceName];
            assert.defined(compatResource);

            assert.equals([bundleResourceName, compatResourceName],
                          this.resourceSet.load.slice(0, 2));
        },

        "allows extension with events": function () {
            this.group.on("load:resources", function (resourceSet) {
                resourceSet.addResource("/stuff", {
                    content: "Oh yeah!"
                });
            });
            this.group.setupFrameworkResources();

            assert.defined(this.resourceSet.resources["/stuff"]);
            assert.equals(this.resourceSet.resources["/stuff"].content, "Oh yeah!");
        }
    },

    "does not resolve multiple times": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            group.resolve().then(function (rs) {
                assert.same(resourceSet, rs);
                done();
            });
        });
    },

    "resource load hooks": {
        "can override dependencies": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"]
            }, __dirname + "/fixtures");

            group.on("load:libs", function (libs) {
                libs.push("bar.js");
            });

            assertLoad(group, ["/foo.js", "/bar.js"], done);
        },

        "triggers with resolved glob patterns": function (done) {
            var group = bcGroup.create({
                deps: ["*.js"]
            }, __dirname + "/fixtures");

            var resources = [];
            group.on("load:libs", function (libs) {
                resources.push(libs[0]);
                resources.push(libs[1]);
            });

            group.resolve().then(function () {
                assert.equals(resources, ["bar.js", "foo.js"]);
                done();
            });
        },

        "fires dependencies only once for libs/deps": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"], libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:libs", function (libs) {
                libs.shift();
                libs.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        },

        "fires sources once for src/sources": function (done) {
            var group = bcGroup.create({
                src: ["foo.js"], sources: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:sources", function (sources) {
                sources.shift();
                sources.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        },

        "fires tests once for specs/tests": function (done) {
            var group = bcGroup.create({
                tests: ["foo.js"], specs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:tests", function (tests) {
                tests.shift();
                tests.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        }
    },

    "extended configuration": {
        setUp: function () {
            this.group = bcGroup.create({
                libs: ["foo.js"],
                server: "localhost:9191",
                autoRun: true
            }, __dirname + "/fixtures");
        },

        "inherits libs from parent group": function (done) {
            var group = this.group.extend();

            group.resolve().then(function () {
                assert("/foo.js" in group.resourceSet.resources);
                done();
            });
        },

        "does not modify parent group resources": function (done) {
            var group = this.group.extend({
                sources: ["bar.js"]
            }, __dirname + "/fixtures");

            this.group.resolve().then(function (rs) {
                group.resolve().then(function () {
                    assert("/bar.js" in group.resourceSet.resources);
                    refute("/bar.js" in rs.resources);
                    done();
                });
            });
        },

        "mixes load from both groups": function (done) {
            var group = this.group.extend({
                sources: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function (resourceSet) {
                assert.equals(resourceSet.load, ["/foo.js", "/bar.js"]);
                done();
            });
        },

        "does not modify parent group load": function (done) {
            var group = this.group.extend({
                tests: ["bar.js"]
            }, __dirname + "/fixtures");

            this.group.resolve().then(function (resourceSet) {
                group.resolve().then(function () {
                    assert.equals(resourceSet.load, ["/foo.js"]);
                    done();
                });
            });
        },

        "uses libs from both in correct order": function (done) {
            var group = this.group.extend({
                libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function (resourceSet) {
                assert.equals(resourceSet.load, ["/foo.js", "/bar.js"]);
                done();
            });
        },

        "inherits server setting": function () {
            var group = this.group.extend({ libs: [] });
            assert.match(group.server, { hostname: "localhost", port: 9191 });
        },

        "overrides server setting": function () {
            var group = this.group.extend({ server: "localhost:7878" });
            assert.match(group.server, { port: 7878 });
        },

        "inherits environment": function () {
            var group = this.group.extend({ libs: [] });
            assert.equals(group.environment, "browser");
        },

        "overrides environment": function () {
            var group = this.group.extend({ environment: "node", libs: [] });
            assert.equals(group.environment, "node");
        },

        "inherits autoRun option": function () {
            var group = this.group.extend({ libs: [] });
            assert(group.options.autoRun);
        },

        "overrides autoRun option": function () {
            var group = this.group.extend({ autoRun: false, libs: [] });
            refute(group.options.autoRun);
        }
    },

    "extensions": {
        setUp: function () {
            this.configure = this.spy();
            this.stub(moduleLoader, "load").returns({ configure: this.configure });
        },

        "loads modules with buster-module-loader": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledOnceWith(moduleLoader.load, "baluba");
                done();
            });
        },

        "loads all extensions": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba", "swan"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledWith(moduleLoader.load, "baluba");
                assert.calledWith(moduleLoader.load, "swan");
                done();
            });
        },

        "calls configure on extensions": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledOnceWith(this.configure, group);
                done();
            }.bind(this));
        },

        "fails gracefully if extension cannot be found": function (done) {
            moduleLoader.load.throws({
                name: "Error",
                message: "Cannot find module 'baluba'"
            });

            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {}, function (e) {
                assert.match(e.message, "Failed loading extensions");
                assert.match(e.message, "Cannot find module 'baluba'");
                done();
            }.bind(this));
        },

        "fails gracefully if extension has no configure method": function (done) {
            moduleLoader.load.returns({});

            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {}, function (e) {
                assert.match(e.message, "Failed loading extensions");
                assert.match(e.message, "Extension 'baluba' has no 'configure' method");
                done();
            }.bind(this));
        }
    },

    "unknown options": {
        "cause an error": function (done) {
            var group = bcGroup.create({
                thingie: "Oh noes"
            });

            group.resolve().then(function () {}, function (err) {
                assert.defined(err);
                done();
            });
        },

        "include custom message": function (done) {
            var group = bcGroup.create({
                load: [""]
            });

            group.resolve().then(function () {}, function (err) {
                assert.match(err, "Did you mean one of");
                done();
            });
        }
    }
});

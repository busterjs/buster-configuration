var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bcGroup = require("../lib/group");
var moduleLoader = require("buster-module-loader");

buster.testCase("configuration group", {
    "creates resources with root path": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js"
            ]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
    },

    "gets file contents as actual content": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "var thisIsTheFoo = 5;");
                done();
            });
        });
    },

    "creates group without file system access": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "/hey", content: "// OK" }],
            sources: ["/hey"]
        });

        group.resolve().then(function () {
            assert.equals(group.resourceSet.load, ["/hey"]);
            done();
        }.bind(this));
    },

    "resolves globs": function (done) {
        var group = bcGroup.create({
            resources: [
                "*.js"
            ]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
    },

    "adds resource as object with path": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo.js"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo.js" in group.resourceSet.resources);
            done();
        });
    },

    "respects custom headers": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo.js",headers:{"X-Foo":"Bar"}}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert.match(resource.headers, {"X-Foo": "Bar"});
                done();
            });
        });
    },

    "sets etag": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert("etag" in resource);
                // TODO: Should probably test more here.
                done();
            });
       });
    },

    "fails for missing file": function (done) {
        var group = bcGroup.create({
            resources: [
                "/does/not/exist.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
        }, function (err) {
            assert.match(err, "ENOENT");
            assert.match(err, "/does/not/exist.js");
            done();
        });
    },

    "adds backend resource": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo",backend:"http://10.0.0.1/"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo" in group.resourceSet.resources);
            var resource = group.resourceSet.resources["/foo"];
            assert.equals(resource.backend, "http://10.0.0.1/");
            done();
        });
    },

    "adds combined resources": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js",
                {path: "/bundle.js", combine: ["foo.js", "bar.js"]}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/bundle.js" in group.resourceSet.resources);
            var resource = group.resourceSet.resources["/bundle.js"];
            assert.equals(resource.combine, ["/foo.js", "/bar.js"]);
            done();
        });
    },

    "adds combined resources with glob pattern": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js",
                {path: "/bundle.js", combine: ["*.js"]}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert(true);
            var resource = group.resourceSet.resources["/bundle.js"];
            assert.equals(resource.combine.sort(), ["/foo.js", "/bar.js"].sort());
            done();
        });
    },

    "adds resources with content for file that does not exist": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"/does-not-exist.txt", content:"Hello, World"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/does-not-exist.txt", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "Hello, World");
                done();
            });
        });
    },

    "adds resources with content for file that exists": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"/foo.js", content:"Hello, World"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "Hello, World");
                done();
            });
        });
    },

    "adds source files to load and add them as file resources": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js"].sort(), group.resourceSet.load.sort());
            done();
        });
    },

    "adds source files via glob pattern": function (done) {
        var group = bcGroup.create({
            sources: ["*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js"].sort(), group.resourceSet.load.sort());
            done();
        });
    },

    "adds source outside root directory": function (done) {
        var group = bcGroup.create({
            sources: ["../foo.js", "../bar.js"]
        }, __dirname + "/fixtures/test");

        group.resolve().then(function () {
            assert.equals(group.resourceSet.load.length, 2);
            assert.match(group.resourceSet.load[0], "foo.js");
            done();
        });
    },

    "loads libs, sources and tests in right order with globbing": function (done) {
        var group = bcGroup.create({
            libs: ["fo*.js"],
            sources: ["b*r.js"],
            tests: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js", "/test/my-testish.js"], group.resourceSet.load);

            assert("/test/my-testish.js" in group.resourceSet.resources);
            group.resourceSet.getResource("/test/my-testish.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "{};");
                done();
            });
        });
    },

    "loads deps, sources and specs in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"],
            sources: ["b*r.js"],
            specs: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js", "/test/my-testish.js"], group.resourceSet.load);

            assert("/test/my-testish.js" in group.resourceSet.resources);
            group.resourceSet.getResource("/test/my-testish.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "{};");
                done();
            });
        });
    },

    "loads lib, deps and sources in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"],
            libs: ["b*r.js"],
            sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js", "/test/my-testish.js"],
                          group.resourceSet.load);
            done();
        });
    },

    "loads libs, src and sources in right order": function (done) {
        var group = bcGroup.create({
            libs: ["fo*.js"],
            src: ["b*r.js"],
            sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js", "/test/my-testish.js"],
                          group.resourceSet.load);
            done();
        });
    },

    "parses server address": function () {
        var group = bcGroup.create({
            server: "http://localhost:1234/buster"
        }, __dirname + "/fixtures");

        assert.match(group.server, {
            hostname: "localhost",
            port: 1234,
            pathname: "/buster"
        });
    },

    "parses server address without path": function () {
        var group = bcGroup.create({
            server: "http://localhost:1234"
        }, __dirname + "/fixtures");

        assert.match(group.server, {
            hostname: "localhost",
            port: 1234,
            pathname: "/"
        });
    },

    "provides list of all items in load with absolute paths": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            var expected = [__dirname + "/fixtures/foo.js", __dirname + "/fixtures/bar.js"];
            assert.equals(group.absoluteLoadEntries, expected);
            done();
        });
    },

    "sets environment": function () {
        var group = bcGroup.create({
            environment: "node"
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "node");
    },

    "defaults environment to browser": function () {
        var group = bcGroup.create({
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "browser");
    },

    "sets environment via env shorthand": function () {
        var group = bcGroup.create({
            env: "node"
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "node");
    },

    "sets autoRun option": function () {
        var group = bcGroup.create({
            autoRun: true
        }, __dirname + "/fixtures");

        assert.equals(group.options.autoRun, true);
    },

    "does not default autoRun option": function () {
        var group = bcGroup.create({}, __dirname + "/fixtures");

        refute("autoRun" in group.options);
    },

    "supports duplicate items in sources": function (done) {
        // Useful for stuff like ["lib/must-be-first.js", "lib/*.js"]
        var group = bcGroup.create({
            sources: ["foo.js", "foo.js", "*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
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

    "passes itself as the promise resolution": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (gr) {
            assert.same(gr, group);
            done();
        });
    },

    "does not resolve multiple times": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            var resourceSet = group.resourceSet;
            group.resolve().then(function () {
                assert.same(group.resourceSet, resourceSet);
                done();
            });
        });
    },

    "resource load hooks": {
        "can override dependencies": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"]
            }, __dirname + "/fixtures");

            group.on("load:dependencies", function (deps) {
                deps.push("bar.js");
            });

            assertContainsFooAndBar(group, done);
        },

        "provides rootPath to resolve paths": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"]
            }, __dirname + "/fixtures");

            var listener = this.spy();
            group.on("load:dependencies", listener);

            group.resolve().then(function () {
                assert.calledWith(listener, ["foo.js"], __dirname + "/fixtures");
                done();
            });
        },

        "fires dependencies only once for libs/deps": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"], libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:dependencies", function (deps) {
                deps.shift();
                deps.shift();
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

            group.on("load:sources", function (deps) {
                deps.shift();
                deps.shift();
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

            group.on("load:tests", function (deps) {
                deps.shift();
                deps.shift();
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

            this.group.resolve().then(function (parent) {
                group.resolve().then(function () {
                    assert("/bar.js" in group.resourceSet.resources);
                    refute("/bar.js" in parent.resourceSet.resources);
                    done();
                });
            });
        },

        "mixes load from both groups": function (done) {
            var group = this.group.extend({
                sources: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.equals(group.resourceSet.load, ["/foo.js", "/bar.js"]);
                done();
            });
        },

        "does not modify parent group load": function (done) {
            var group = this.group.extend({
                tests: ["bar.js"]
            }, __dirname + "/fixtures");

            this.group.resolve().then(function (parent) {
                group.resolve().then(function () {
                    assert.equals(parent.resourceSet.load, ["/foo.js"]);
                    done();
                });
            });
        },

        "uses libs from both in correct order": function (done) {
            var group = this.group.extend({
                libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.equals(group.resourceSet.load, ["/foo.js", "/bar.js"]);
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
    }
});

function assertContainsFooAndBar(group, done) {
    group.resolve().then(function () {
        assert("/foo.js" in group.resourceSet.resources);
        assert("/bar.js" in group.resourceSet.resources);

        group.resourceSet.getResource("/foo.js", function (err, resource) {
            refute.defined(err);
            assert.equals(resource.content, "var thisIsTheFoo = 5;");
            group.resourceSet.getResource("/bar.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "var helloFromBar = 1;");
                done();
            });
        });
    });
}
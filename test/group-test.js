var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bcGroup = require("../lib/group");

buster.testCase("buster-configuration group", {
    "should create resources with root path": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js"
            ]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
    },

    "should get file contents as actual content": function (done) {
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

    "should create group without file system access": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "/hey", content: "// OK" }],
            sources: ["/hey"]
        });

        group.resolve().then(function () {
            assert.equals(group.resourceSet.load, ["/hey"]);
            done();
        }.bind(this));
    },

    "should resolve globs": function (done) {
        var group = bcGroup.create({
            resources: [
                "*.js"
            ]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
    },

    "should add resource as object with path": function (done) {
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

    "should respect custom headers": function (done) {
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

    "should set etag": function (done) {
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

    "should fail for missing file": function (done) {
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

    "should add backend resource": function (done) {
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

    "should add combined resources": function (done) {
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

    "should add combined resources with glob pattern": function (done) {
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

    "should add resources with content for file that does not exist": function (done) {
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

    "should add resources with content for file that exists": function (done) {
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

    "should add source files to load and add them as file resources": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js"].sort(), group.resourceSet.load.sort());
            done();
        });
    },

    "should add source files via glob pattern": function (done) {
        var group = bcGroup.create({
            sources: ["*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, function () {
            assert.equals(["/foo.js", "/bar.js"].sort(), group.resourceSet.load.sort());
            done();
        });
    },

    "should load libs, sources and tests in right order with globbing": function (done) {
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

    "should load deps, sources and specs in right order": function (done) {
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

    "should load lib, deps and sources in right order": function (done) {
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

    "should load libs, src and sources in right order": function (done) {
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

    "should parse server address": function () {
        var group = bcGroup.create({
            server: "http://localhost:1234/buster"
        }, __dirname + "/fixtures");

        assert.match(group.server, {
            hostname: "localhost",
            port: 1234,
            pathname: "/buster"
        });
    },

    "should parse server address without path": function () {
        var group = bcGroup.create({
            server: "http://localhost:1234"
        }, __dirname + "/fixtures");

        assert.match(group.server, {
            hostname: "localhost",
            port: 1234,
            pathname: "/"
        });
    },

    "should provide list of all items in load with absolute paths": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            var expected = [__dirname + "/fixtures/foo.js", __dirname + "/fixtures/bar.js"];
            assert.equals(group.absoluteLoadEntries, expected);
            done();
        });
    },

    "should set environment": function () {
        var group = bcGroup.create({
            environment: "node"
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "node");
    },

    "should default environment to browser": function () {
        var group = bcGroup.create({
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "browser");
    },

    "should set environment via env shorthand": function () {
        var group = bcGroup.create({
            env: "node"
        }, __dirname + "/fixtures");

        assert.equals(group.environment, "node");
    },

    "should set autoRun option": function () {
        var group = bcGroup.create({
            autoRun: true
        }, __dirname + "/fixtures");

        assert.equals(group.options.autoRun, true);
    },

    "should not default autoRun option": function () {
        var group = bcGroup.create({}, __dirname + "/fixtures");

        refute("autoRun" in group.options);
    },

    "should support duplicate items in sources": function (done) {
        // Useful for stuff like ["lib/must-be-first.js", "lib/*.js"]
        var group = bcGroup.create({
            sources: ["foo.js", "foo.js", "*.js"]
        }, __dirname + "/fixtures");

        assertContainsFooAndBar(group, done);
    },

    "should add bundle groups for framework resources": function (done) {
        var group = bcGroup.create({}, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.setupFrameworkResources();

            var bundleResourceName = "/buster/bundle-0.2.0.js";
            var bundleResource = group.resourceSet.resources[bundleResourceName];
            assert.defined(bundleResource);

            var compatResourceName = "/buster/compat-0.2.0.js";
            var compatResource = group.resourceSet.resources[compatResourceName];
            assert.defined(compatResource);

            assert.equals([bundleResourceName, compatResourceName], group.resourceSet.load.slice(0, 2));

            done();
        });
    },

    "should pass itself as the promise resolution": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (gr) {
            assert.same(gr, group);
            done();
        });
    },

    "should not resolve multiple times": function (done) {
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
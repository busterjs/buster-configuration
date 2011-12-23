var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterConfiguration = require("../lib/buster-configuration");

buster.testCase("buster-configuration", {
    setUp: function () {
        this.c = busterConfiguration.create();
        this.rootPath = __dirname;
    },

    "adds group": function () {
        this.c.addGroup("My group", {}, this.rootPath);

        assert.equals(this.c.groups.length, 1);
        var group = this.c.groups[0];
        assert.equals(group.name, "My group");
    },

    "loads groups from config file": function () {
        assert(this.c.loadFile(__dirname + "/buster"));
        assert.equals(this.c.groups.length, 1);
    },

    "handles non-existing file": function () {
        refute(this.c.loadFile(__dirname + "/does-not-exist"));
        assert.equals(this.c.groups.length, 0);
    },

    "filters groups on environment": function () {
        this.c.addGroup("My group 1", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 2", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 3", {environment: "browser"}, this.rootPath);

        this.c.filterEnv("node");
        assert.equals(this.c.groups.length, 2);
    },

    "ignores non-string environment filters": function () {
        this.c.addGroup("My group 1", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 2", {environment: "browser"}, this.rootPath);

        this.c.filterEnv(null);
        this.c.filterEnv({});
        this.c.filterEnv(1234);
        this.c.filterEnv([]);
        assert.equals(this.c.groups.length, 2);
    },

    "filters groups on name": function () {
        this.c.addGroup("The test", {}, this.rootPath);
        this.c.addGroup("test the foo", {}, this.rootPath);
        this.c.addGroup("foo the bar", {}, this.rootPath);

        this.c.filterGroup(/test/);
        assert.equals(this.c.groups.length, 2);
        assert.match(this.c.groups, [{name: "The test"}, {name: "test the foo"}]);
    },

    "resolves all groups": function (done) {
        this.c.addGroup("My group 1", {sources: ["fixtures/foo.js"]}, this.rootPath);
        this.c.addGroup("My group 2", {sources: ["fixtures/bar.js"]}, this.rootPath);

        this.c.resolveGroups(function (err) {
            refute.defined(err);
            // If it is resolved, it has a resourceSet.
            assert("resourceSet" in this.c.groups[0]);
            assert("resourceSet" in this.c.groups[1]);
            done();
        }.bind(this));
    },

    "resolves with groups": function (done) {
        this.c.addGroup("My group 1", {sources: ["fixtures/foo.js"]}, this.rootPath);
        this.c.addGroup("My group 2", {sources: ["fixtures/bar.js"]}, this.rootPath);

        this.c.resolveGroups(done(function (err, groups) {
            assert.equals(groups, this.c.groups);
        }.bind(this)));
    },

    "resolves all groups with error": function (done) {
        this.c.addGroup("My group 1", {sources: ["fixtures/foo.js"]}, this.rootPath);
        this.c.addGroup("My group 2", {sources: ["fixtures/does-not-exist.js"]}, this.rootPath);

        this.c.resolveGroups(function (err) {
            assert.defined(err);
            assert.match(err.message, "matched no files");
            done();
        }.bind(this));
    },

    "resolves group with custom root path": function (done) {
        this.c.addGroup("My group 1", {
            sources: ["test/fixtures/foo.js"],
            rootPath: __dirname + "/.."
        });

        this.c.resolveGroups(function (err) {
            refute.defined(err);
            assert("resourceSet" in this.c.groups[0]);
            done();
        }.bind(this));
    },

    "resolves custom root path relative to file root path": function (done) {
        this.c.addGroup("My group 1", {
            sources: ["test/fixtures/foo.js"],
            rootPath: ".."
        }, __dirname);

        this.c.resolveGroups(function (err) {
            refute.defined(err);
            assert("resourceSet" in this.c.groups[0]);
            done();
        }.bind(this));
    },

    "creates extended group": function (done) {
        this.c.addGroup("My group 1", {
            sources: ["fixtures/foo.js"]
        }, __dirname);

        var group = this.c.addGroup("My group 2", {
            extends: "My group 1",
            autoRun: true
        });

        this.c.resolveGroups(function (err) {
            assert.equals(group.resourceSet.load, ["/fixtures/foo.js"]);
            assert(group.options.autoRun);
            done();
        }.bind(this));
    },

    "complains about unknown property": function (done) {
        this.c.addGroup("My group 1", {
            load: ["fixtures/foo.js"]
        }, __dirname);

        this.c.resolveGroups(function (err) {
            assert.match(err, "Unknown configuration option 'load'");
            assert.match(err, "Did you mean one of: deps, libs, src, sources, testLibs, tests, specLibs, specs?");
            done();
        }.bind(this));
    },

    "load events": {
        "delegates to groups": function () {
            this.c.groups = [buster.eventEmitter.create(),
                             buster.eventEmitter.create()];

            var listener = this.spy();
            this.c.on("load:sources", listener);
            this.c.groups[0].emit("load:sources", 42);
            this.c.groups[1].emit("load:sources", 43);

            assert.calledWith(listener, 42);
            assert.calledWith(listener, 43);
        },

        "delegates to groups added after listen": function () {
            var listener = this.spy();
            this.c.on("load:sources", listener);

            this.c.addGroup("Some group", {});
            this.c.groups[0].emit("load:sources", 42);

            assert.calledOnceWith(listener, 42);
        }
    },

    "framework events": {
        "delegates to groups": function () {
            this.c.groups = [buster.eventEmitter.create(),
                             buster.eventEmitter.create()];

            var listener = this.spy();
            this.c.on("load:resources", listener);
            this.c.groups[0].emit("load:resources", 42);
            this.c.groups[1].emit("load:resources", 43);

            assert.calledWith(listener, 42);
            assert.calledWith(listener, 43);
        },

        "delegates to groups added after listen": function () {
            var listener = this.spy();
            this.c.on("load:resources", listener);

            this.c.addGroup("Some group", {});
            this.c.groups[0].emit("load:resources", 42);

            assert.calledOnceWith(listener, 42);
        }
    }
});

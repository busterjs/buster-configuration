var fakeFs = require("../fake-fs");
var fs = require("fs");
var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bsess = require("../../lib/buster-configuration").session;
fakeFs.use();

function resolvedPromise() {
    var promise = buster.promise.create();
    promise.resolve.apply(promise, arguments);
    return promise;
}

buster.testCase("buster-configuration session", {
    setUp: function () {
        this.session = bsess.create();
    },

    "create": {
        "should return session config object": function () {
            assert.isObject(this.session);
            assert(bsess.isPrototypeOf(this.session));
        }
    },

    "addResource": {
        "should add resource": function () {
            this.session.addResource("/script.js", {
                content: "alert('Hello world');"
            });

            assert.match(this.session.resources, {
                "/script.js": { content: "alert('Hello world');" }
            });
        },

        "should add minified resource": function () {
            this.session.addResource("/script.js", {
                content: "alert('Hello world');",
                minify: true
            });

            assert.match(this.session.resources, {
                "/script.js": { content: "alert('Hello world');", minify: true }
            });
        },

        "should fail for missing resource": function () {
            assert.exception(function () {
                this.session.addResource("/path");
            }.bind(this), "TypeError");
        },

        "should fail for missing content": function () {
            assert.exception(function () {
                this.session.addResource("/path", {});
            }.bind(this), "TypeError");
        },

        "should not fail for empty content": function () {
            refute.exception(function () {
                this.session.addResource("/path", { content: "" });
            }.bind(this), "TypeError");
        },

        "should not fail when adding proxy resource": function () {
            refute.exception(function () {
                this.session.addResource("/path", { backend: "http://localhost:3242" });
            }.bind(this), "TypeError");
        },

        "should fail when adding proxy resource with content": function () {
            assert.exception(function () {
                this.session.addResource("/path", {
                    backend: "http://localhost:3242",
                    content: "That won't work"
                });
            }.bind(this), "TypeError");
        },

        "should fail when adding proxy resource with combine": function () {
            this.session.addResource("/my/path", { content: "" });

            assert.exception(function () {
                this.session.addResource("/path", {
                    backend: "http://localhost:3242",
                    combine: ["/my/path"]
                });
            }.bind(this), "TypeError");
        },

        "should add proxy resource": function () {
            this.session.addResource("/path", { backend: "http://localhost:3242/" });

            assert.match(this.session.resources, {
                "/path": { backend: "http://localhost:3242/" }
            });
        },

        "should not modify passed in resource": function () {
            var resource = { content: "" };
            this.session.addResource("/path", resource);

            assert.equals(resource, { content: "" });
        },

        "should set resource path from path argument": function () {
            this.session.addResource("/path", { content: "", path: "/" });

            assert.defined(this.session.resources["/path"]);
            refute.defined(this.session.resources["/"]);
        },

        "should add resource with custom headers": function () {
            this.session.addResource("/path", { content: "", headers: {
                "Content-Type": "application/json"
            } });

            assert.match(this.session.resources["/path"], {
                headers: { "Content-Type": "application/json" }
            });
        },

        "should ignore unrecognized key": function () {
            this.session.addResource("/path", { content: "", bogus: "Remove it!" });

            refute.defined(this.session.resources["/path"].bogus);
        },

        "should add several resources": function () {
            this.session.addResource("/script1.js", { content: "// 1" });
            this.session.addResource("/script2.js", { content: "// 2" });

            assert.match(this.session.resources, {
                "/script1.js": { content: "// 1" },
                "/script2.js": { content: "// 2" }
            });
        },

        "should overwrite existing resource": function () {
            this.session.addResource("/script1.js", { content: "// 1" });
            this.session.addResource("/script1.js", { content: "// 2" });

            assert.match(this.session.resources, {
                "/script1.js": { content: "// 2" }
            });
        },

        "should ensure leading slash in path": function () {
            this.session.addResource("script1.js", { content: "// 1" });

            assert.isTrue("/script1.js" in this.session.resources);
            assert.isFalse("script1.js" in this.session.resources);
        },

        "should fail for relative URL": function () {
            assert.exception(function () {
                this.session.addResource("../script1.js", { content: "// 1" });
            }.bind(this), "TypeError");
        },

        "should fail if proxy backend URL is an invalid URL": function () {
            assert.exception(function () {
                this.session.addResource("/proxy", { backend: "somehwere" });
            }.bind(this), "TypeError");
        },

        "should add combined resource": function () {
            this.session.addResource("script1.js", { content: "// 1\n" });
            this.session.addResource("script2.js", { content: "// 2\n" });
            this.session.addResource("script3.js", { combine: ["script1.js", "script2.js"] });

            var resource = this.session.getResource("script3.js");
            refute.defined(resource.content);
            assert.equals(resource.combine, ["script1.js", "script2.js"]);
        },

        "should add combined minified resource": function () {
            this.session.addResource("script1.js", { content: "// 1\n" });
            this.session.addResource("script2.js", { content: "// 2\n" });
            this.session.addResource("script3.js", {
                combine: ["script1.js", "script2.js"],
                minify: true
            });

            var resource = this.session.getResource("script3.js");
            assert.isTrue(resource.minify);
        },

        "should fail when adding combined resource with content": function () {
            this.session.addResource("/my/path", { content: "" });

            assert.exception(function () {
                this.session.addResource("/path", {
                    content: "",
                    combine: ["/my/path"]
                });
            }.bind(this), "TypeError");
        },

        "should fail if combining non-existent resources": function () {
            this.session.addResource("script1.js", { content: "// 1\n" });

            assert.exception(function () {
                this.session.addResource("script3.js", {
                    combine: ["script1.js", "script2.js"]
                });
            }.bind(this), "Error");
        },

        "should add content sha256 hash as etag": function () {
            this.session.addResource("script1.js", {
                content: "alert('Hello world');"
            });

            assert.equals(
                this.session.getResource("script1.js").etag,
                "0d44ea2034948f51da82b41b4a3849b62ca47d7c5543be016a7a1b8a9828742a"
            );
        },

        "should not override user-provided etag": function () {
            this.session.addResource("script1.js", {
                content: "alert('Hello world');",
                etag: "0110"
            });

            assert.equals(this.session.getResource("script1.js").etag, "0110");
        },

        "should allow etag and no content/backend/combine": function () {
            refute.exception(function () {
                this.session.addResource("script1.js", {
                    etag: "0110"
                });
            }.bind(this));
        },

        "should not add etag to proxy resource": function () {
            this.session.addResource("script1.js", {
                backend: "http://localhost"
            });

            refute.defined(this.session.getResource("script1.js").etag);
        },

        "should not add etag to combined resource": function () {
            this.session.addResource("script1.js", { content: "" });
            this.session.addResource("script2.js", { combine: ["script1.js"] });

            refute.defined(this.session.getResource("script2.js").etag);
        },

        "should add uncacheable resource": function () {
            this.session.addResource("script1.js", { content: "", cacheable: false });

            assert.isFalse(this.session.getResource("script1.js").cacheable);
        },

        "preprocessors": {
            setUp: function () {
                this.session.preProcessors = [function (path, resource) {
                    if (!/\.coffee$/.test(path)) {
                        return;
                    }

                    var promise = buster.promise.create();
                    resource.content = "var " + resource.content + ";";

                    process.nextTick(function () {
                        promise.resolve(path.replace(".coffee", ".js"), resource);
                    });

                    return promise;
                }];
            },

            "should pre-process resource": function () {
                this.session.addResource("script1.coffee", {
                    content: "a = 'No vars, no semicolons'"
                });

                this.session.configure().then(function (conf) {
                    refute.defined(conf.resources["/script1.coffee"]);

                    assert.match(conf.resources, {
                        "/script1.js": {
                            content: "var a = 'No vars, no semicolons';"
                        }
                    });
                });
            },

            "should try all pre-processors": function () {
                this.session.preProcessors = [function (path, resource) {
                    return;
                }, function (path, resource) {
                    if (/coffee/.test(path)) {
                        return resolvedPromise("1.js", { content: "Yay" });
                    }
                }];

                this.session.addResource("script1.coffee", {
                    content: "a = 'No vars, no semicolons'"
                });

                this.session.configure().then(function (conf) {
                    refute.defined(conf.resources["/script1.coffee"]);
                    assert.match(conf.resources, { "/1.js": { content: "Yay" } });
                });
            },

            "should only process with first matching preprocessor": function () {
                this.session.preProcessors = [function (path, resource) {
                    if (/coffee/.test(path)) {
                        return resolvedPromise("1.js", { content: "Yay" });
                    }
                }, function (path, resource) {
                    if (/coffee/.test(path)) {
                        return resolvedPromise("2.js", { content: "Nay" });
                    }
                }];

                this.session.addResource("script1.coffee", {
                    content: "a = 'No vars, no semicolons'"
                });

                this.session.configure().then(function (conf) {
                    refute.defined(conf.resources["/2.js"]);
                    assert.match(conf.resources, { "/1.js": { content: "Yay" } });
                });
            },

            "should process in chain": function () {
                this.session.preProcessors = [function (path, resource) {
                    if (/1\.js/.test(path)) {
                        return resolvedPromise("2.js", { content: "Yay" });
                    }
                }, function (path, resource) {
                    if (/coffee/.test(path)) {
                        return resolvedPromise("1.js", { content: "Nay" });
                    }
                }];

                this.session.addResource("script1.coffee", {
                    content: "a = 'No vars, no semicolons'"
                });

                this.session.configure().then(function (conf) {
                    refute.defined(conf.resources["/1.js"]);
                    assert.match(conf.resources, { "/2.js": { content: "Yay" } });
                });
            },

            "should process file": function (done) {
                fakeFs.createFile("/tmp/script.coffee", "coffeescript");

                this.session.addFileAsResource("/tmp/script.coffee");

                this.session.configure().then(function (conf) {
                    refute.defined(conf.resources["/tmp/script.coffee"]);
                    assert.match(conf.resources, {
                        "/tmp/script.js": { content: "var coffeescript;" }
                    });

                    done();
                });
            }
        }
    },

    "getResource": {
        "should get resource at path": function () {
            this.session.addResource("/file.js", { content: "" });

            assert.equals(this.session.getResource("/file.js").content, "");
        },

        "should get resource at normalized path": function () {
            this.session.addResource("/file.js", { content: "" });

            assert.equals(this.session.getResource("file.js").content, "");
        }
    },

    "load": {
        "should add non-existent resource": function () {
            this.spy(this.session, "addResource");
            var resource = { content: "" };

            this.session.load("/src/buster.js", resource);

            assert.calledWith(this.session.addResource, "/src/buster.js", resource);
        },

        "should not add resource when none is provided": function () {
            this.session.addResource("/src/buster.js", { content: "" });
            this.spy(this.session, "addResource");

            this.session.load("/src/buster.js");

            refute.called(this.session.addResource);
        },

        "should throw when loading non-existent resource without content": function () {
            assert.exception(function () {
                this.session.load("/resource.js");
            }.bind(this), "TypeError");
        },

        "should add preloaded resource to load array": function () {
            this.session.addResource("/resource.js", { content: "" });

            this.session.load("/resource.js");

            assert.equals(this.session.loadResources, ["/resource.js"]);
        },

        "should add new resource to load array": function () {
            this.session.load("/resource.js", { content: "" });

            assert.equals(this.session.loadResources, ["/resource.js"]);
        },

        "should normalize path to resource": function () {
            this.session.load("resource.js", { content: "" });

            assert.equals(this.session.loadResources, ["/resource.js"]);
        },

        "should add several resources to load": function () {
            this.session.load("resource.js", { content: "" });
            this.session.load("styling.css", { content: "" });

            assert.equals(this.session.loadResources, ["/resource.js", "/styling.css"]);
        }
    },

    "addFileAsResource": {
        tearDown: function () {
            fakeFs.reset();
        },

        "should return promise": function () {
            fakeFs.createFile("/a/file.js", "alert('Hello world');");

            var promise = this.session.addFileAsResource("/a/file.js");

            assert.isObject(promise);
            assert.isFunction(promise.then);
        },

        "should reject promise if file is not found": function (done) {
            this.session.addFileAsResource("/path.js").then(function () {},
                                                            function (err) {
                refute.isNull(err);
                done();
            }.bind(this));
        },

        "with valid file": {
            setUp: function () {
                fakeFs.createFile("/path.js", "alert('Hello world');");
            },

            "should add contents of file to resource": function (done) {
                this.session.addFileAsResource("/path.js").then(function () {
                    assert.match(this.session.resources, {
                        "/path.js": { content: "alert('Hello world');" }
                    });

                    done();
                }.bind(this));
            },

            "should remove pending indicator of resource": function (done) {
                this.session.addFileAsResource("/path.js").then(function () {
                    refute.defined(this.session.resources["/path.js"].pending);
                    done();
                }.bind(this));
            },

            "should add file resource with meta data": function (done) {
                this.session.addFileAsResource("/path.js", {
                    headers: { "Content-Type": "text/javascript" }
                }).then(function () {
                    assert.equals(this.session.resources["/path.js"].headers, {
                        "Content-Type": "text/javascript"
                    });

                    done();
                }.bind(this));
            },

            "should add file resource with different path": function (done) {
                this.session.addFileAsResource("/path.js", {
                    path: "/javasripts/buster.js"
                }).then(function () {
                    assert.defined(this.session.resources["/javasripts/buster.js"]);
                    refute.defined(this.session.resources["/path.js"]);

                    done();
                }.bind(this));
            }
        },

        "configure": {
            "should pass session configuration when all files are loaded": function () {
                this.stub(fs, "readFile");

                this.session.addFileAsResource("/a.js");
                this.session.addFileAsResource("/b.js");
                this.session.addFileAsResource("/c.js");

                var done = this.spy(function (session) {
                    assert.match(session, {
                        resources: {
                            "/a.js": { content: "a.js" },
                            "/b.js": { content: "b.js" },
                            "/c.js": { content: "c.js" }
                        }
                    });
                });

                this.session.configure().then(done);

                fs.readFile.getCall(0).args[2](null, "a.js");
                refute.called(done);

                fs.readFile.getCall(1).args[2](null, "b.js");
                refute.called(done);

                fs.readFile.getCall(2).args[2](null, "c.js");
                assert.calledOnce(done);
            },

            "should pass error if a file does not exist": function () {
                this.stub(fs, "readFile");

                this.session.addFileAsResource("/a.js");
                this.session.addFileAsResource("/b.js");
                this.session.addFileAsResource("/c.js");

                var done = this.spy(function (err) {
                    assert.isObject(err);
                    assert.equals(err.message, "No such file");
                });

                this.session.configure().then(function () {}, done);

                fs.readFile.getCall(0).args[2](new Error("No such file"), "a.js");
                assert.calledOnce(done);
            },

            "should include load resources in configuration": function (done) {
                this.session.load("/a.js", { content: "// hey" });

                this.session.configure().then(function (configuration) {
                    assert.match(configuration, {
                        resources: { "/a.js": { content: "// hey" } },
                        load: ["/a.js"]
                    });

                    done();
                });
            },

            "should include empty load array in configuration": function (done) {
                this.session.addResource("/a.js", { content: "// hey" });

                this.session.configure().then(function (configuration) {
                    assert.equals(configuration.load, []);
                    done();
                });
            },

            "should include empty resources object in configuration": function (done) {
                this.session.configure().then(function (configuration) {
                    assert.equals(configuration, { resources: {}, load: [] });
                    done();
                });
            }
        }
    }
});

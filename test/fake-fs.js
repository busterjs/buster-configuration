var fs = require("fs");
var path = require("path");
var fileSystem = { "/": [] };

function get(filename) {
    var pieces = filename.replace(/\/$/, "").split("/"), curr = "", dir = fileSystem;
    pieces[0] = "/";

    for (var i = 0, l = pieces.length; i < l && dir != null; ++i) {
        curr += pieces[i];
        dir = dir[pieces[i]];
    }

    return dir;
}

function mkdir(filename) {
    var pieces = filename.replace(/\/$/, "").split("/"), curr = "", dir = fileSystem;
    pieces[0] = "/";

    for (var i = 0, l = pieces.length; i < l; ++i) {
        curr += pieces[i];
        curr += i > 0 ? "/" : "";

        if (dir[pieces[i]] && typeof dir[pieces[i]] != "object") {
            throw new Error(curr + " is not a directory");
        }

        dir[pieces[i]] = dir[pieces[i]] || {};
        dir = dir[pieces[i]];
    }

    return dir;
}

module.exports = {
    createFile: function (filename, contents) {
        filename = path.resolve(process.cwd(), filename);
        var dir = mkdir(path.dirname(filename));
        dir[path.basename(filename)] = contents;
    },

    readFile: function (filename, encoding, callback) {
        process.nextTick(function () {
            var contents = get(filename);

            if (!contents) {
                var error = new Error("ENOENT, No such file or directory '" +
                                      filename + "'");
                error.errno = 2;
                error.code = "ENOENT";
                error.path = filename;
                callback(error);
            } else {
                callback(null, contents);
            }
        });
    },

    use: function () {
        fs.readFile = this.readFile;
    },

    reset: function () {
        fileSystem = {};
    }
};

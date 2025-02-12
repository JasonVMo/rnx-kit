const path = require("path");

module.exports = {
  pipeline: {
    build: {
      dependsOn: ["^build"],
      cache: false,
    },
    lint: {
      dependsOn: [],
    },
    buildall: {
      dependsOn: ["lint", "^build"],
    },
    buildtsc: {
      type: "worker",
      dependsOn: ["^^buildtsc"],
      options: {
        maxWorkers: 1,
        worker: path.join(__dirname, "scripts/src/workers/tsc.js"),
      },
      cache: false,
    },
  },
  npmClient: "yarn",
};

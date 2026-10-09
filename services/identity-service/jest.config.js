module.exports = {
  testEnvironment: "node",
  moduleNameMapper: { "^/shared/(.*)$": "<rootDir>/../../shared/$1" },
  testPathIgnorePatterns: ["/node_modules/", "/tests/integration/"],
}

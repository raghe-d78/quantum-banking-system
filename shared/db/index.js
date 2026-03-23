const { Pool } = require("pg")

function createPool(database) {
  return new Pool({
    connectionString: `postgresql://root@cockroachdb:26257/${database}?sslmode=disable`
  })
}

module.exports = createPool